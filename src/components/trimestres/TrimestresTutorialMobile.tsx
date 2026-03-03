'use client';

import { useEffect, useRef } from 'react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { useCompanyContext } from '@/context/CompanyProvider';
import { useTrimestres } from '@/context/TrimestresProvider';

/**
 * Mobile version of TrimestresTutorial.
 * Key Android fix: removed programmatic .click() to open combobox (breaks on Android).
 * The company selector step now shows text instructing the user to tap manually.
 * Validation still requires selection before advancing.
 */
export function TrimestresTutorialMobile() {
    const { shouldShowTutorial, isLoading, markAsCompleted, setTutorialState, setMostrarVacios } = useTrimestres();
    const driverInstanceRef = useRef<ReturnType<typeof driver> | null>(null);
    const hasRunRef = useRef(false);
    const lastStepRef = useRef(0);
    const { selectedCompanyIds } = useCompanyContext();
    const selectedIdsRef = useRef<number[]>([]);
    const overlayTouchBlockerRef = useRef<((e: TouchEvent) => void) | null>(null);

    useEffect(() => {
        selectedIdsRef.current = selectedCompanyIds;
    }, [selectedCompanyIds]);

    const addTouchBlocker = () => {
        const overlay = document.querySelector('.driver-overlay') as HTMLElement | null;
        if (!overlay || overlayTouchBlockerRef.current) return;
        const handler = (e: TouchEvent) => { e.preventDefault(); e.stopPropagation(); };
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

    const showErrorMessage = (message: string) => {
        const popoverDescription = document.querySelector('.driver-popover-description');
        if (popoverDescription) {
            const existingError = popoverDescription.querySelector('.tutorial-error-msg');
            if (existingError) existingError.remove();
            const errorMsg = document.createElement('p');
            errorMsg.className = 'tutorial-error-msg text-red-500 text-sm mt-3 font-semibold';
            errorMsg.textContent = message;
            popoverDescription.appendChild(errorMsg);
            setTimeout(() => errorMsg.remove(), 4000);
        }
    };

    useEffect(() => {
        if (isLoading || !shouldShowTutorial || hasRunRef.current) return;

        const timeoutId = setTimeout(() => {
            const driverInstance = driver({
                showProgress: true,
                showButtons: ['next', 'previous'],
                animate: true,
                allowClose: false,
                overlayOpacity: 0.75,
                disableActiveInteraction: false,

                steps: [
                    {
                        element: '[data-tutorial="trimestres-welcome"]',
                        popover: {
                            title: '¡Bienvenido a Trimestres! 📅',
                            description: 'Aquí vas a poder organizar y gestionar tus documentos por períodos trimestrales. Te voy a mostrar cómo funciona todo.',
                            side: 'bottom', align: 'center',
                        },
                    },
                    {
                        element: '[data-tutorial="trimestres-company-selector"]',
                        popover: {
                            title: '🏢 Selecciona tu empresa',
                            // FIX: In mobile we can't programmatically open the combobox.
                            // Instruction changed to guide the user to tap manually.
                            description: '📱 Toca el selector para elegir una empresa y luego presiona \'Siguiente\'.',
                            side: 'left', align: 'center',
                        },
                    },
                    {
                        element: '[data-tutorial="trimestres-selector"]',
                        popover: {
                            title: 'Selector de Trimestre',
                            description: 'Aquí puedes cambiar entre trimestres. El sistema muestra automáticamente el trimestre más reciente disponible.',
                            side: 'bottom', align: 'start',
                        },
                    },
                    {
                        element: '[data-tutorial="trimestres-toggle"]',
                        popover: {
                            title: 'Mostrar Trimestres Vacíos',
                            description: 'Activa esta opción para ver trimestres sin documentos. Por defecto, solo se muestran trimestres con documentos.',
                            side: 'left', align: 'start',
                        },
                    },
                    {
                        element: '[data-tutorial="trimestres-stats"]',
                        popover: {
                            title: 'Estadísticas del Trimestre',
                            description: 'Estas tarjetas te muestran un resumen rápido: documentos totales, ingresos, gastos y el IVA neto del trimestre.',
                            side: 'bottom', align: 'center',
                        },
                    },
                    {
                        element: '[data-tutorial="trimestres-table"]',
                        popover: {
                            title: '📋 Tabla de Documentos',
                            description: 'Aquí ves todos los documentos del trimestre seleccionado. Podés buscar, filtrar y editar documentos.',
                            side: 'top', align: 'center',
                        },
                    },
                    {
                        element: '[data-tutorial="trimestres-close-button"]',
                        popover: {
                            title: 'Cerrar Trimestre ⚠️',
                            description: '⚠️ IMPORTANTE: Al cerrar un trimestre, todos sus documentos quedan bloqueados y NO PODRÁN ser editados.',
                            side: 'left', align: 'start',
                        },
                    },
                    {
                        element: '[data-tutorial="trimestres-table"]',
                        popover: {
                            title: '📌 Sobre la asignación de documentos',
                            description: (() => {
                                const now = new Date();
                                const month = now.getMonth();
                                const day = now.getDate();
                                const year = now.getFullYear();
                                let q = 0, qYear = year;
                                if (month === 0 && day <= 30) { q = 4; qYear = year - 1; }
                                else if (month === 3 && day <= 20) { q = 1; }
                                else if (month === 6 && day <= 20) { q = 2; }
                                else if (month === 9 && day <= 20) { q = 3; }
                                else {
                                    if (month < 3) q = 1;
                                    else if (month < 6) q = 2;
                                    else if (month < 9) q = 3;
                                    else q = 4;
                                }
                                return `Los documentos se asignan al trimestre viable más cercano. Por ejemplo: documentos del T${q} ${qYear}.`;
                            })(),
                            side: 'top', align: 'center',
                        },
                    },
                    {
                        element: 'body',
                        popover: {
                            title: '¡Todo listo! 🎉',
                            description: 'Ya conoces todas las herramientas para gestionar tus trimestres. ¡Empieza a organizar tus documentos!',
                            side: 'over', align: 'center',
                        },
                    },
                ],

                nextBtnText: 'Siguiente →',
                prevBtnText: '← Anterior',
                doneBtnText: '¡Entendido!',

                onHighlightStarted: (element, step, options) => {
                    const currentStepIndex = options.state.activeIndex ?? 0;
                    lastStepRef.current = currentStepIndex;
                    setTutorialState(true, currentStepIndex);
                    setTimeout(() => addTouchBlocker(), 50);

                    if (currentStepIndex >= 3) setMostrarVacios(true);

                    if (currentStepIndex === 1) {
                        document.body.setAttribute('data-tutorial-step', '1');
                        // FIX #2: No programmatic .click() on mobile—user must tap manually
                        // We only make the overlay non-blocking so they can interact
                        setTimeout(() => {
                            const overlay = document.querySelector('.driver-overlay');
                            if (overlay) (overlay as HTMLElement).style.pointerEvents = 'none';

                            const popoverContent = document.querySelector('[data-radix-popper-content-wrapper]');
                            if (popoverContent) {
                                (popoverContent as HTMLElement).style.pointerEvents = 'auto';
                                (popoverContent as HTMLElement).style.zIndex = '10000003';
                                (popoverContent as HTMLElement).style.touchAction = 'manipulation';
                                const allElements = popoverContent.querySelectorAll('*');
                                allElements.forEach(el => {
                                    (el as HTMLElement).style.pointerEvents = 'auto';
                                    (el as HTMLElement).style.touchAction = 'manipulation';
                                });
                            }
                        }, 100);
                    } else {
                        document.body.removeAttribute('data-tutorial-step');
                    }
                },

                onNextClick: (element, step, options) => {
                    const idx = options.state.activeIndex ?? 0;
                    const totalStepsCount = driverInstance.getConfig().steps?.length ?? 0;

                    if (idx === 1) {
                        if (selectedIdsRef.current.length > 0) {
                            setTimeout(() => driverInstance.moveNext(), 100);
                        } else {
                            showErrorMessage('⚠️ Por favor, selecciona al menos una empresa antes de continuar.');
                        }
                    } else if (idx === totalStepsCount - 1) {
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
                    document.body.removeAttribute('data-tutorial-step');
                    setTutorialState(false, 0);
                    removeTouchBlocker();
                    document.body.classList.forEach(cls => {
                        if (cls.startsWith('tutorial-step-')) document.body.classList.remove(cls);
                    });
                },
            });

            driverInstanceRef.current = driverInstance;
            hasRunRef.current = true;
            driverInstance.drive();
        }, 400);

        return () => {
            clearTimeout(timeoutId);
            if (driverInstanceRef.current) {
                driverInstanceRef.current.destroy();
                driverInstanceRef.current = null;
            }
            removeTouchBlocker();
        };
    }, [isLoading, shouldShowTutorial, markAsCompleted, setTutorialState]);

    useEffect(() => {
        const style = document.createElement('style');
        style.id = 'trimestres-tutorial-mobile-styles';
        style.textContent = `
      /* FIX: Overlay non-blocking for touch except in specific steps */
      .driver-overlay, #driver-page-overlay, #driver-highlighted-element-stage {
        pointer-events: none !important;
      }

      .driver-active-element, .driver-active-element * {
        pointer-events: auto !important; touch-action: manipulation !important;
      }

      .driver-popover, .driver-popover-wrapper, .driver-popover * {
        pointer-events: auto !important; touch-action: manipulation !important;
        -webkit-tap-highlight-color: transparent !important;
      }

      .driver-popover button { min-height: 44px !important; }

      /* Header + company selector always interactive */
      body:has(.driver-overlay) header,
      body:has(.driver-overlay) [data-tutorial="trimestres-company-selector"],
      body:has(.driver-overlay) [data-tutorial="trimestres-company-selector"] * {
        z-index: 10000001 !important; position: relative !important;
        pointer-events: auto !important; touch-action: manipulation !important;
      }

      /* Company selector popover above everything */
      body[data-tutorial-step="1"] [data-radix-popper-content-wrapper] {
        z-index: 10000003 !important; pointer-events: auto !important; touch-action: manipulation !important;
      }
      body[data-tutorial-step="1"] [data-radix-popper-content-wrapper] * {
        pointer-events: auto !important; touch-action: manipulation !important;
      }
      body[data-tutorial-step="1"] input, body[data-tutorial-step="1"] button,
      body[data-tutorial-step="1"] label, body[data-tutorial-step="1"] [role="checkbox"] {
        pointer-events: auto !important; touch-action: manipulation !important;
      }

      .driver-active-element { box-shadow: 0 0 0 4px hsla(var(--primary) / 0.3) !important; }

      /* 🔒 Step 6 (index 5): Tabla de Documentos - filas no clickeables */
      body.tutorial-step-5 [data-tutorial="trimestres-table"] tbody tr,
      body.tutorial-step-5 [data-tutorial="trimestres-table"] tbody tr * {
        pointer-events: none !important;
        cursor: not-allowed !important;
      }

      .driver-popover {
        border: 1px solid hsla(var(--primary) / 0.5) !important;
        background-color: rgba(15, 23, 42, 0.95) !important;
        border-radius: 12px !important; color: white !important;
        box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.3) !important;
      }

      .driver-popover-title { color: white !important; font-weight: 700 !important; font-size: 1.1rem !important; }
      .driver-popover-description { color: rgba(255,255,255,0.9) !important; line-height: 1.5 !important; }
      .driver-popover-progress-text { color: rgba(255,255,255,0.5) !important; }
      .driver-popover-next-btn {
        background-color: hsl(var(--primary)) !important; color: white !important;
        border: none !important; font-weight: 600 !important; border-radius: 6px !important;
        touch-action: manipulation !important;
      }
      .driver-popover-prev-btn {
        color: white !important; border: 1px solid rgba(255,255,255,0.2) !important;
        background: transparent !important; border-radius: 6px !important; touch-action: manipulation !important;
      }
      .driver-popover-close-btn {
        color: rgba(255,255,255,0.5) !important; touch-action: manipulation !important;
        min-height: 44px !important; min-width: 44px !important;
      }
    `;
        document.head.appendChild(style);
        return () => { const el = document.getElementById('trimestres-tutorial-mobile-styles'); if (el) el.remove(); };
    }, []);

    return null;
}
