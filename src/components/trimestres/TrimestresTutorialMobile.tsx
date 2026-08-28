'use client';

import { useEffect, useRef } from 'react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { usePathname } from 'next/navigation';
import { useCompanyContext } from '@/context/CompanyProvider';
import { useTrimestres } from '@/context/TrimestresProvider';
import { injectSkipButton, removeSkipButton } from '@/lib/tutorial-utils';

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

    const blockedEvents = ['touchstart', 'touchmove', 'touchend', 'mousedown', 'mouseup', 'click', 'pointerdown', 'pointerup', 'pointercancel'];

    const logToTerminal = (msg: string) => {
        if (process.env.NODE_ENV === 'development') {
            fetch('/api/mobile-log', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: msg })
            }).catch(() => { });
        }
    };

    const addGlobalTouchBlocker = () => {
        if (overlayTouchBlockerRef.current) return;
        const handler = (e: Event) => {
            const target = e.target as HTMLElement;
            const idx = lastStepRef.current;

            if (e.type === 'touchstart' || e.type === 'click') {
                logToTerminal(`🔍 [TRIMESTRES] Event: ${e.type}, Step Index: ${idx}, Target: ${target.tagName}.${target.className}`);
            }

            // 1. Popover is ALWAYS allowed
            const isPopover = target.closest('.driver-popover') || target.closest('.driver-popover-wrapper');

            if (isPopover) {
                if (e.type === 'touchstart' || e.type === 'click') logToTerminal(`✅ PERMITIDO [Paso ${idx}]: Click en Popover (${target.tagName})`);
                return;
            }

            // 2. Step-Specific Surgical Whitelists: Block everything else
            let isWhitelisted = false;
            // Step 2 (Index 1): Company Selector and its Radix portals
            if (idx === 1) {
                const isCompanySelector = !!target.closest('[data-tutorial="trimestres-company-selector"]');
                const isGeneralCompanySelector = !!target.closest('[data-tutorial="company-selector"]');
                const isRadixPortal = !!target.closest('[data-radix-portal]');
                const isRadixPopper = !!target.closest('[data-radix-popper-content-wrapper]');
                // Aditional check for specific Radix item roles (checkbox, label)
                const isRadixItem = target.role === 'checkbox' || !!target.closest('[role="checkbox"]') || !!target.closest('label');

                if (isCompanySelector || isGeneralCompanySelector || isRadixPortal || isRadixPopper || isRadixItem) {
                    isWhitelisted = true;
                    if (e.type === 'touchstart' || e.type === 'click') {
                        logToTerminal(`🔹 Whitelist Step 1 DETALLE: Selector=${isCompanySelector}, Gen=${isGeneralCompanySelector}, Portal=${isRadixPortal}, Item=${isRadixItem}`);
                    }
                }
            } else if (idx === 2 && target.closest('[data-tutorial="trimestres-selector"]')) {
                isWhitelisted = true;
            } else if (idx === 3 && target.closest('[data-tutorial="trimestres-toggle"]')) {
                isWhitelisted = true;
            }

            if (!isWhitelisted) {
                if (e.type === 'touchstart' || e.type === 'click') logToTerminal(`🛑 BLOQUEADO [Paso ${idx}]: ${target.tagName} (${target.className})`);
                if (e.cancelable) e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
            } else {
                if (e.type === 'touchstart' || e.type === 'click') logToTerminal(`✅ PERMITIDO [Paso ${idx}]: Pasó Whitelist (${target.tagName})`);
            }
        };
        // Use capture: true to intercept before other handlers
        blockedEvents.forEach(evt => {
            document.addEventListener(evt, handler, { passive: false, capture: true });
        });
        overlayTouchBlockerRef.current = handler as any;
    };

    const removeGlobalTouchBlocker = () => {
        if (overlayTouchBlockerRef.current) {
            blockedEvents.forEach(evt => {
                document.removeEventListener(evt, overlayTouchBlockerRef.current as any, { capture: true });
            });
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

    const pathname = usePathname();

    useEffect(() => {
        if (typeof window !== 'undefined' && localStorage.getItem('force_tutorial_trimestres') === 'true') {
            logToTerminal('🔄 [TRIMESTRES] Replay detectado, reseteando hasRunRef');
            hasRunRef.current = false;
        }

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
                            // Side changed to left and align to center to avoid overlapping with the dropdown on the right
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
                            description: 'Aquí ves todos los documentos del trimestre seleccionado. Puedes buscar, filtrar y editar documentos.',
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

                    // ✅ Gestionar clases de paso en el body para control CSS preciso
                    document.body.classList.forEach(cls => {
                        if (cls.startsWith('tutorial-step-')) {
                            document.body.classList.remove(cls);
                        }
                    });
                    document.body.classList.add(`tutorial-step-${currentStepIndex}`);

                    addGlobalTouchBlocker();

                    if (currentStepIndex >= 3) setMostrarVacios(true);

                    if (currentStepIndex === 1) {
                        document.body.setAttribute('data-tutorial-step', '1');
                    } else {
                        document.body.removeAttribute('data-tutorial-step');
                    }

                    injectSkipButton(() => {
                        markAsCompleted();
                        removeGlobalTouchBlocker();
                        removeSkipButton();
                        driverInstanceRef.current?.destroy();
                    });
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
                        // Clean up blockers before destroying driver to avoid "locking"
                        removeGlobalTouchBlocker();
                        removeSkipButton();
                        document.body.classList.forEach(cls => {
                            if (cls.startsWith('tutorial-step-')) document.body.classList.remove(cls);
                        });
                        setTimeout(() => driverInstance.destroy(), 100);
                    } else {
                        driverInstance.moveNext();
                    }
                },

                onCloseClick: () => {
                    markAsCompleted();
                    removeGlobalTouchBlocker();
                    removeSkipButton();
                    document.body.classList.forEach(cls => {
                        if (cls.startsWith('tutorial-step-')) document.body.classList.remove(cls);
                    });
                    driverInstance.destroy();
                },

                onPrevClick: () => driverInstance.movePrevious(),

                onDestroyStarted: () => {
                    document.body.removeAttribute('data-tutorial-step');
                    setTutorialState(false, 0);
                    removeGlobalTouchBlocker();
                    document.body.classList.forEach(cls => {
                        if (cls.startsWith('tutorial-step-')) document.body.classList.remove(cls);
                    });
                    const styleEl = document.getElementById('trimestres-tutorial-mobile-styles');
                    if (styleEl) styleEl.remove();
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
            removeGlobalTouchBlocker();
        };
    }, [isLoading, shouldShowTutorial, markAsCompleted, setTutorialState]);

    useEffect(() => {
        const style = document.createElement('style');
        style.id = 'trimestres-tutorial-mobile-styles';
        style.textContent = `
      /* Robust Mobile Blocking - Interaction strictly managed by JS */
      .driver-overlay { 
        pointer-events: none !important; 
        z-index: 2147483630 !important; 
      }
      #driver-page-overlay, #driver-highlighted-element-stage { pointer-events: none !important; }

      .driver-popover, .driver-popover-wrapper, .driver-popover * {
        pointer-events: auto !important; 
        z-index: 2147483647 !important;
      }
      .driver-popover button { min-height: 44px !important; }

      /* Highlighted active element */
      .driver-active-element { 
        z-index: 2147483640 !important; 
        border: 2px solid white !important;
        pointer-events: auto !important;
      }

      /* Step 2 (Index 1): Company Selector + Portals (Ensure they render ABOVE everything else) */
      body.tutorial-step-1 [data-tutorial="trimestres-company-selector"],
      body.tutorial-step-1 [data-tutorial="company-selector"],
      body.tutorial-step-1 [data-radix-portal],
      body.tutorial-step-1 [data-radix-popper-content-wrapper],
      body.tutorial-step-1 [role="checkbox"],
      body.tutorial-step-1 label {
        z-index: 2147483648 !important;
        pointer-events: auto !important;
        opacity: 1 !important;
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
