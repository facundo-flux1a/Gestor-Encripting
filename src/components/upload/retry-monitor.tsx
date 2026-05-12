'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';

/**
 * RetryMonitor - Componente 100% independiente del Upload Dialog.
 * 
 * Monitorea actividades fallidas directamente desde la DB vía API,
 * y dispara reintentos automáticos con sus propios toasts.
 * 
 * NO comparte estado, polling, ni timers con UploadProgressManager.
 */

const MAX_RETRIES = 3; // Máximo de reintentos automáticos (0→1, 1→2, 2→3)
const POLL_INTERVAL = 15000; // Cada 15 segundos chequea por fallos
const RETRY_DELAY = 8000; // Espera 8s antes de reintentar (dar tiempo a n8n)

interface FailedActivity {
  id: number;
  documento_nombre: string;
  retry_count: number;
  upload_id: string;
}

interface RetryMonitorProps {
  userId: number | null;
}

export function RetryMonitor({ userId }: RetryMonitorProps) {
  const { toast } = useToast();
  
  // Tracking: qué actividades ya estamos reintentando (evita duplicados)
  const activeRetriesRef = useRef<Set<number>>(new Set());
  // Tracking: toasts ya mostrados para cada par (activityId, retryCount)
  const shownToastsRef = useRef<Set<string>>(new Set());

  const checkAndRetry = useCallback(async () => {
    if (!userId) return;

    try {
      // Consultar actividades fallidas con reintentos disponibles
      const res = await fetch(
        `/api/activity/failed-for-retry?userId=${userId}`,
        { cache: 'no-store' }
      );

      if (!res.ok) return;

      const data = await res.json();
      const failures: FailedActivity[] = data.activities || [];

      if (failures.length === 0) return;

      console.log(`🤖 [RetryMonitor] Detectadas ${failures.length} actividades para reintentar`);

      for (const activity of failures) {
        // Si ya falló permanentemente (error de datos), skip
        if (shownToastsRef.current.has(`${activity.id}-permanent-fail`)) {
          console.log(`🚫 [RetryMonitor] Actividad ${activity.id} marcada como irrecuperable, saltando`);
          continue;
        }

        // Si ya estamos reintentando esta actividad, skip
        if (activeRetriesRef.current.has(activity.id)) {
          console.log(`⏭️ [RetryMonitor] Actividad ${activity.id} ya en proceso, saltando`);
          continue;
        }

        // Marcar como "en proceso"
        activeRetriesRef.current.add(activity.id);

        const attempt = (activity.retry_count || 0) + 1;
        const toastKey = `${activity.id}-${attempt}`;

        // Mostrar toast solo si no lo mostramos ya para este intento
        if (!shownToastsRef.current.has(toastKey)) {
          shownToastsRef.current.add(toastKey);

          const toastId = `retry-${activity.id}-${attempt}-${Date.now()}`;
          console.log(`🔔 [RetryMonitor] Toast: "${activity.documento_nombre}" - Intento ${attempt}/${MAX_RETRIES}`);

          toast({
            id: toastId,
            title: "🔄 Reintentando automáticamente",
            description: `"${activity.documento_nombre || 'Archivo'}" falló. Iniciando intento ${attempt}/${MAX_RETRIES}...`,
            className: "bg-indigo-600 text-white border-none shadow-lg font-medium",
            duration: 8000,
          });
        }

        // Programar el reintento real con delay
        setTimeout(async () => {
          try {
            console.log(`🚀 [RetryMonitor] Ejecutando reintento para Actividad ${activity.id} (Intento ${attempt}/${MAX_RETRIES})`);
            const retryRes = await fetch(`/api/activity/${activity.id}/retry`, { method: 'POST' });

            if (retryRes.ok) {
              console.log(`✅ [RetryMonitor] Reintento enviado para Actividad ${activity.id}`);
              
              // 🆕 RE-AGREGAR AL MANAGER DE PROGRESO
              // Esto hace que el "modal" (card) reaparezca para mostrar el progreso del reintento
              if (typeof window !== 'undefined' && (window as any).__uploadProgressManager) {
                console.log(`📡 [RetryMonitor] Notificando al manager el reintento de: ${activity.upload_id}`);
                (window as any).__uploadProgressManager.addUpload(activity.upload_id, activity.documento_nombre);
              }
            } else {
              const errData = await retryRes.json().catch(() => ({}));
              console.error(`❌ [RetryMonitor] Error en reintento Actividad ${activity.id}:`, errData);
              // Marcar como "ya intentado" para no volver a intentar este ciclo
              shownToastsRef.current.add(`${activity.id}-permanent-fail`);
            }
          } catch (err) {
            console.error(`❌ [RetryMonitor] Fallo de red en reintento Actividad ${activity.id}:`, err);
          } finally {
            // Liberar para que pueda detectar el próximo fallo
            activeRetriesRef.current.delete(activity.id);
          }
        }, RETRY_DELAY);
      }
    } catch (error) {
      console.error('❌ [RetryMonitor] Error en chequeo:', error);
    }
  }, [userId, toast]);

  useEffect(() => {
    if (!userId) return;

    console.log('🛡️ [RetryMonitor] Iniciando monitor de reintentos autónomos');

    // Primera verificación inmediata
    const initialTimeout = setTimeout(checkAndRetry, 5000); // Esperar 5s al cargar
    
    // Polling periódico
    const interval = setInterval(checkAndRetry, POLL_INTERVAL);

    return () => {
      console.log('🛡️ [RetryMonitor] Deteniendo monitor');
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, [userId, checkAndRetry]);

  // Este componente no renderiza nada visible
  return null;
}
