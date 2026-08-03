'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

// Candado global para evitar que dos instancias del hook llamen al backend al mismo tiempo
let _checkInFlight = false;

export interface DuplicateGroup {
  numero: string;
  ids: number[];
  docs?: { id: number; tipo: string; seccion?: string; empresa_nombre?: string }[];
}

export function useDuplicateDetection(empresaId?: number) {
  const router = useRouter();
  const [duplicates, setDuplicates] = useState<Set<number>>(new Set());
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);
  const [isChecking, setIsChecking] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const checkDuplicates = useCallback(async () => {
    // Si ya hay una petición en vuelo (de otra instancia del hook), no disparar otra
    if (_checkInFlight) {
      console.log('⏭️ [useDuplicateDetection] Petición ya en vuelo, ignorando esta.');
      return null;
    }
    _checkInFlight = true;
    try {
      console.log('🔍 [useDuplicateDetection] Verificando duplicados...', { empresaId });
      setIsChecking(true);
      
      const response = await fetch('/api/documents/check-duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empresaId: empresaId || null }),
      });

      if (!response.ok) {
        let bodyText = '';
        try {
          bodyText = await response.text();
        } catch {
          bodyText = '(sin body)';
        }
        console.error('❌ [useDuplicateDetection] HTTP no OK', {
          status: response.status,
          statusText: response.statusText,
          body: bodyText.slice(0, 500),
          empresaId,
        });
        setDuplicates(new Set());
        setDuplicateGroups([]);
        return null;
      }

      const result = await response.json();
      
      console.log('✅ [useDuplicateDetection] Resultado:', {
        groups: Array.isArray(result.duplicates) ? result.duplicates.length : 0,
        result,
      });
      
      // Extraer y guardar los IDs de documentos duplicados
      if (result.duplicates && Array.isArray(result.duplicates)) {
        const duplicateIds = new Set<number>();
        const groups: DuplicateGroup[] = [];
        
        result.duplicates.forEach((dup: any) => {
          if (dup.ids && Array.isArray(dup.ids)) {
            dup.ids.forEach((id: number) => duplicateIds.add(id));
            groups.push({ numero: dup.numero || 'Sin número', ids: dup.ids, docs: dup.docs || [] });
          }
        });
        
        setDuplicates(duplicateIds);
        setDuplicateGroups(groups);
        console.log('📊 [useDuplicateDetection] IDs duplicados encontrados:', Array.from(duplicateIds));
        console.log('🔢 [useDuplicateDetection] Total de documentos con duplicados:', duplicateIds.size);
      } else {
        setDuplicates(new Set());
        setDuplicateGroups([]);
        console.log('✨ [useDuplicateDetection] No se encontraron duplicados');
      }
      
      return result;
    } catch (error) {
      console.error('❌ [useDuplicateDetection] Error:', error);
      setDuplicates(new Set());
      setDuplicateGroups([]);
      return null;
    } finally {
      setIsChecking(false);
      _checkInFlight = false;
    }
  }, [empresaId]);

  // Polling automático cada 30 segundos
  useEffect(() => {
    // Verificar inmediatamente al montar
    checkDuplicates();
    
    // Configurar polling cada 30 segundos
    intervalRef.current = setInterval(() => {
      checkDuplicates();
    }, 30000);

    // Limpiar al desmontar
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [checkDuplicates]);

  return { 
    checkDuplicates, 
    duplicates,
    duplicateGroups,
    isChecking 
  };
}