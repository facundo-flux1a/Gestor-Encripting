'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export interface DocumentNavigationState {
  prevId: number | null;
  nextId: number | null;
  currentIndex: number | null;
  totalCount: number | null;
  navigateToPrev: () => void;
  navigateToNext: () => void;
  onNavigatePrev: () => void;
  onNavigateNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
}

export function useDocumentNavigation(
  currentId: number | null,
  empresaId?: number | null,
  isDirty: boolean = false
): DocumentNavigationState {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [navigation, setNavigation] = useState<{
    prevId: number | null;
    nextId: number | null;
    currentIndex: number | null;
    totalCount: number | null;
  }>({
    prevId: null,
    nextId: null,
    currentIndex: null,
    totalCount: null,
  });

  // Cargar navegación desde sessionStorage o API
  useEffect(() => {
    if (!currentId || isNaN(currentId)) return;

    let foundInSession = false;

    try {
      const stored = sessionStorage.getItem('document_navigation_ids');
      if (stored) {
        const ids: number[] = JSON.parse(stored);
        if (Array.isArray(ids) && ids.length > 0) {
          const index = ids.indexOf(currentId);
          if (index !== -1) {
            foundInSession = true;
            setNavigation({
              prevId: index > 0 ? ids[index - 1] : null,
              nextId: index < ids.length - 1 ? ids[index + 1] : null,
              currentIndex: index + 1,
              totalCount: ids.length,
            });
          }
        }
      }
    } catch (err) {
      console.warn('⚠️ [useDocumentNavigation] Error leyendo sessionStorage:', err);
    }

    if (!foundInSession) {
      const query = empresaId ? `?companyId=${empresaId}` : '';
      fetch(`/api/documents/${currentId}/adjacent${query}`)
        .then((res) => {
          if (!res.ok) throw new Error('API navigation error');
          return res.json();
        })
        .then((data) => {
          if (data && typeof data === 'object') {
            setNavigation({
              prevId: data.prevId ?? null,
              nextId: data.nextId ?? null,
              currentIndex: data.currentIndex ?? null,
              totalCount: data.totalCount ?? null,
            });
            if (Array.isArray(data.ids) && data.ids.length > 0) {
              sessionStorage.setItem('document_navigation_ids', JSON.stringify(data.ids));
            }
          }
        })
        .catch((err) => {
          console.error('❌ [useDocumentNavigation] Error API adyacentes:', err);
        });
    }
  }, [currentId, empresaId]);

  const navigateTo = useCallback(
    (targetId: number | null) => {
      if (!targetId) return;

      if (isDirty) {
        const confirmLeave = window.confirm(
          'Tienes cambios sin guardar en este documento. ¿Deseas cambiar de documento de todos modos?'
        );
        if (!confirmLeave) return;
      }

      const queryString = searchParams ? searchParams.toString() : '';
      const url = `/documento/${targetId}${queryString ? `?${queryString}` : ''}`;
      router.push(url);
    },
    [router, searchParams, isDirty]
  );

  const navigateToPrev = useCallback(() => {
    navigateTo(navigation.prevId);
  }, [navigateTo, navigation.prevId]);

  const navigateToNext = useCallback(() => {
    navigateTo(navigation.nextId);
  }, [navigateTo, navigation.nextId]);

  // Atajos de teclado (Flecha Izquierda / Derecha)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignorar si el usuario está escribiendo en un input, textarea o select salvo que use Alt
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if (isInput && !e.altKey) return;

      if (e.key === 'ArrowLeft' || (e.altKey && e.key === 'ArrowLeft')) {
        if (navigation.prevId) {
          e.preventDefault();
          navigateToPrev();
        }
      } else if (e.key === 'ArrowRight' || (e.altKey && e.key === 'ArrowRight')) {
        if (navigation.nextId) {
          e.preventDefault();
          navigateToNext();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigation.prevId, navigation.nextId, navigateToPrev, navigateToNext]);

  return {
    prevId: navigation.prevId,
    nextId: navigation.nextId,
    currentIndex: navigation.currentIndex,
    totalCount: navigation.totalCount,
    navigateToPrev,
    navigateToNext,
    onNavigatePrev: navigateToPrev,
    onNavigateNext: navigateToNext,
    hasPrev: navigation.prevId !== null,
    hasNext: navigation.nextId !== null,
  };
}
