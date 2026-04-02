'use client';

import { useEffect, useRef } from 'react';
import { driver, type DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';
import { useIndividual } from '@/context/IndividualProvider';
import { injectSkipButton, removeSkipButton } from '@/lib/tutorial-utils';

/**
 * Mobile version of IndividualTutorial.
 * Same behavior as PC but with Android-specific fixes:
 * - touchstart blocker on overlay
 * - No backdrop-filter
 * - touch-action: manipulation on buttons
 * - min touch target size (44px)
 */
export function IndividualTutorialMobile() {
    const { shouldShowTutorial, isLoading, markAsCompleted } = useIndividual();
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
            // Surgical whitelisting for portals (dropdowns, dialogs)
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

    useEffect(() => {
        if (isLoading || !shouldShowTutorial || hasRunRef.current) return;

        const checkForDocument = setInterval(() => {
            const documentHeader = document.querySelector('[data-tutorial="documento-header"]');
            if (documentHeader) {
                clearInterval(checkForDocument);
                hasRunRef.current = true;
                startTutorial();
            }
        }, 500);

        return () => {
            clearInterval(checkForDocument);
            if (driverInstanceRef.current) {
                driverInstanceRef.current.destroy();
                driverInstanceRef.current = null;
            }
            removeGlobalTouchBlocker();
            removeSkipButton();
        };
    }, [isLoading, shouldShowTutorial]);

    const startTutorial = () => {
        const hasIncidencias = document.querySelector('[data-tutorial="documento-incidencias"]') !== null;
        const hasArchivo = document.querySelector('[data-tutorial="documento-archivo"]') !== null;

        const steps: DriveStep[] = [
            {
                element: '[data-tutorial="documento-header"]',
                popover: {
                    title: '📄 Vista de Documento',
                    description: '¡Bienvenido! Aquí puedes ver todos los detalles de un documento, editarlo y validar incidencias.',
                    side: 'bottom' as const, align: 'start' as const,
                },
            },
            {
                element: '[data-tutorial="documento-actions"]',
                popover: {
                    title: '⚡ Acciones',
                    description: 'Desde aquí puedes: Ver el PDF, Editar, Validar incidencias y Exportar.',
                    side: 'bottom' as const, align: 'end' as const,
                },
            },
            {
                element: '[data-tutorial="documento-view"]',
                popover: {
                    title: '📋 Información',
                    description: 'Datos del documento, fechas, estado y líneas de servicios.',
                    side: 'top' as const, align: 'start' as const,
                },
            },
        ];

        if (hasIncidencias) {
            steps.push({
                element: '[data-tutorial="documento-incidencias"]',
                popover: {
                    title: '⚠️ Incidencias',
                    description: 'Este documento tiene avisos sin resolver. Podés validarlas si ya las revisaste.',
                    side: 'left' as const, align: 'start' as const,
                },
            });
        }

        steps.push({
            element: '[data-tutorial="documento-analizar"]',
            popover: {
                title: '🔍 Análisis IA',
                description: 'Detecta errores o duplicados automáticamente con inteligencia artificial.',
                side: 'left' as const, align: 'start' as const,
            },
        });

        steps.push({
            element: '[data-tutorial="documento-entidades"]',
            popover: {
                title: '🏢 Entidades',
                description: 'Información del proveedor o cliente: nombre, CIF y dirección.',
                side: 'top' as const, align: 'center' as const,
            },
        });

        steps.push({
            element: '[data-tutorial="documento-financiero"]',
            popover: {
                title: '💰 Financiero',
                description: 'Base imponible, IVA desglosado y total del documento.',
                side: 'top' as const, align: 'center' as const,
            },
        });

        if (hasArchivo) {
            steps.push({
                element: '[data-tutorial="documento-archivo"]',
                popover: {
                    title: '📎 Archivo',
                    description: 'Acceso directo a la vista previa del PDF original.',
                    side: 'bottom' as const, align: 'center' as const,
                },
            });
        }

        steps.push({
            element: '[data-tutorial="documento-header"]',
            popover: {
                title: '🎉 ¡Tutorial Completado!',
                description: '¡Listo! Ya podés gestionar tus documentos de forma avanzada.',
                side: 'over' as const, align: 'center' as const,
            },
        });

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
                console.log('🎯 [IndividualTutorialMobile] Paso:', currentStepIndex, element);

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
                markAsCompleted();
                removeGlobalTouchBlocker();
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
        style.id = 'individual-tutorial-mobile-styles';
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
            border: 2px solid white !important;
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
        return () => { const el = document.getElementById('individual-tutorial-mobile-styles'); if (el) el.remove(); };
    }, []);

    return null;
}
