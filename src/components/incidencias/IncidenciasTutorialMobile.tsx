'use client';

import { useEffect, useRef } from 'react';
import { driver, type DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';
import { useIncidencias } from '@/context/IncidenciasProvider';

/**
 * Mobile version of IncidenciasTutorial.
 * Same behavior as PC version but with Android-specific fixes:
 * - touchstart listener on overlay to block touch events
 * - position: fixed for blockers
 * - No backdrop-filter (creates broken stacking context on Android)
 * - touch-action: manipulation on popover buttons
 */
export function IncidenciasTutorialMobile() {
    const { shouldShowTutorial, isLoading, markAsCompleted } = useIncidencias();
    const driverInstanceRef = useRef<ReturnType<typeof driver> | null>(null);
    const hasRunRef = useRef(false);
    const lastStepRef = useRef(0);
    const overlayTouchBlockerRef = useRef<((e: TouchEvent) => void) | null>(null);

    useEffect(() => {
        if (isLoading || !shouldShowTutorial || hasRunRef.current) return;

        const checkForPage = setInterval(() => {
            const headerElement = document.querySelector('[data-tutorial="incidencias-header"]');
            if (headerElement) {
                clearInterval(checkForPage);
                hasRunRef.current = true;
                startTutorial();
            }
        }, 500);

        return () => {
            clearInterval(checkForPage);
            if (driverInstanceRef.current) {
                driverInstanceRef.current.destroy();
                driverInstanceRef.current = null;
            }
            removeTouchBlocker();
        };
    }, [isLoading, shouldShowTutorial]);

    const addTouchBlocker = () => {
        const overlay = document.querySelector('.driver-overlay') as HTMLElement | null;
        if (!overlay || overlayTouchBlockerRef.current) return;

        const handler = (e: TouchEvent) => {
            e.preventDefault();
            e.stopPropagation();
        };
        overlay.addEventListener('touchstart', handler, { passive: false });
        overlayTouchBlockerRef.current = handler;
    };

    const removeTouchBlocker = () => {
        const overlay = document.querySelector('.driver-overlay') as HTMLElement | null;
        if (overlay && overlayTouchBlockerRef.current) {
            overlay.removeEventListener('touchstart', overlayTouchBlockerRef.current);
        }
        overlayTouchBlockerRef.current = null;
    };

    const startTutorial = () => {
        const steps: DriveStep[] = [
            {
                element: '[data-tutorial="incidencias-header"]',
                popover: {
                    title: '⚠️ Gestión de Incidencias',
                    description: '¡Bienvenido! Aquí puedes gestionar todos los problemas detectados en tus documentos: duplicados, errores de cálculo y más.',
                    side: 'bottom' as const,
                    align: 'start' as const,
                },
            },
            {
                element: '[data-tutorial="incidencias-analytics"]',
                popover: {
                    title: '📊 Panel de Métricas',
                    description: 'Este panel te muestra un resumen de todas las incidencias: cuántas están abiertas, cuántas resueltas, y qué proveedores tienen más problemas.',
                    side: 'right' as const,
                    align: 'start' as const,
                },
            },
            {
                element: '[data-tutorial="incidencias-analizar"]',
                popover: {
                    title: '🔍 Análisis Automático',
                    description: 'Usa esta herramienta para revisar todos tus documentos de una vez. El sistema comparará datos automáticamente para detectar duplicados, errores de cálculo y documentos incompletos.',
                    side: 'left' as const,
                    align: 'start' as const,
                },
            },
            {
                element: '[data-tutorial="incidencias-ai-table"]',
                popover: {
                    title: '🤖 Incidencias del Análisis Individual',
                    description: 'Aquí aparecen las incidencias detectadas cuando analizas un documento individualmente desde su vista de detalle. Son análisis manuales e individuales que has iniciado tú.',
                    side: 'top' as const,
                    align: 'center' as const,
                },
            },
            {
                element: '[data-tutorial="incidencias-documentos"]',
                popover: {
                    title: '📄 Incidencias de Subida Original',
                    description: 'Esta tabla muestra los documentos con incidencias detectadas durante la subida inicial al sistema. Son problemas encontrados automáticamente al procesar los documentos por primera vez.',
                    side: 'top' as const,
                    align: 'center' as const,
                },
            },
            {
                element: 'body',
                popover: {
                    title: '🎉 ¡Tutorial Completado!',
                    description: '¡Perfecto! Ahora sabes cómo gestionar incidencias. Puedes analizar, validar y resolver problemas para mantener tus documentos en orden.',
                    side: 'over' as const,
                    align: 'center' as const,
                },
            },
        ];

        const driverInstance = driver({
            showProgress: true,
            showButtons: ['next', 'previous'],
            animate: true,
            allowClose: false,
            overlayOpacity: 0.75,
            disableActiveInteraction: true,
            steps,
            nextBtnText: 'Siguiente →',
            prevBtnText: '← Anterior',
            doneBtnText: '¡Entendido!',

            onHighlightStarted: (element, step, options) => {
                const currentStepIndex = options.state.activeIndex ?? 0;
                lastStepRef.current = currentStepIndex;
                // Add touch blocker on each step highlight
                setTimeout(() => addTouchBlocker(), 50);
            },

            onNextClick: (element, step, options) => {
                const idx = options.state.activeIndex ?? 0;
                const totalStepsCount = driverInstance.getConfig().steps?.length ?? 0;

                if (idx === totalStepsCount - 1) {
                    markAsCompleted();
                    setTimeout(() => driverInstance.destroy(), 100);
                } else {
                    driverInstance.moveNext();
                }
            },

            onCloseClick: () => {
                const idx = driverInstance.getActiveIndex() ?? 0;
                const totalStepsCount = driverInstance.getConfig().steps?.length ?? 0;
                if (idx >= totalStepsCount - 2) markAsCompleted();
                driverInstance.destroy();
            },

            onPrevClick: () => driverInstance.movePrevious(),

            onDestroyStarted: () => {
                removeTouchBlocker();
                document.body.classList.forEach(cls => {
                    if (cls.startsWith('tutorial-step-')) document.body.classList.remove(cls);
                });
            },
        });

        driverInstanceRef.current = driverInstance;
        setTimeout(() => driverInstance.drive(), 300);
    };

    // 🔥 MOBILE-SPECIFIC STYLES
    useEffect(() => {
        const style = document.createElement('style');
        style.id = 'incidencias-tutorial-mobile-styles';
        style.textContent = `
      /* 🔥 Overlay blocks all touch except popover */
      .driver-overlay {
        pointer-events: auto !important;
      }

      #driver-page-overlay,
      #driver-highlighted-element-stage {
        pointer-events: none !important;
      }

      /* 🔥 Highlighted elements NOT tappable */
      .driver-active-element,
      .driver-active-element *,
      .driver-active-element button,
      .driver-active-element a,
      .driver-active-element input,
      .driver-active-element [role="button"] {
        pointer-events: none !important;
        cursor: default !important;
      }

      /* 🔥 Only the popover is interactive */
      .driver-popover,
      .driver-popover-wrapper,
      .driver-popover *,
      .driver-popover button {
        pointer-events: auto !important;
        cursor: pointer !important;
        /* FIX #3: Prevent double-tap zoom and ensure min touch target */
        touch-action: manipulation !important;
        -webkit-tap-highlight-color: transparent !important;
      }

      .driver-popover button {
        min-height: 44px !important;
      }

      /* Visual feedback */
      .driver-active-element {
        box-shadow: 0 0 0 4px hsla(var(--primary) / 0.3) !important;
      }

      /* FIX #5: No backdrop-filter - causes broken stacking context on Android */
      .driver-popover {
        border: 1px solid hsla(var(--primary) / 0.5) !important;
        background-color: rgba(15, 23, 42, 0.95) !important;
        /* backdrop-filter REMOVED for Android */
        border-radius: 12px !important;
        color: white !important;
        box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.3), 0 8px 10px -6px rgb(0 0 0 / 0.2) !important;
      }

      .driver-popover-title {
        color: white !important;
        font-weight: 700 !important;
        font-size: 1.1rem !important;
      }

      .driver-popover-description {
        color: rgba(255, 255, 255, 0.9) !important;
        font-weight: 500 !important;
        line-height: 1.5 !important;
      }

      .driver-popover-progress-text {
        color: rgba(255, 255, 255, 0.5) !important;
      }

      .driver-popover-next-btn {
        background-color: hsl(var(--primary)) !important;
        color: white !important;
        border: none !important;
        text-shadow: none !important;
        font-weight: 600 !important;
        border-radius: 6px !important;
        touch-action: manipulation !important;
      }

      .driver-popover-prev-btn {
        color: white !important;
        border: 1px solid rgba(255, 255, 255, 0.2) !important;
        background: transparent !important;
        text-shadow: none !important;
        font-weight: 500 !important;
        border-radius: 6px !important;
        touch-action: manipulation !important;
      }

      .driver-popover-close-btn {
        color: rgba(255, 255, 255, 0.5) !important;
        touch-action: manipulation !important;
        min-height: 44px !important;
        min-width: 44px !important;
      }

      .driver-popover-arrow {
        border-bottom-color: rgba(15, 23, 42, 0.95) !important;
        border-top-color: rgba(15, 23, 42, 0.95) !important;
      }

      /* FIX #1: Block all touch outside popover */
      body:has(.driver-overlay) * {
        pointer-events: none !important;
      }

      body:has(.driver-overlay) .driver-popover,
      body:has(.driver-overlay) .driver-popover * {
        pointer-events: auto !important;
      }
    `;
        document.head.appendChild(style);

        return () => {
            const el = document.getElementById('incidencias-tutorial-mobile-styles');
            if (el) el.remove();
        };
    }, []);

    return null;
}
