'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { VisibilityState } from '@tanstack/react-table';

interface UseColumnVisibilityReturn {
  columnVisibility: VisibilityState;
  setColumnVisibility: (visibility: VisibilityState) => void;
  isLoading: boolean;
}

export function useColumnVisibility(
  viewId: string,
  defaultHidden: string[] = []
): UseColumnVisibilityReturn {
  const defaultVisibility: VisibilityState = {};
  defaultHidden.forEach((col) => { defaultVisibility[col] = false; });

  const [columnVisibility, setColumnVisibilityState] = useState<VisibilityState>(defaultVisibility);
  const [isLoading, setIsLoading] = useState(true);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/column-visibility?viewId=${viewId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.columnVisibility && typeof data.columnVisibility === 'object') {
            setColumnVisibilityState({ ...defaultVisibility, ...data.columnVisibility });
          }
        }
      } catch {
        // usar defaults
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [viewId]);

  const setColumnVisibility = useCallback((visibility: VisibilityState) => {
    setColumnVisibilityState(visibility);

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await fetch('/api/column-visibility', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ viewId, columnVisibility: visibility }),
        });
      } catch {
        // silent
      }
    }, 400);
  }, [viewId]);

  return { columnVisibility, setColumnVisibility, isLoading };
}
