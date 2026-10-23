'use client';

import { useEffect, useRef } from 'react';
import { driver, type DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';
import { useSiiTutorial } from '@/context/SiiTutorialProvider';
import { injectSkipButton, removeSkipButton } from '@/lib/tutorial-utils';

const MOBILE_TUTORIAL_STYLE_ID = 'sii-tutorial-mobile-styles';

const MOBILE_TUTORIAL_STYLES = `
  /* Bloquear interacción de fondo en móvil mientras el tutorial está activo */
  body.driver-active main,
  body.driver-active header,
  body.driver-active [data-tutorial="sii-tabs-bar"],
  body.driver-active [data-tutorial="sii-tabs-bar"] * {
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

interface SiiTutorialMobileProps {
  isDataLoading?: boolean;
}

export function SiiTutorialMobile({ isDataLoading = false }: SiiTutorialMobileProps) {
  const { shouldShowTutorial, isLoading, markAsCompleted } = useSiiTutorial();
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
    if (typeof window !== 'undefined' && localStorage.getItem('force_tutorial_sii') === 'true') {
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

      const ensureTab = (tab: 'credenciales' | 'enviar' | 'emitidas' | 'recibidas' | 'llaa' | 'documentos_locales') => {
        const btn = document.querySelector(`[data-tutorial="sii-tab-${tab}"]`) as HTMLElement;
        if (btn) btn.click();
      };

      const getTabForSelector = (selector: string): 'credenciales' | 'enviar' | 'emitidas' | 'recibidas' | 'llaa' | 'documentos_locales' => {
        if (selector.includes('enviar')) return 'enviar';
        if (selector.includes('emitidas')) return 'emitidas';
        if (selector.includes('recibidas')) return 'recibidas';
        if (selector.includes('llaa')) return 'llaa';
        if (selector.includes('locales')) return 'documentos_locales';
        return 'credenciales';
      };

      const allPossibleSteps: DriveStep[] = [
        {
          element: '[data-tutorial="sii-header"]',
          popover: {
            title: '🏛️ SII AEAT Móvil',
            description: 'Conexión oficial con la AEAT para suministrar y consultar facturas en tiempo real.',
            side: 'bottom' as any,
          },
        },
        {
          element: '[data-tutorial="sii-cert-pill"]',
          popover: {
            title: 'Estado del Certificado',
            description: 'Toca aquí para comprobar la validez de tu certificado digital y el enlace con la AEAT.',
            side: 'bottom' as any,
          },
        },
        {
          element: '[data-tutorial="sii-stats-cards"]',
          popover: {
            title: 'Resumen de Facturas',
            description: 'Visualiza facturas pendientes y comprobantes ya registrados en la Agencia Tributaria.',
            side: 'bottom' as any,
          },
        },
        {
          element: '[data-tutorial="sii-tabs-bar"]',
          popover: {
            title: 'Libros y Envíos',
            description: 'Alterna entre el Certificado Digital, Envíos masivos y consulta de facturas emitidas y recibidas.',
            side: 'bottom' as any,
          },
        },
        {
          element: '[data-tutorial="sii-tab-enviar"]',
          popover: {
            title: 'Envío a la AEAT',
            description: 'Carga facturas pendientes de tu empresa y remítelas en lote a la AEAT con validación previa.',
            side: 'bottom' as any,
          },
        },
        {
          element: '[data-tutorial="sii-tab-emitidas"]',
          popover: {
            title: 'Libros Oficiales y Bajas',
            description: 'Consulta los registros oficiales en la sede de la AEAT y solicita anulaciones si es necesario.',
            side: 'bottom' as any,
          },
        },
        {
          element: 'body',
          popover: {
            title: '¡Listo en Móvil!',
            description: 'Ya conoces cómo conectar y operar con el SII desde tu dispositivo.',
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
        onHighlightStarted: (element, step, options) => {
          const currentStep = validSteps[options.state.activeIndex ?? 0];
          const selector = (currentStep?.element as string) || '';
          ensureTab(getTabForSelector(selector));

          injectSkipButton(() => {
            ensureTab('credenciales');
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
            ensureTab('credenciales');
            removeGlobalTouchBlocker();
            markAsCompletedRef.current();
            removeSkipButton();
            driverInstance.destroy();
          } else {
            const nextStep = validSteps[idx + 1];
            const selector = (nextStep?.element as string) || '';
            ensureTab(getTabForSelector(selector));
            driverInstance.moveNext();
          }
        },
        onPrevClick: (element, step, options) => {
          const idx = options.state.activeIndex ?? 0;
          if (idx > 0) {
            const prevStep = validSteps[idx - 1];
            const selector = (prevStep?.element as string) || '';
            ensureTab(getTabForSelector(selector));
          }
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
