'use client';

import { useEffect, useRef } from 'react';
import { driver, type DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';
import { useCuentasContablesTutorial } from '@/context/CuentasContablesTutorialProvider';
import { injectSkipButton, removeSkipButton } from '@/lib/tutorial-utils';

const MOBILE_TUTORIAL_STYLE_ID = 'cuentas-contables-mobile-tutorial-styles';

const MOBILE_TUTORIAL_STYLES = `
  /* Bloquear interacción de fondo en móvil mientras el tutorial está activo */
  body.driver-active main,
  body.driver-active header,
  body.driver-active [data-tutorial="cc-tabs"],
  body.driver-active [data-tutorial="cc-tabs"] * {
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

  /* Highlight con glow violeta en móvil */
  .driver-active-element {
    outline: 2px solid #7c3aed !important;
    box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.35) !important;
    border-radius: 8px !important;
  }

  /* Tarjeta Popover Glassmorphism Dark en móvil */
  .driver-popover {
    background-color: rgba(15, 23, 42, 0.96) !important;
    border: 1px solid rgba(139, 92, 246, 0.5) !important;
    border-radius: 14px !important;
    color: #f8fafc !important;
    box-shadow: 0 20px 35px -8px rgba(0, 0, 0, 0.8), 0 0 20px rgba(139, 92, 246, 0.2) !important;
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
    background-color: #6600A3 !important;
    color: #ffffff !important;
    border: none !important;
    box-shadow: 0 3px 10px rgba(102, 0, 163, 0.4) !important;
    transition: all 0.2s ease !important;
  }

  .driver-popover-next-btn:hover {
    background-color: #7c3aed !important;
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

interface CuentasContablesTutorialMobileProps {
  isDataLoading?: boolean;
}

export function CuentasContablesTutorialMobile({ isDataLoading = false }: CuentasContablesTutorialMobileProps) {
  const { shouldShowTutorial, isLoading, markAsCompleted } = useCuentasContablesTutorial();
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

      const isPopover = target.closest('.driver-popover') || target.closest('.driver-popover-wrapper') || target.closest('[data-radix-portal]');
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
    if (typeof window !== 'undefined' && localStorage.getItem('force_tutorial_cuentas_contables') === 'true') {
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

      const hasAiBanner = Boolean(document.querySelector('[data-tutorial="cc-ai-banner"]'));
      const hasFirstRow = Boolean(document.querySelector('[data-tutorial="cc-first-row"]'));

      const ensureTab = (tab: 'entidades' | 'impuestos' | 'totales') => {
        const btn = document.querySelector(`[data-tutorial="cc-tab-${tab}"]`) as HTMLElement;
        if (btn) btn.click();
      };

      const getTabForSelector = (selector: string): 'entidades' | 'impuestos' | 'totales' => {
        if (selector.includes('impuestos') || selector.includes('taxes')) return 'impuestos';
        if (selector.includes('totales') || selector.includes('balance')) return 'totales';
        return 'entidades';
      };

      const allPossibleSteps: DriveStep[] = [
        // ── PASO 1: Header & Automatización en Ingesta ──
        {
          element: '[data-tutorial="cc-header"]',
          popover: {
            title: '⚖️ Cuentas Contables y Lookup',
            description: 'Asigna facturas a cuentas del PGC para A3 o Contasol.\n\n🔍 Lookup en Ingesta:\nAl subir una factura, busca su CIF:\n• Si ya existe: Asigna cuentas (410/430 y 6xx/7xx) en automático.\n• Si es nueva: La IA sugiere la cuenta para aprobarla en 1 clic.',
            side: 'bottom' as any,
          },
        },
      ];

      // ── PASO 2: Banner IA (si existen sugerencias) ──
      if (hasAiBanner) {
        allPossibleSteps.push({
          element: '[data-tutorial="cc-ai-banner"]',
          popover: {
            title: '✨ Sugerencias de la IA',
            description: 'Aprueba todas las cuentas sugeridas y propágalas al histórico de facturas en un solo toque.',
            side: 'bottom' as any,
          },
        });
      }

      // ── PASO 3: Filtros ──
      allPossibleSteps.push(
        {
          element: '[data-tutorial="cc-filters"]',
          popover: {
            title: 'Filtros Táctiles',
            description: 'Alterna rápido entre Proveedores, Clientes o registros pendientes de asignar.',
            side: 'bottom' as any,
          },
        },
        {
          element: '[data-tutorial="cc-columns-btn"]',
          popover: {
            title: 'Personalizar Columnas',
            description: 'Mantén 3-4 columnas recomendadas para una vista limpia sin scroll horizontal excesivo.',
            side: 'bottom' as any,
          },
        }
      );

      // ── PASO 4: Fila o Estado Vacío ──
      if (hasFirstRow) {
        allPossibleSteps.push({
          element: '[data-tutorial="cc-first-row"]',
          popover: {
            title: 'Edición y Retroactividad',
            description: 'Toca cualquier celda para cambiar su cuenta y propagarla a sus facturas históricas.',
            side: 'top' as any,
          },
        });
      } else {
        allPossibleSteps.push({
          element: '[data-tutorial="cc-table"]',
          popover: {
            title: 'Directorio de Entidades',
            description: 'Se alimenta de facturas comerciales. Los documentos no facturables (como nóminas) no generan cuentas aquí.',
            side: 'top' as any,
          },
        });
      }

      // ── PASO 5: Pestaña 2 (Impuestos) ──
      allPossibleSteps.push(
        {
          element: '[data-tutorial="cc-tab-impuestos"]',
          popover: {
            title: 'Pestaña 2: Cuentas de Impuestos',
            description: 'Subcuentas maestras para IVA, IRPF y compras internacionales.',
            side: 'bottom' as any,
          },
        },
        {
          element: '[data-tutorial="cc-taxes-container"]',
          popover: {
            title: 'IVA, IRPF e ISP',
            description: 'Subcuentas oficiales de IVA Soportado (472), Repercutido (477) y Retenciones (4751).\n\n🌍 ISP: Gestiona servicios de la UE y EE.UU. (Google, Meta, AWS) con IVA simultáneo.',
            side: 'top' as any,
          },
        }
      );

      // ── PASO 6: Pestaña 3 (Balance y Totales) ──
      allPossibleSteps.push(
        {
          element: '[data-tutorial="cc-tab-totales"]',
          popover: {
            title: 'Pestaña 3: Balance y Totales CC',
            description: 'Auditoría de sumas y saldos acumulados de todas tus facturas.',
            side: 'bottom' as any,
          },
        },
        {
          element: '[data-tutorial="cc-balance-container"]',
          popover: {
            title: 'Sumas y Saldos (Debe vs Haber)',
            description: 'Verifica que el balance cuadre al céntimo (Debe = Haber) antes de exportar a A3.',
            side: 'top' as any,
          },
        }
      );

      // ── PASO FINAL: Retorno a Entidades ──
      allPossibleSteps.push({
        element: 'body',
        popover: {
          title: '¡Todo Listo!',
          description: 'Ya conoces cómo funciona el lookup y la gestión contable en móvil. Repite este tour desde Configuración cuando quieras.',
        },
      });

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
            ensureTab('entidades');
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
            ensureTab('entidades');
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
