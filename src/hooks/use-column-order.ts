// hooks/use-column-order.ts
'use client';

import { useState, useEffect, useCallback } from 'react';

// ========================================
// Hook para manejar el orden de columnas
// ========================================

interface UseColumnOrderReturn {
  columnOrder: string[];
  setColumnOrder: (order: string[]) => void;
  isLoading: boolean;
  isError: boolean;
  resetOrder: () => Promise<void>;
}

/**
 * Hook personalizado para manejar la persistencia del orden de columnas
 * 
 * @param viewId - Identificador único de la vista (ej: "documentos", "facturas", "clientes")
 * @param defaultOrder - Orden por defecto de las columnas
 * @returns Estado y funciones para manejar el orden de columnas
 */
export function useColumnOrder(
  viewId: string,
  defaultOrder: string[]
): UseColumnOrderReturn {
  const [columnOrder, setColumnOrderState] = useState<string[]>(defaultOrder);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);

  // ========================================
  // 1️⃣ Cargar orden guardado al montar
  // ========================================
  useEffect(() => {
    async function loadColumnOrder() {
      try {
        setIsLoading(true);
        setIsError(false);

        const response = await fetch(`/api/column-order?viewId=${viewId}`);

        if (!response.ok) {
          // Si no está autenticado o hay error, usar orden por defecto
          console.log(`ℹ️ [useColumnOrder] No hay orden guardado para "${viewId}", usando default`);
          setColumnOrderState(defaultOrder);
          return;
        }

        const data = await response.json();

        if (data.columnOrder && Array.isArray(data.columnOrder)) {
          console.log(`✅ [useColumnOrder] Orden cargado para "${viewId}":`, data.columnOrder);
          setColumnOrderState(data.columnOrder);
        } else {
          // No hay orden guardado, usar default
          console.log(`ℹ️ [useColumnOrder] No hay orden guardado, usando default`);
          setColumnOrderState(defaultOrder);
        }

      } catch (error) {
        console.error('❌ [useColumnOrder] Error cargando orden:', error);
        setIsError(true);
        setColumnOrderState(defaultOrder);
      } finally {
        setIsLoading(false);
      }
    }

    loadColumnOrder();
  }, [viewId]); // Solo depende de viewId, no de defaultOrder para evitar loops

  // ========================================
  // 2️⃣ Guardar orden cuando cambia
  // ========================================
  const setColumnOrder = useCallback(async (newOrder: string[]) => {
    // Actualizar UI inmediatamente (optimistic update)
    setColumnOrderState(newOrder);

    try {
      const response = await fetch('/api/column-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          viewId,
          columnOrder: newOrder,
        }),
      });

      if (!response.ok) {
        throw new Error('Error guardando orden');
      }

      console.log(`✅ [useColumnOrder] Orden guardado para "${viewId}"`);

    } catch (error) {
      console.error('❌ [useColumnOrder] Error guardando orden:', error);
      // Revertir a orden anterior en caso de error
      // En una implementación más robusta, podrías mantener el estado anterior
      setIsError(true);
    }
  }, [viewId]);

  // ========================================
  // 3️⃣ Resetear orden (volver al default)
  // ========================================
  const resetOrder = useCallback(async () => {
    try {
      const response = await fetch(`/api/column-order?viewId=${viewId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Error reseteando orden');
      }

      console.log(`✅ [useColumnOrder] Orden reseteado para "${viewId}"`);
      setColumnOrderState(defaultOrder);

    } catch (error) {
      console.error('❌ [useColumnOrder] Error reseteando orden:', error);
      setIsError(true);
    }
  }, [viewId, defaultOrder]);

  return {
    columnOrder,
    setColumnOrder,
    isLoading,
    isError,
    resetOrder,
  };
}