'use client';

import { useEffect, useRef } from 'react';
import { driver, type DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';
import { useCuentasContablesTutorial } from '@/context/CuentasContablesTutorialProvider';
import { injectSkipButton, removeSkipButton } from '@/lib/tutorial-utils';

const TUTORIAL_STYLE_ID = 'cuentas-contables-tutorial-styles';

const TUTORIAL_STYLES = `
  /* Bloquear toda interacción con la página de fondo mientras el tutorial está activo */
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

  /* Popover interactivo */
  .driver-popover,
  .driver-popover-wrapper,
  .driver-popover *,
  .driver-popover button {
    pointer-events: auto !important;
    cursor: pointer !important;
  }

  #tutorial-skip-btn,
  #tutorial-skip-btn * {
    pointer-events: auto !important;
    cursor: pointer !important;
  }

  /* Highlight con glow violeta */
  .driver-active-element {
    outline: 3px solid #7c3aed !important;
    box-shadow: 0 0 0 4px rgba(124, 58, 237, 0.35), 0 0 20px rgba(124, 58, 237, 0.2) !important;
    border-radius: 8px !important;
  }

  /* Tarjeta Popover Glassmorphism Dark */
  .driver-popover {
    background-color: rgba(15, 23, 42, 0.95) !important;
    backdrop-filter: blur(16px) !important;
    border: 1px solid rgba(139, 92, 246, 0.45) !important;
    border-radius: 14px !important;
    color: #f8fafc !important;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 25px rgba(139, 92, 246, 0.15) !important;
    padding: 18px !important;
    max-width: 400px !important;
  }

  .driver-popover-title {
    color: #ffffff !important;
    font-weight: 700 !important;
    font-size: 1.05rem !important;
    letter-spacing: -0.01em !important;
    margin-bottom: 8px !important;
    display: flex !important;
    align-items: center !important;
    gap: 6px !important;
  }

  .driver-popover-description {
    color: #cbd5e1 !important;
    font-weight: 400 !important;
    font-size: 0.85rem !important;
    line-height: 1.55 !important;
    white-space: pre-line !important;
  }

  .driver-popover-progress-text {
    color: #94a3b8 !important;
    font-size: 0.75rem !important;
    font-weight: 500 !important;
  }

  .driver-popover-footer {
    margin-top: 14px !important;
    display: flex !important;
    align-items: center !important;
    gap: 8px !important;
  }

  /* Botón Siguiente oficial unificado con los otros tutoriales (#6600A3) */
  .driver-popover-next-btn {
    background-color: #6600A3 !important;
    color: #ffffff !important;
    border: none !important;
    text-shadow: none !important;
    font-size: 12px !important;
    font-weight: 600 !important;
    padding: 6px 14px !important;
    border-radius: 8px !important;
    height: 32px !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    transition: all 0.2s ease !important;
    cursor: pointer !important;
  }

  .driver-popover-next-btn:hover {
    background-color: #7c3aed !important;
    transform: translateY(-1px) !important;
  }

  .driver-popover-prev-btn {
    background: rgba(255, 255, 255, 0.06) !important;
    color: #cbd5e1 !important;
    border: 1px solid rgba(255, 255, 255, 0.15) !important;
    text-shadow: none !important;
    font-size: 12px !important;
    font-weight: 500 !important;
    padding: 6px 12px !important;
    border-radius: 8px !important;
    height: 32px !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    transition: all 0.2s ease !important;
    cursor: pointer !important;
  }

  .driver-popover-prev-btn:hover {
    background: rgba(255, 255, 255, 0.12) !important;
    color: #ffffff !important;
  }

  .driver-popover-close-btn {
    display: none !important;
  }

  .driver-popover-arrow-side-bottom {
    border-bottom-color: rgba(15, 23, 42, 0.95) !important;
  }
  .driver-popover-arrow-side-top {
    border-top-color: rgba(15, 23, 42, 0.95) !important;
  }
  .driver-popover-arrow-side-left {
    border-left-color: rgba(15, 23, 42, 0.95) !important;
  }
  .driver-popover-arrow-side-right {
    border-right-color: rgba(15, 23, 42, 0.95) !important;
  }
`;

interface CuentasContablesTutorialProps {
  isDataLoading?: boolean;
}

export function CuentasContablesTutorial({ isDataLoading = false }: CuentasContablesTutorialProps) {
  const { shouldShowTutorial, isLoading, markAsCompleted } = useCuentasContablesTutorial();
  const hasStartedRef = useRef(false);
  const driverRef = useRef<ReturnType<typeof driver> | null>(null);
  const markAsCompletedRef = useRef(markAsCompleted);

  useEffect(() => {
    markAsCompletedRef.current = markAsCompleted;
  }, [markAsCompleted]);

  // Inyectar estilos una sola vez
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

  // Limpieza al desmontar componente (cambio de ruta)
  useEffect(() => {
    return () => {
      removeSkipButton();
      if (driverRef.current) {
        try { driverRef.current.destroy(); } catch { /* ignore */ }
        driverRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    // Si el usuario forzó replay desde Settings, resetear bandera
    if (typeof window !== 'undefined' && localStorage.getItem('force_tutorial_cuentas_contables') === 'true') {
      hasStartedRef.current = false;
    }

    // 🛑 ESPERAR a que la API del usuario y los datos de la página terminen de cargar
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
            description: 'Asigna tus facturas a subcuentas del PGC para exportar a A3, Contasol o Sage.\n\n🔍 Lookup en Ingesta:\nAl subir una factura, el sistema busca su CIF en esta tabla:\n• Si ya existe: Asigna sus cuentas (410/430 y 6xx/7xx) sin tocar nada.\n• Si es nueva: La IA sugiere la cuenta adecuada para aprobarla en 1 clic.',
            side: 'bottom' as any,
            align: 'start' as any,
          },
        },
      ];

      // ── PASO 2: Banner IA (si existen sugerencias) ──
      if (hasAiBanner) {
        allPossibleSteps.push({
          element: '[data-tutorial="cc-ai-banner"]',
          popover: {
            title: '✨ Sugerencias de la IA',
            description: 'Aprueba todas las cuentas sugeridas de golpe y propágalas opcionalmente a todas sus facturas históricas.',
            side: 'bottom' as any,
            align: 'center' as any,
          },
        });
      }

      // ── PASO 3: Filtros ──
      allPossibleSteps.push(
        {
          element: '[data-tutorial="cc-filters"]',
          popover: {
            title: 'Filtros Rápidos',
            description: 'Alterna entre Proveedores y Clientes, o aísla registros pendientes de confirmar.',
            side: 'bottom' as any,
            align: 'center' as any,
          },
        },
        {
          element: '[data-tutorial="cc-columns-btn"]',
          popover: {
            title: 'Personalizar Columnas',
            description: 'Elige qué columnas ver para mantener la pantalla despejada y enfocada.',
            side: 'bottom' as any,
            align: 'end' as any,
          },
        }
      );

      // ── PASO 4: Fila de entidad o tabla vacía ──
      if (hasFirstRow) {
        allPossibleSteps.push({
          element: '[data-tutorial="cc-first-row"]',
          popover: {
            title: 'Edición y Retroactividad',
            description: 'Haz clic en cualquier cuenta para cambiarla. Puedes propagar el cambio a todas las facturas pasadas de esa entidad.',
            side: 'top' as any,
            align: 'center' as any,
          },
        });
      } else {
        allPossibleSteps.push({
          element: '[data-tutorial="cc-table"]',
          popover: {
            title: 'Directorio de Entidades',
            description: 'Se alimenta de facturas comerciales. Los documentos no facturables (como nóminas) no generan cuentas aquí.',
            side: 'top' as any,
            align: 'center' as any,
          },
        });
      }

      // ── PASO 5: Pestaña 2 (Impuestos) ──
      allPossibleSteps.push(
        {
          element: '[data-tutorial="cc-tab-impuestos"]',
          popover: {
            title: 'Pestaña 2: Cuentas de Impuestos',
            description: 'Subcuentas maestras para IVA, IRPF y operaciones internacionales.',
            side: 'bottom' as any,
            align: 'center' as any,
          },
        },
        {
          element: '[data-tutorial="cc-taxes-container"]',
          popover: {
            title: 'IVA, IRPF e Inversión de Sujeto Pasivo',
            description: 'Reglas para IVA Soportado (472), Repercutido (477) y Retenciones (4751).\n\n🌍 ISP: Gestiona automáticamente servicios de la UE o EE.UU. (Google, Meta, AWS) imputando el IVA simultáneo.',
            side: 'top' as any,
            align: 'center' as any,
          },
        }
      );

      // ── PASO 6: Pestaña 3 (Totales y Balance) ──
      allPossibleSteps.push(
        {
          element: '[data-tutorial="cc-tab-totales"]',
          popover: {
            title: 'Pestaña 3: Balance y Totales CC',
            description: 'Auditoría de sumas y saldos acumulados de todas tus facturas.',
            side: 'bottom' as any,
            align: 'center' as any,
          },
        },
        {
          element: '[data-tutorial="cc-balance-container"]',
          popover: {
            title: 'Sumas y Saldos (Debe vs Haber)',
            description: 'Verifica que el balance contable cuadre al céntimo (Debe = Haber) antes de exportar los asientos a A3.',
            side: 'top' as any,
            align: 'center' as any,
          },
        }
      );

      // ── PASO FINAL: Retorno a Entidades ──
      allPossibleSteps.push({
        element: 'body',
        popover: {
          title: '¡Todo Listo!',
          description: 'Ya conoces cómo funciona el lookup y la gestión contable. Puedes reiniciar este tutorial desde Configuración cuando quieras.',
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
