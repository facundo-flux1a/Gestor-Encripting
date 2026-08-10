'use client';

import { useEffect, useRef } from 'react';
import { driver, type DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';
import { useHealthCheckTutorial } from '@/context/HealthCheckProvider';
import { injectSkipButton, removeSkipButton } from '@/lib/tutorial-utils';

const TUTORIAL_STYLE_ID = 'health-check-tutorial-mobile-styles';

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

export function HealthCheckTutorialMobile() {
  const { shouldShowTutorial, isLoading, markAsCompleted } = useHealthCheckTutorial();
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
    if (typeof window !== 'undefined' && localStorage.getItem('force_tutorial_health_check') === 'true') {
      hasInitialized.current = false;
    }

    if (isLoading || !shouldShowTutorial || hasInitialized.current) return;

    const timer = setTimeout(() => {
      hasInitialized.current = true;

      document.querySelectorAll('.driver-popover, .driver-overlay, .driver-stage, .driver-popover-wrapper, .driver-active-element').forEach(el => el.remove());
      if (driverRef.current) {
        try { driverRef.current.destroy(); } catch { /* ignore */ }
        driverRef.current = null;
      }

      const steps: DriveStep[] = [
        {
          element: '[data-tutorial="health-header"]',
          popover: {
            title: 'Salud Documental',
            description: 'Bienvenido al centro de diagnóstico. Aquí auditamos la integridad de tus documentos.',
            side: 'bottom' as any,
            align: 'start' as any,
          },
        },
        {
          element: '[data-tutorial="health-kpis"]',
          popover: {
            title: 'Indicadores Clave',
            description: 'Score de Salud y control de descuadres en tiempo real.',
            side: 'bottom' as any,
            align: 'center' as any,
          },
        },
        {
          element: '[data-tutorial="health-table"]',
          popover: {
            title: 'Incidencias',
            description: 'Detalle de facturas con errores matemáticos o de datos.',
            side: 'top' as any,
            align: 'center' as any,
          },
        },
        {
          element: '[data-tutorial="health-ia"]',
          popover: {
            title: 'Diagnóstico IA',
            description: 'Usa Muvail AI para analizar y corregir errores automáticamente.',
            side: 'top' as any,
            align: 'center' as any,
          },
        },
        {
          element: '[data-tutorial="health-validate"]',
          popover: {
            title: 'Validación de Incidencias',
            description: 'Presiona Validar para confirmar la corrección o Ver para abrir el detalle del documento.',
            side: 'top' as any,
            align: 'center' as any,
          },
        },
        {
          element: 'body',
          popover: {
            title: 'Todo listo',
            description: 'Ya conoces cómo revisar y resolver las incidencias en el Centro de Seguridad.',
            side: 'bottom' as any,
            align: 'center' as any,
          },
        },
      ];

      const driverObj = driver({
        showProgress: true,
        showButtons: ['next', 'previous', 'close'],
        animate: true,
        allowClose: true,
        overlayOpacity: 0.75,
        disableActiveInteraction: true,
        steps,
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
          if (idx >= steps.length - 1) {
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
    }, 1000);

    return () => clearTimeout(timer);
  }, [isLoading, shouldShowTutorial, markAsCompleted]);

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
