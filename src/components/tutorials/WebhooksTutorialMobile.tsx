'use client';

import { useEffect, useRef } from 'react';
import { driver, type DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';
import { useWebhooksTutorial } from '@/context/WebhooksProvider';
import { injectSkipButton, removeSkipButton } from '@/lib/tutorial-utils';

const TUTORIAL_STYLE_ID = 'webhooks-tutorial-mobile-styles';

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

export function WebhooksTutorialMobile() {
  const { shouldShowTutorial, isLoading, markAsCompleted } = useWebhooksTutorial();
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
    if (typeof window !== 'undefined' && localStorage.getItem('force_tutorial_webhooks') === 'true') {
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
          element: '[data-tutorial="webhooks-header"]',
          popover: {
            title: 'Webhooks',
            description: 'Tu sistema recibe notificaciones automaticas de eventos sin necesidad de polling.',
            side: 'bottom' as any,
            align: 'start' as any,
          },
        },
        {
          element: '[data-tutorial="webhooks-create-btn"]',
          popover: {
            title: 'Crear Webhook',
            description: 'Registra una URL de destino. El Gestor enviara un POST automatico por cada evento suscrito.',
            side: 'bottom' as any,
            align: 'end' as any,
          },
        },
        {
          element: '[data-tutorial="webhooks-list"]',
          popover: {
            title: 'Webhooks Registrados',
            description: 'Cada fila tiene la URL, estado activo/inactivo, eventos suscritos y la clave secreta HMAC.',
            side: 'top' as any,
            align: 'center' as any,
          },
        },
        {
          element: '[data-tutorial="webhooks-events"]',
          popover: {
            title: 'Eventos',
            description: 'Suscribite a eventos especificos: listo_para_erp, requiere_atencion, resuelta_manualmente, modificado, eliminado.',
            side: 'bottom' as any,
            align: 'center' as any,
          },
        },
        {
          element: '[data-tutorial="webhooks-config"]',
          popover: {
            title: 'Estado',
            description: 'Solo los webhooks activos reciben notificaciones. Activalo o desactivalo segun necesites.',
            side: 'top' as any,
            align: 'center' as any,
          },
        },
        {
          element: 'body',
          popover: {
            title: 'Listo!',
            description: 'Ya configuraste tus webhooks. Verifica la firma HMAC en tu servidor con tu clave secreta para mayor seguridad.',
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
        prevBtnText: 'Atras',
        doneBtnText: 'Listo!',
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
