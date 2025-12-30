'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

export function useDuplicateDetection(empresaId?: number) {
  const router = useRouter();
  const [duplicates, setDuplicates] = useState<Set<number>>(new Set());
  const [isChecking, setIsChecking] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const checkDuplicates = useCallback(async () => {
    try {
      console.log('🔍 [useDuplicateDetection] Verificando duplicados...', { empresaId });
      setIsChecking(true);
      
      const response = await fetch('/api/documents/check-duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empresaId: empresaId || null }),
      });

      if (!response.ok) {
        throw new Error('Error al verificar duplicados');
      }

      const result = await response.json();
      
      console.log('✅ [useDuplicateDetection] Resultado:', result);
      
      // Extraer y guardar los IDs de documentos duplicados
      if (result.duplicates && Array.isArray(result.duplicates)) {
        const duplicateIds = new Set<number>();
        
        result.duplicates.forEach((dup: any) => {
          // Cada grupo de duplicados tiene un array de IDs
          if (dup.ids && Array.isArray(dup.ids)) {
            dup.ids.forEach((id: number) => duplicateIds.add(id));
          }
        });
        
        setDuplicates(duplicateIds);
        console.log('📊 [useDuplicateDetection] IDs duplicados encontrados:', Array.from(duplicateIds));
        console.log('🔢 [useDuplicateDetection] Total de documentos con duplicados:', duplicateIds.size);
      } else {
        setDuplicates(new Set());
        console.log('✨ [useDuplicateDetection] No se encontraron duplicados');
      }
      
      return result;
    } catch (error) {
      console.error('❌ [useDuplicateDetection] Error:', error);
      setDuplicates(new Set());
      return null;
    } finally {
      setIsChecking(false);
    }
  }, [empresaId]);

  // Polling automático cada 3 segundos
  useEffect(() => {
    // Verificar inmediatamente al montar
    checkDuplicates();
    
    // Configurar polling cada 3 segundos
    intervalRef.current = setInterval(() => {
      checkDuplicates();
    }, 3000);

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
    isChecking 
  };
}