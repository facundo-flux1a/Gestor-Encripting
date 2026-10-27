'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useCompanyContext } from '@/context/CompanyProvider';

const POLL_INTERVAL_MS = 60_000; // cada 60 segundos, igual que el testigo del Portal

/**
 * useMuvailSync
 *
 * Hook que llama periódicamente a /api/auth/muvail-sync para sincronizar
 * la empresa activa con el Portal de Muvail.
 *
 * - Si el usuario no entró via SSO → el endpoint responde {action:'none',reason:'sin_testigo'}
 *   y el hook no hace nada (costo casi cero).
 * - Si el usuario cambió de empresa en el Portal → recarga las empresas del CompanyProvider.
 * - Si el Portal cerró sesión → el endpoint cierra la sesión del Gestor y
 *   este hook redirige al login.
 */
export function useMuvailSync() {
  const router = useRouter();
  const { reloadCompanies } = useCompanyContext();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    async function sync() {
      try {
        const res = await fetch('/api/auth/muvail-sync', { method: 'GET' });
        if (!res.ok && res.status === 401) {
          // Sin sesión activa → no hay nada que sincronizar
          return;
        }
        const data = await res.json();
        if (data.action === 'logout') {
          // El Portal cerró sesión → redirigir al login
          router.replace('/auth/login');
        } else if (data.action === 'empresa_actualizada') {
          // El Portal cambió de empresa → recargar empresas en el CompanyProvider
          console.log('[useMuvailSync] Empresa actualizada por el Portal → recargando');
          await reloadCompanies();
        }
        // 'none': nada que hacer
      } catch {
        // Fallo de red transitorio → ignorar, reintentará en el próximo ciclo
      }
    }

    // Primera llamada al montar
    sync();

    // Polling cada 60s
    timerRef.current = setInterval(sync, POLL_INTERVAL_MS);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [router, reloadCompanies]);
}
