'use client';

import { useEffect, useRef } from 'react';
import { driver, type DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';
import { useUploadQueueTutorial } from '@/context/UploadQueueTutorialProvider';
import { useUploadQueue } from '@/context/UploadQueueProvider';
import { injectSkipButton, removeSkipButton } from '@/lib/tutorial-utils';

const TUTORIAL_STYLE_ID = 'upload-queue-tutorial-mobile-styles';

const TUTORIAL_STYLES = `
  .driver-overlay {
    pointer-events: auto !important;
  }

  #driver-page-overlay,
  #driver-highlighted-element-stage,
  .driver-overlay svg {
    pointer-events: none !important;
  }

  .driver-active-element,
  .driver-active-element * {
    pointer-events: none !important;
    cursor: default !important;
  }

  .driver-popover,
  .driver-popover-wrapper,
  .driver-popover *,
  .driver-popover button {
    pointer-events: auto !important;
    cursor: pointer !important;
    touch-action: manipulation !important;
  }

  body:has(.driver-overlay) .driver-popover,
  body:has(.driver-overlay) .driver-popover * {
    pointer-events: auto !important;
  }

  .driver-active-element {
    box-shadow: 0 0 0 4px hsla(var(--primary) / 0.3) !important;
  }

  .driver-popover-next-btn,
  .driver-popover-prev-btn,
  .driver-popover-close-btn {
    min-height: 44px !important;
    min-width: 44px !important;
    touch-action: manipulation !important;
  }
`;

const mobileSteps: DriveStep[] = [
  {
    element: '[data-tutorial="queue-header"]',
    popover: {
      title: 'Cola de Subidas',
      description: 'Progreso en tiempo real del procesamiento de documentos por la IA.',
      side: 'bottom' as any,
      align: 'start' as any,
    },
  },
  {
    element: '[data-tutorial="queue-stats"]',
    popover: {
      title: 'Estado General',
      description: 'En cola, guardados y pausados de un vistazo.',
      side: 'bottom' as any,
      align: 'center' as any,
    },
  },
  {
    element: '[data-tutorial="queue-search"]',
    popover: {
      title: 'Búsqueda y Filtros',
      description: 'Filtrá por nombre, ID, estado (proceso/completado/fallido/pausado), fecha o empresa.',
      side: 'bottom' as any,
      align: 'center' as any,
    },
  },
  {
    element: '[data-tutorial="queue-jobs"]',
    popover: {
      title: 'Documentos y Limpieza',
      description: 'Muestra el paso actual de la IA. Descartar o marcar todos como vistos sólo quita el rastro visual de la subida, NO elimina los documentos guardados.',
      side: 'top' as any,
      align: 'center' as any,
    },
  },
  {
    element: 'body',
    popover: {
      title: 'Listo',
      description: 'La cola se actualiza cada 3 segundos. Podés cerrarla y el procesamiento continúa en segundo plano.',
      side: 'bottom' as any,
      align: 'center' as any,
    },
  },
];

export function UploadQueueTutorialMobile() {
  const { shouldShowTutorial, isLoading, markAsCompleted } = useUploadQueueTutorial();
  const { isOpen } = useUploadQueue();
  const hasInitialized = useRef(false);
  const driverRef = useRef<ReturnType<typeof driver> | null>(null);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    if (!document.getElementById(TUTORIAL_STYLE_ID)) {
      const style = document.createElement('style');
      style.id = TUTORIAL_STYLE_ID;
      style.textContent = TUTORIAL_STYLES;
      document.head.appendChild(style);
    }

    return () => {
      document.getElementById(TUTORIAL_STYLE_ID)?.remove();
    };
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem('force_tutorial_upload_queue') === 'true') {
      hasInitialized.current = false;
    }

    if (isLoading || !shouldShowTutorial || !isOpen || hasInitialized.current) return;

    const timer = setTimeout(() => {
      hasInitialized.current = true;

      document.querySelectorAll('.driver-popover, .driver-overlay, .driver-stage, .driver-popover-wrapper, .driver-active-element').forEach(el => el.remove());
      if (driverRef.current) {
        try { driverRef.current.destroy(); } catch { /* ignore */ }
        driverRef.current = null;
      }

      const availableSteps = mobileSteps.filter(step => {
        if (typeof step.element === 'string' && step.element !== 'body') {
          return !!document.querySelector(step.element as string);
        }
        return true;
      });

      const driverObj = driver({
        showProgress: true,
        showButtons: ['next', 'previous', 'close'],
        animate: true,
        allowClose: true,
        overlayOpacity: 0.75,
        disableActiveInteraction: true,
        steps: availableSteps,
        nextBtnText: 'Siguiente',
        prevBtnText: 'Atrás',
        doneBtnText: '¡Listo!',
        onHighlightStarted: () => {
          setTimeout(() => {
            injectSkipButton(() => finishTutorial(driverObj, markAsCompleted));
          }, 50);
        },
        onNextClick: (_element, _step, options) => {
          const idx = options.index ?? options.state.activeIndex ?? 0;
          if (idx >= availableSteps.length - 1) {
            finishTutorial(driverObj, markAsCompleted);
          } else {
            driverObj.moveNext();
          }
        },
        onDoneClick: () => {
          finishTutorial(driverObj, markAsCompleted);
        },
        onPrevClick: () => {
          driverObj.movePrevious();
        },
        onCloseClick: () => {
          finishTutorial(driverObj, markAsCompleted);
        },
        onDestroyStarted: () => {
          removeSkipButton();
        },
      });

      driverRef.current = driverObj;
      driverObj.drive();
    }, 900); // Margen extra en mobile por la animación del Sheet

    return () => clearTimeout(timer);
  }, [isLoading, shouldShowTutorial, isOpen, markAsCompleted]);

  useEffect(() => {
    return () => {
      if (driverRef.current) {
        try { driverRef.current.destroy(); } catch { /* ignore */ }
        driverRef.current = null;
      }
    };
  }, []);

  return null;
}

function finishTutorial(
  driverObj: ReturnType<typeof driver>,
  markAsCompleted: () => Promise<void>
) {
  removeSkipButton();
  void markAsCompleted();
  setTimeout(() => {
    try { driverObj.destroy(); } catch { /* ignore */ }
  }, 100);
}
