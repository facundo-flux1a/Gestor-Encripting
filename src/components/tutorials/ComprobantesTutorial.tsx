'use client';

import { useEffect, useRef } from 'react';
import { driver, type DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';
import { useComprobantesTutorial } from '@/context/ComprobantesTutorialProvider';
import { injectSkipButton, removeSkipButton } from '@/lib/tutorial-utils';

const TUTORIAL_STYLE_ID = 'comprobantes-tutorial-desktop-styles';

const TUTORIAL_STYLES = `
  /* Bloquear toda interacción con la página de fondo mientras el tutorial está activo */
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

  /* Highlight con glow esmeralda / primary */
  .driver-active-element {
    outline: 4px solid hsl(var(--primary)) !important;
    box-shadow: 0 0 0 4px hsla(var(--primary) / 0.3) !important;
    border-radius: 8px !important;
  }

  /* Tarjeta Popover Glassmorphism Dark */
  .driver-popover {
    background-color: rgba(15, 23, 42, 0.95) !important;
    backdrop-filter: blur(16px) !important;
    border: 1px solid hsla(var(--primary) / 0.5) !important;
    border-radius: 14px !important;
    color: #f8fafc !important;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 25px hsla(var(--primary) / 0.15) !important;
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

  /* Botón Siguiente oficial unificado con Muvail primary */
  .driver-popover-next-btn {
    background-color: hsl(var(--primary)) !important;
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
    background-color: hsl(var(--primary) / 0.9) !important;
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
`;

interface ComprobantesTutorialProps {
  isDataLoading?: boolean;
}

export function ComprobantesTutorial({ isDataLoading = false }: ComprobantesTutorialProps) {
  const { shouldShowTutorial, isLoading, markAsCompleted } = useComprobantesTutorial();
  const hasStartedRef = useRef(false);
  const driverRef = useRef<ReturnType<typeof driver> | null>(null);
  const markAsCompletedRef = useRef(markAsCompleted);

  useEffect(() => {
    markAsCompletedRef.current = markAsCompleted;
  }, [markAsCompleted]);

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
    return () => {
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

      const allPossibleSteps: DriveStep[] = [
        // ── PASO 1: Cabecera ──
        {
          element: '[data-tutorial="comprobantes-header"]',
          popover: {
            title: '🗂️ Exportación de Comprobantes',
            description: 'Empaqueta y descarga en un único archivo ZIP todos los comprobantes y facturas que necesitas remitir a tu gestoría o auditoría.',
            side: 'bottom' as any,
            align: 'start' as any,
          },
        },
        // ── PASO 2: Filtros de Búsqueda ──
        {
          element: '[data-tutorial="comprobantes-filters"]',
          popover: {
            title: '🔍 Filtros de Búsqueda',
            description: 'Filtra rápidamente por tipo (recibidas, emitidas, tickets), año, trimestre o proveedor para aislar el lote exacto que necesitas exportar.',
            side: 'bottom' as any,
            align: 'center' as any,
          },
        },
        // ── PASO 3: Barra de Selección ──
        {
          element: '[data-tutorial="comprobantes-selection-bar"]',
          popover: {
            title: '☑️ Selección Rápida en Lote',
            description: 'Marca la casilla principal para seleccionar todos los documentos filtrados con un solo clic, o selecciona documentos individualmente en la tabla.',
            side: 'bottom' as any,
            align: 'start' as any,
          },
        },
        // ── PASO 4: Tabla y Exportación ──
        {
          element: '[data-tutorial="comprobantes-table"]',
          popover: {
            title: '📦 Generación de ZIP y Envío',
            description: 'Al marcar comprobantes, se activará la barra flotante inferior para generar el paquete ZIP en la nube y recibir el enlace de descarga directamente en tu correo.',
            side: 'top' as any,
            align: 'center' as any,
          },
        },
        // ── PASO FINAL ──
        {
          element: 'body',
          popover: {
            title: '🎉 ¡Listo para Exportar!',
            description: 'Ya conoces cómo seleccionar y descargar tus comprobantes en lote. Puedes reiniciar este recorrido desde Configuración cuando quieras.',
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
            markAsCompletedRef.current();
            removeSkipButton();
            driverRef.current?.destroy();
          });
        },
        onNextClick: (element, step, options) => {
          const idx = options.state.activeIndex ?? 0;
          const totalSteps = validSteps.length;
          if (idx === totalSteps - 1) {
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
