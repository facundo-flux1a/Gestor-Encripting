'use client';

import { useEffect, useRef } from 'react';
import { driver, type DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';
import { useComprobantesTutorial } from '@/context/ComprobantesTutorialProvider';
import { injectSkipButton, removeSkipButton } from '@/lib/tutorial-utils';

const MOBILE_TUTORIAL_STYLE_ID = 'comprobantes-tutorial-mobile-styles';

const MOBILE_TUTORIAL_STYLES = `
  /* Bloquear interacción de fondo en móvil mientras el tutorial está activo */
  body.driver-active main,
  body.driver-active header,
  body.driver-active [data-tutorial="comprobantes-filters"],
  body.driver-active [data-tutorial="comprobantes-filters"] * {
    pointer-events: none !important;
  }

  .driver-overlay {
    pointer-events: auto !important;
    cursor: default !important;
  }

  .driver-overlay path {
    pointer-events: auto !important;
    cursor: default !important;
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

  #tutorial-skip-btn,
  #tutorial-skip-btn * {
    pointer-events: auto !important;
    cursor: pointer !important;
  }

  /* Highlight con glow esmeralda / primary en móvil */
  .driver-active-element {
    outline: 2px solid hsl(var(--primary)) !important;
    box-shadow: 0 0 0 3px hsla(var(--primary) / 0.35) !important;
    border-radius: 8px !important;
  }

  /* Tarjeta Popover Glassmorphism Dark en móvil */
  .driver-popover {
    background-color: rgba(15, 23, 42, 0.96) !important;
    border: 1px solid hsla(var(--primary) / 0.5) !important;
    border-radius: 14px !important;
    color: #f8fafc !important;
    box-shadow: 0 20px 35px -8px rgba(0, 0, 0, 0.8), 0 0 20px hsla(var(--primary) / 0.2) !important;
    padding: 16px !important;
    max-width: 90vw !important;
  }

  .driver-popover-title {
    color: #ffffff !important;
    font-weight: 700 !important;
    font-size: 1rem !important;
    margin-bottom: 6px !important;
  }

  .driver-popover-description {
    color: #cbd5e1 !important;
    font-size: 0.825rem !important;
    line-height: 1.5 !important;
    white-space: pre-line !important;
  }

  .driver-popover-progress-text {
    color: #94a3b8 !important;
    font-size: 0.725rem !important;
  }

  .driver-popover-footer {
    margin-top: 12px !important;
    display: flex !important;
    align-items: center !important;
    gap: 8px !important;
  }

  .driver-popover-footer button {
    min-height: 44px !important;
    padding: 8px 14px !important;
    font-size: 0.825rem !important;
    border-radius: 8px !important;
    font-weight: 600 !important;
  }

  .driver-popover-next-btn {
    background-color: hsl(var(--primary)) !important;
    color: #ffffff !important;
    border: none !important;
    box-shadow: 0 3px 10px hsla(var(--primary) / 0.4) !important;
    transition: all 0.2s ease !important;
  }

  .driver-popover-next-btn:hover {
    background-color: hsl(var(--primary) / 0.9) !important;
  }

  .driver-popover-prev-btn {
    background: rgba(255, 255, 255, 0.08) !important;
    color: #cbd5e1 !important;
    border: 1px solid rgba(255, 255, 255, 0.2) !important;
  }

  .driver-popover-close-btn {
    display: none !important;
  }
`;

interface ComprobantesTutorialMobileProps {
  isDataLoading?: boolean;
}

export function ComprobantesTutorialMobile({ isDataLoading = false }: ComprobantesTutorialMobileProps) {
  const { shouldShowTutorial, isLoading, markAsCompleted } = useComprobantesTutorial();
  const hasStartedRef = useRef(false);
  const driverRef = useRef<ReturnType<typeof driver> | null>(null);
  const overlayTouchBlockerRef = useRef<((e: Event) => void) | null>(null);
  const markAsCompletedRef = useRef(markAsCompleted);

  useEffect(() => {
    markAsCompletedRef.current = markAsCompleted;
  }, [markAsCompleted]);

  const blockedEvents = ['touchstart', 'touchmove', 'touchend', 'mousedown', 'mouseup', 'click', 'pointerdown', 'pointerup', 'pointercancel'];

  const addGlobalTouchBlocker = () => {
    if (overlayTouchBlockerRef.current) return;
    const handler = (e: Event) => {
      const target = e.target as HTMLElement;
      if (!target) return;

      const isPopover = target.closest('.driver-popover') || target.closest('.driver-popover-wrapper') || target.closest('#tutorial-skip-btn') || target.closest('[data-radix-portal]');
      if (!isPopover) {
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
    };

    blockedEvents.forEach(evt => {
      document.addEventListener(evt, handler, { passive: false, capture: true });
    });
    overlayTouchBlockerRef.current = handler;
  };

  const removeGlobalTouchBlocker = () => {
    if (overlayTouchBlockerRef.current) {
      blockedEvents.forEach(evt => {
        document.removeEventListener(evt, overlayTouchBlockerRef.current as any, { capture: true });
      });
      overlayTouchBlockerRef.current = null;
    }
  };

  useEffect(() => {
    if (typeof document === 'undefined') return;

    if (!document.getElementById(MOBILE_TUTORIAL_STYLE_ID)) {
      const style = document.createElement('style');
      style.id = MOBILE_TUTORIAL_STYLE_ID;
      style.textContent = MOBILE_TUTORIAL_STYLES;
      document.head.appendChild(style);
    }

    return () => {
      document.getElementById(MOBILE_TUTORIAL_STYLE_ID)?.remove();
      removeGlobalTouchBlocker();
    };
  }, []);

  useEffect(() => {
    return () => {
      removeGlobalTouchBlocker();
      removeSkipButton();
      if (driverRef.current) {
        try { driverRef.current.destroy(); } catch { /* ignore */ }
        driverRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem('force_tutorial_comprobantes') === 'true') {
      hasStartedRef.current = false;
    }

    if (isLoading || isDataLoading || !shouldShowTutorial || hasStartedRef.current) {
      return;
    }

    const timer = setTimeout(() => {
      if (hasStartedRef.current) return;
      hasStartedRef.current = true;

      document.querySelectorAll('.driver-popover, .driver-overlay, .driver-stage, .driver-popover-wrapper, .driver-active-element').forEach(el => el.remove());
      if (driverRef.current) {
        try { driverRef.current.destroy(); } catch { /* ignore */ }
        driverRef.current = null;
      }

      addGlobalTouchBlocker();

      const allPossibleSteps: DriveStep[] = [
        {
          element: '[data-tutorial="comprobantes-header"]',
          popover: {
            title: '🗂️ Comprobantes Móvil',
            description: 'Selecciona y exporta tus facturas y tickets en un paquete ZIP descargable.',
            side: 'bottom' as any,
          },
        },
        {
          element: '[data-tutorial="comprobantes-filters"]',
          popover: {
            title: 'Filtros Rápidos',
            description: 'Aplica filtros de tipo, trimestre, año o proveedor para encontrar comprobantes al instante.',
            side: 'bottom' as any,
          },
        },
        {
          element: '[data-tutorial="comprobantes-selection-bar"]',
          popover: {
            title: 'Selección en Bloque',
            description: 'Toca la casilla para marcar todos los documentos filtrados de una sola vez.',
            side: 'bottom' as any,
          },
        },
        {
          element: '[data-tutorial="comprobantes-table"]',
          popover: {
            title: 'Exportación a Correo',
            description: 'Al seleccionar comprobantes, podrás generar el archivo ZIP y recibirlo en tu email.',
            side: 'top' as any,
          },
        },
        {
          element: 'body',
          popover: {
            title: '¡Listo en Móvil!',
            description: 'Ya sabes cómo empaquetar y descargar comprobantes desde tu teléfono.',
          },
        },
      ];

      const validSteps = allPossibleSteps;

      const driverInstance = driver({
        showProgress: true,
        steps: validSteps,
        nextBtnText: 'Siguiente →',
        prevBtnText: '← Anterior',
        doneBtnText: '¡Entendido!',
        allowClose: false,
        showButtons: ['next', 'previous'],
        animate: true,
        overlayOpacity: 0.75,
        waitForElement: 2500,
        onHighlightStarted: () => {
          injectSkipButton(() => {
            removeGlobalTouchBlocker();
            markAsCompletedRef.current();
            removeSkipButton();
            driverRef.current?.destroy();
          });
        },
        onNextClick: (element, step, options) => {
          const idx = options.state.activeIndex ?? 0;
          const totalSteps = validSteps.length;
          if (idx === totalSteps - 1) {
            removeGlobalTouchBlocker();
            markAsCompletedRef.current();
            removeSkipButton();
            driverInstance.destroy();
          } else {
            driverInstance.moveNext();
          }
        },
        onPrevClick: () => {
          driverInstance.movePrevious();
        },
      });

      driverRef.current = driverInstance;
      driverInstance.drive();
    }, 250);

    return () => {
      clearTimeout(timer);
    };
  }, [shouldShowTutorial, isLoading, isDataLoading]);

  return null;
}
