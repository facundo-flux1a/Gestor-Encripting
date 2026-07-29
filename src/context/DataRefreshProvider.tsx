'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { notifyDocumentsUpdated } from '@/hooks/useDocumentEvents';

/**
 * Refresco global de datos.
 *
 * Las páginas de listado cargan sus datos con `useEffect` en el cliente, así que
 * `router.refresh()` por sí solo no las actualiza: sólo re-renderiza componentes
 * de servidor. La solución es una clave que las páginas agregan a las
 * dependencias de su efecto de carga; al incrementarla, vuelven a pedir datos.
 *
 * Se dispara desde dos lugares:
 *   - Automático: cuando la cola de ingesta termina (ver QueueTracker).
 *   - Manual: el botón de refrescar de la cabecera.
 */

type Motivo = 'manual' | 'cola-terminada' | 'otra-pestaña';

interface DataRefreshContextValue {
  /** Incluir en las dependencias del useEffect que carga datos. */
  refreshKey: number;
  /** Fuerza una recarga de datos en toda la app. */
  refresh: (motivo?: Motivo) => void;
  /** Verdadero durante un instante corto, para el spinner del botón. */
  isRefreshing: boolean;
  /** Momento del último refresco, o null si todavía no hubo ninguno. */
  lastRefreshedAt: Date | null;
}

const DataRefreshContext = React.createContext<DataRefreshContextValue | null>(null);

export function DataRefreshProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = React.useState<Date | null>(null);

  const refresh = React.useCallback(
    (motivo: Motivo = 'manual') => {
      setRefreshKey((k) => k + 1);
      setLastRefreshedAt(new Date());
      setIsRefreshing(true);

      // Componentes de servidor, por si alguna vista los usa.
      router.refresh();

      if (typeof window !== 'undefined') {
        // Compatibilidad con las vistas que ya escuchaban este evento.
        window.dispatchEvent(new CustomEvent('documentUploaded'));
      }

      // Avisar a las otras pestañas abiertas. No se reenvía cuando el refresco
      // vino de otra pestaña, para no rebotar el mensaje indefinidamente.
      if (motivo !== 'otra-pestaña') {
        notifyDocumentsUpdated('DOCUMENTS_UPDATED');
      }

      window.setTimeout(() => setIsRefreshing(false), 600);
    },
    [router]
  );

  // Escuchar refrescos originados en otras pestañas.
  React.useEffect(() => {
    if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return;

    const channel = new BroadcastChannel('document-updates');
    channel.onmessage = () => refresh('otra-pestaña');

    return () => channel.close();
  }, [refresh]);

  const value = React.useMemo(
    () => ({ refreshKey, refresh, isRefreshing, lastRefreshedAt }),
    [refreshKey, refresh, isRefreshing, lastRefreshedAt]
  );

  return <DataRefreshContext.Provider value={value}>{children}</DataRefreshContext.Provider>;
}

/**
 * Devuelve el contexto de refresco. Fuera del provider (por ejemplo en las
 * páginas de login) devuelve valores neutros en vez de romper.
 */
export function useDataRefresh(): DataRefreshContextValue {
  const ctx = React.useContext(DataRefreshContext);
  if (!ctx) {
    return {
      refreshKey: 0,
      refresh: () => {},
      isRefreshing: false,
      lastRefreshedAt: null,
    };
  }
  return ctx;
}
