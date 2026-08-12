'use client';

import { useEffect, useRef } from 'react';
import { driver, type DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';
import { useUploadQueueTutorial } from '@/context/UploadQueueTutorialProvider';
import { useUploadQueue } from '@/context/UploadQueueProvider';
import { injectSkipButton, removeSkipButton } from '@/lib/tutorial-utils';

const TUTORIAL_STYLE_ID = 'upload-queue-tutorial-styles';

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
  }

  body:has(.driver-overlay) .driver-popover,
  body:has(.driver-overlay) .driver-popover * {
    pointer-events: auto !important;
  }

  .driver-active-element {
    box-shadow: 0 0 0 4px hsla(var(--primary) / 0.3) !important;
  }
`;

const steps: DriveStep[] = [
  {
    element: '[data-tutorial="queue-header"]',
    popover: {
      title: 'Cola de Subidas',
      description: 'Aquí ves el progreso en tiempo real de cada documento que la IA está procesando. Los archivos se encolan automáticamente al subir.',
      side: 'bottom' as any,
      align: 'start' as any,
    },
  },
  {
    element: '[data-tutorial="queue-stats"]',
    popover: {
      title: 'Estado General',
      description: 'De un vistazo: cuántos documentos están en cola, cuántos ya fueron guardados y cuántos están pausados por cuota.',
      side: 'bottom' as any,
      align: 'center' as any,
    },
  },
  {
    element: '[data-tutorial="queue-search"]',
    popover: {
      title: 'Búsqueda y Filtros',
      description: 'Buscá por nombre o ID de subida. Podés usar los filtros para filtrar por estado (en proceso, completado, pausado, fallido), fecha o empresa.',
      side: 'bottom' as any,
      align: 'center' as any,
    },
  },
  {
    element: '[data-tutorial="queue-jobs"]',
    popover: {
      title: 'Tarjetas de Proceso y Limpieza',
      description: 'Cada tarjeta muestra el avance de la IA. Podés eliminar tarjetas individuales o usar "Marcar todos vistos" para limpiar el panel. Descartar un registro SOLO quita el historial visual de subida, NUNCA elimina los documentos guardados en el sistema.',
      side: 'top' as any,
      align: 'center' as any,
    },
  },
  {
    element: '[data-tutorial="queue-refresh"]',
    popover: {
      title: 'Actualización Automática',
      description: 'La cola se refresca cada 3 segundos mientras está abierta. También podés forzar una actualización manual con este botón.',
      side: 'bottom' as any,
      align: 'end' as any,
    },
  },
  {
    element: 'body',
    popover: {
      title: 'Todo listo',
      description: 'Ya sabés cómo monitorear el procesamiento de tus documentos en tiempo real. La cola seguirá actualizándose en segundo plano aunque la cierres.',
      side: 'bottom' as any,
      align: 'center' as any,
    },
  },
];

export function UploadQueueTutorial() {
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

    // Solo dispara cuando la cola está ABIERTA y el tutorial está pendiente
    if (isLoading || !shouldShowTutorial || !isOpen || hasInitialized.current) return;

    // Espera la animación de entrada del Sheet (300ms) + margen de seguridad
    const timer = setTimeout(() => {
      hasInitialized.current = true;

      document.querySelectorAll('.driver-popover, .driver-overlay, .driver-stage, .driver-popover-wrapper, .driver-active-element').forEach(el => el.remove());
      if (driverRef.current) {
        try { driverRef.current.destroy(); } catch { /* ignore */ }
        driverRef.current = null;
      }

      // Filtrar steps cuyos elementos no existen en el DOM en este momento
      const availableSteps = steps.filter(step => {
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
    }, 700);

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
