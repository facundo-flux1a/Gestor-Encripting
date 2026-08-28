'use client';

import { useEffect, useRef } from 'react';
import { driver, type DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';
import { usePathname } from 'next/navigation';
import { useIncidencias } from '@/context/IncidenciasProvider';
import { injectSkipButton, removeSkipButton } from "@/lib/tutorial-utils";

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
    const overlayTouchBlockerRef = useRef<((e: Event) => void) | null>(null);

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

            const isPopover = target.closest('.driver-popover') || target.closest('.driver-popover-wrapper');
            if (isPopover) {
                if (e.type === 'touchstart' || e.type === 'click') logToTerminal(`✅ PERMITIDO [Paso ${idx}]: Popover`);
                return;
            }

            let isWhitelisted = false;
            if (target.closest('[data-radix-portal]')) isWhitelisted = true;

            if (!isWhitelisted) {
                if (e.type === 'touchstart' || e.type === 'click') logToTerminal(`🛑 BLOQUEADO [Paso ${idx}]: ${target.tagName}`);
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
        }
        overlayTouchBlockerRef.current = null;
    };

    const pathname = usePathname();

    useEffect(() => {
        if (typeof window !== 'undefined' && localStorage.getItem('force_tutorial_incidencias') === 'true') {
            logToTerminal('🔄 [INCIDENCIAS] Replay detectado, reseteando hasRunRef');
            hasRunRef.current = false;
        }

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
            removeGlobalTouchBlocker();
        };
    }, [isLoading, shouldShowTutorial]);

    const startTutorial = () => {
        const steps: DriveStep[] = [
            {
                element: '[data-tutorial="incidencias-header"]',
                popover: {
                    title: '⚠️ Gestión de Incidencias',
                    description: '¡Bienvenido! Aquí puedes gestionar todos los problemas detectados en tus documentos: duplicados, errores de cálculo y más.',
                    side: 'bottom' as const, align: 'start' as const,
                },
            },
            {
                element: '[data-tutorial="incidencias-analytics"]',
                popover: {
                    title: '📊 Panel de Métricas',
                    description: 'Resumen de incidencias: abiertas, resueltas y qué proveedores tienen más problemas.',
                    side: 'bottom' as const, align: 'start' as const,
                },
            },
            {
                element: '[data-tutorial="incidencias-analizar"]',
                popover: {
                    title: '🔍 Análisis Automático',
                    description: 'Usa esta herramienta para detectar automáticamente anomalías en todos tus documentos.',
                    side: 'bottom' as const, align: 'start' as const,
                },
            },
            {
                element: '[data-tutorial="incidencias-ai-table"]',
                popover: {
                    title: '🤖 Análisis Individual',
                    description: 'Aquí aparecen las incidencias detectadas al analizar documentos uno a uno.',
                    side: 'top' as const, align: 'center' as const,
                },
            },
            {
                element: '[data-tutorial="incidencias-documentos"]',
                popover: {
                    title: '📄 Subida Original',
                    description: 'Documentos con incidencias detectadas durante la carga inicial.',
                    side: 'top' as const, align: 'center' as const,
                },
            },
            {
                element: '[data-tutorial="incidencias-header"]',
                popover: {
                    title: '🎉 ¡Tutorial Completado!',
                    description: '¡Listo! Ya puedes gestionar todas las incidencias de tu sistema.',
                    side: 'over' as const, align: 'center' as const,
                },
            },
        ];

        const driverInstance = driver({
            showProgress: true,
            showButtons: ['next', 'previous', 'close'],
            animate: true,
            allowClose: true,
            overlayOpacity: 0.75,
            disableActiveInteraction: true,
            steps,
            nextBtnText: 'Siguiente →',
            prevBtnText: '← Anterior',
            doneBtnText: '¡Entendido!',

            onHighlightStarted: (element, step, options) => {
                const currentStepIndex = options.state.activeIndex ?? 0;
                lastStepRef.current = currentStepIndex;
                console.log('🎯 [IncidenciasTutorialMobile] Paso:', currentStepIndex, element);

                document.body.classList.forEach(cls => {
                    if (cls.startsWith('tutorial-step-')) document.body.classList.remove(cls);
                });
                document.body.classList.add(`tutorial-step-${currentStepIndex}`);
                addGlobalTouchBlocker();

                injectSkipButton(() => {
                    markAsCompleted();
                    removeGlobalTouchBlocker();
                    removeSkipButton();
                    driverInstanceRef.current?.destroy();
                });
            },
            onNextClick: (element, step, options) => {
                const idx = options.state.activeIndex ?? 0;
                const total = steps.length;
                if (idx === total - 1) {
                    markAsCompleted();
                    removeGlobalTouchBlocker();
                    removeSkipButton();
                    setTimeout(() => driverInstance.destroy(), 100);
                } else {
                    driverInstance.moveNext();
                }
            },
            onCloseClick: () => {
                console.log('❌ [IncidenciasTutorialMobile] onCloseClick - Marcando como completado');
                markAsCompleted();
                removeSkipButton();
                driverInstance.destroy();
            },
            onPrevClick: () => driverInstance.movePrevious(),
            onDestroyStarted: () => {
                removeSkipButton();
                removeGlobalTouchBlocker();
                document.body.classList.forEach(cls => {
                    if (cls.startsWith('tutorial-step-')) document.body.classList.remove(cls);
                });
            },
        });

        driverInstanceRef.current = driverInstance;
        addGlobalTouchBlocker();
        setTimeout(() => driverInstance.drive(), 300);
    };

    useEffect(() => {
        const style = document.createElement('style');
        style.id = 'incidencias-tutorial-mobile-styles';
        style.textContent = `
          .driver-overlay { 
            pointer-events: none !important; 
            z-index: 2147483630 !important;
          }
          #driver-page-overlay, #driver-highlighted-element-stage { pointer-events: none !important; }

          .driver-popover, .driver-popover-wrapper, .driver-popover * {
            pointer-events: auto !important;
            z-index: 2147483647 !important;
            touch-action: manipulation !important;
          }

          .driver-active-element {
            z-index: 2147483640 !important;
            pointer-events: none !important; 
            box-shadow: 0 0 0 4px hsla(var(--primary) / 0.3) !important;
          }

          .driver-popover {
            border: 1px solid hsla(var(--primary) / 0.5) !important;
            background-color: rgba(15, 23, 42, 0.95) !important;
            border-radius: 12px !important;
            color: white !important;
            box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.3) !important;
          }

          .driver-popover button { min-height: 44px !important; }
          .driver-popover-title { color: white !important; font-weight: 700 !important; }
          .driver-popover-description { color: rgba(255, 255, 255, 0.9) !important; line-height: 1.5 !important; }
          .driver-popover-next-btn { background-color: hsl(var(--primary)) !important; color: white !important; border: none !important; border-radius: 6px !important; }
          .driver-popover-prev-btn { color: white !important; border: 1px solid rgba(255, 255, 255, 0.2) !important; background: transparent !important; border-radius: 6px !important; }
          .driver-popover-close-btn { color: rgba(255, 255, 255, 0.5) !important; }
        `;
        document.head.appendChild(style);
        return () => { const el = document.getElementById('incidencias-tutorial-mobile-styles'); if (el) el.remove(); };
    }, []);

    return null;
}
