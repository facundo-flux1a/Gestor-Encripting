'use client';

import { useEffect, useRef } from 'react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { usePathname } from 'next/navigation';
import { useCompanyContext } from '@/context/CompanyProvider';
import { useTrimestres } from '@/context/TrimestresProvider';
import { injectSkipButton, removeSkipButton } from '@/lib/tutorial-utils';
import {
    getTrimestresTutorialSteps,
    isTrimestresMobileWhitelistedTarget,
    prepareTrimestresTutorialStep,
    TRIMESTRES_SHOW_EMPTY_FROM_STEP,
    TRIMESTRES_STEP,
    TRIMESTRES_TABLE_STEP_INDEX,
} from '@/components/trimestres/trimestres-tutorial-steps';

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
            const isWhitelisted = isTrimestresMobileWhitelistedTarget(idx, target);

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
                skipMissingElement: true,

                steps: getTrimestresTutorialSteps({ mobile: true }),

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

                    prepareTrimestresTutorialStep(currentStepIndex);
                    addGlobalTouchBlocker();

                    if (currentStepIndex >= TRIMESTRES_SHOW_EMPTY_FROM_STEP) setMostrarVacios(true);

                    if (currentStepIndex === TRIMESTRES_STEP.COMPANY) {
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

                    if (idx === TRIMESTRES_STEP.COMPANY) {
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
      body.tutorial-step-${TRIMESTRES_STEP.COMPANY} [data-tutorial="trimestres-company-selector"],
      body.tutorial-step-${TRIMESTRES_STEP.COMPANY} [data-tutorial="company-selector"],
      body.tutorial-step-${TRIMESTRES_STEP.COMPANY} [data-radix-portal],
      body.tutorial-step-${TRIMESTRES_STEP.COMPANY} [data-radix-popper-content-wrapper],
      body.tutorial-step-${TRIMESTRES_STEP.COMPANY} [role="checkbox"],
      body.tutorial-step-${TRIMESTRES_STEP.COMPANY} label {
        z-index: 2147483648 !important;
        pointer-events: auto !important;
        opacity: 1 !important;
      }

      .driver-active-element { box-shadow: 0 0 0 4px hsla(var(--primary) / 0.3) !important; }

      /* 🔒 Step 6 (index 5): Tabla de Documentos - filas no clickeables */
      body.tutorial-step-${TRIMESTRES_TABLE_STEP_INDEX} [data-tutorial="trimestres-table"] tbody tr,
      body.tutorial-step-${TRIMESTRES_TABLE_STEP_INDEX} [data-tutorial="trimestres-table"] tbody tr * {
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
