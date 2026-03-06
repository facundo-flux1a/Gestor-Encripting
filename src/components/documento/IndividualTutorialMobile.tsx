'use client';

import { useEffect, useRef } from 'react';
import { driver, type DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';
import { useIndividual } from '@/context/IndividualProvider';

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
    const overlayTouchBlockerRef = useRef<((e: TouchEvent) => void) | null>(null);

    const addGlobalTouchBlocker = () => {
        if (overlayTouchBlockerRef.current) return;
        const handler = (e: Event) => {
            const target = e.target as HTMLElement;
            // Whitelist: Popover
            const isWhitelisted = target.closest('.driver-popover') ||
                target.closest('.driver-popover-wrapper') ||
                target.closest('[data-tutorial="documento-actions"]') ||
                target.closest('[data-tutorial="documento-analizar"]') ||
                target.closest('[data-tutorial="documento-archivo"]') ||
                target.closest('[data-radix-popper-content-wrapper]');

            if (!isWhitelisted) {
                if (e.cancelable) e.preventDefault();
                e.stopPropagation();
            }
        };
        ['touchstart', 'mousedown', 'click'].forEach(evt => {
            document.addEventListener(evt, handler, { passive: false, capture: true });
        });
        overlayTouchBlockerRef.current = handler as any;
    };

    const removeGlobalTouchBlocker = () => {
        if (overlayTouchBlockerRef.current) {
            ['touchstart', 'mousedown', 'click'].forEach(evt => {
                document.removeEventListener(evt, overlayTouchBlockerRef.current as any, { capture: true });
            });
        }
        overlayTouchBlockerRef.current = null;
    };

    const addTouchBlocker = () => { };
    const removeTouchBlocker = () => { };

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
                    description: '¡Bienvenido! Aquí puedes ver todos los detalles de un documento, editarlo, validar incidencias y más.',
                    side: 'bottom' as const, align: 'start' as const,
                },
            },
            {
                element: '[data-tutorial="documento-actions"]',
                popover: {
                    title: '⚡ Acciones del Documento',
                    description: 'Desde aquí puedes: Ver el PDF original, Editar el documento, Validar incidencias, Eliminar y Exportar. Ten en cuenta que si el trimestre está cerrado, no podrás editar.',
                    side: 'bottom' as const, align: 'end' as const,
                },
            },
            {
                element: '[data-tutorial="documento-view"]',
                popover: {
                    title: '📋 Información del Documento',
                    description: 'Aquí podrás ver datos como: número de documento, fechas, tipo, estado de verificación y todas las líneas de productos/servicios.',
                    side: 'right' as const, align: 'start' as const,
                },
            },
        ];

        if (hasIncidencias) {
            steps.push({
                element: '[data-tutorial="documento-incidencias"]',
                popover: {
                    title: '⚠️ Incidencias Detectadas',
                    description: 'Este documento tiene incidencias sin resolver. Puedes analizarlo de nuevo o validarlas manualmente si ya las resolviste.',
                    side: 'left' as const, align: 'start' as const,
                },
            });
        }

        steps.push({
            element: '[data-tutorial="documento-analizar"]',
            popover: {
                title: '🔍 Análisis Inteligente con IA',
                description: 'Usa ésta herramienta para que el sistema analice automáticamente el documento y detecte posibles errores o duplicados.',
                side: 'left' as const, align: 'start' as const,
            },
        });

        steps.push({
            element: '[data-tutorial="documento-entidades"]',
            popover: {
                title: '🏢 Entidades del Documento',
                description: 'Aquí ves la información del proveedor o cliente, como: nombre, CIF, dirección y datos de contacto.',
                side: 'left' as const, align: 'start' as const,
            },
        });

        steps.push({
            element: '[data-tutorial="documento-financiero"]',
            popover: {
                title: '💰 Resumen Financiero',
                description: 'Resumen de importes: Base imponible, IVA desglosado por tipo, retenciones (si aplica) y total del documento.',
                side: 'left' as const, align: 'start' as const,
            },
        });

        if (hasArchivo) {
            steps.push({
                element: '[data-tutorial="documento-archivo"]',
                popover: {
                    title: '📎 Archivo Original',
                    description: 'Puedes tocar "Ver" para abrir el PDF original del documento en una vista previa.',
                    side: 'bottom' as const, align: 'center' as const,
                },
            });
        }

        steps.push({
            element: '[data-tutorial="documento-header"]',
            popover: {
                title: '🎉 ¡Tutorial Completado!',
                description: '¡Perfecto! Ya conoces todas las herramientas para gestionar documentos. Puedes editar, analizar y validar documentos según tus necesidades.',
                side: 'bottom' as const, align: 'center' as const,
            },
        });

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
                console.log('🎯 [IndividualTutorialMobile] Paso:', currentStepIndex, element);

                document.body.classList.forEach(cls => {
                    if (cls.startsWith('tutorial-step-')) document.body.classList.remove(cls);
                });
                document.body.classList.add(`tutorial-step-${currentStepIndex}`);

                addGlobalTouchBlocker();
            },

            onNextClick: (element, step, options) => {
                const idx = options.state.activeIndex ?? 0;
                const total = driverInstance.getConfig().steps?.length ?? 0;
                if (idx === total - 1) {
                    markAsCompleted();
                    setTimeout(() => driverInstance.destroy(), 100);
                } else {
                    driverInstance.moveNext();
                }
            },

            onCloseClick: () => {
                const idx = driverInstance.getActiveIndex() ?? 0;
                const total = driverInstance.getConfig().steps?.length ?? 0;
                if (idx >= total - 2) markAsCompleted();
                driverInstance.destroy();
            },

            onPrevClick: () => driverInstance.movePrevious(),

            onDestroyStarted: () => {
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
      .driver-overlay { pointer-events: auto !important; }
      #driver-page-overlay, #driver-highlighted-element-stage { pointer-events: none !important; }

      body:has(.driver-overlay) * { pointer-events: none !important; }
      body:has(.driver-overlay) .driver-popover, 
      body:has(.driver-overlay) .driver-popover * { 
        pointer-events: auto !important; 
        z-index: 10000005 !important;
      }
      .driver-active-element, .driver-active-element *, .driver-active-element button,
      .driver-active-element a, .driver-active-element input, .driver-active-element [role="button"] {
        pointer-events: none !important; cursor: default !important;
      }
      .driver-popover, .driver-popover-wrapper, .driver-popover *, .driver-popover button {
        pointer-events: auto !important; cursor: pointer !important;
        z-index: 10000005 !important;
        touch-action: manipulation !important;
        -webkit-tap-highlight-color: transparent !important;
      }
      .driver-popover button { min-height: 44px !important; }
      .driver-active-element {
        outline: 4px solid hsl(var(--primary)) !important;
        box-shadow: 0 0 0 4px hsla(var(--primary) / 0.3) !important;
      }
      .driver-popover {
        border: 1px solid hsla(var(--primary) / 0.5) !important;
        background-color: rgba(15, 23, 42, 0.95) !important;
        border-radius: 12px !important;
        color: white !important;
        box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.3) !important;
      }
      .driver-popover-title { color: white !important; font-weight: 700 !important; font-size: 1.1rem !important; }
      .driver-popover-description { color: rgba(255,255,255,0.9) !important; font-weight: 500 !important; line-height: 1.5 !important; }
      .driver-popover-progress-text { color: rgba(255,255,255,0.5) !important; }
      .driver-popover-next-btn {
        background-color: hsl(var(--primary)) !important; color: white !important;
        border: none !important; font-weight: 600 !important; border-radius: 6px !important;
        touch-action: manipulation !important;
      }
      .driver-popover-prev-btn {
        color: white !important; border: 1px solid rgba(255,255,255,0.2) !important;
        background: transparent !important; font-weight: 500 !important; border-radius: 6px !important;
        touch-action: manipulation !important;
      }
      .driver-popover-close-btn {
        color: rgba(255,255,255,0.5) !important; touch-action: manipulation !important;
        min-height: 44px !important; min-width: 44px !important;
      }
      .driver-popover-arrow { border-bottom-color: rgba(15,23,42,0.95) !important; border-top-color: rgba(15,23,42,0.95) !important; }
      body:has(.driver-overlay) * { pointer-events: none !important; }
      body:has(.driver-overlay) .driver-popover, body:has(.driver-overlay) .driver-popover * { pointer-events: auto !important; }
    `;
        document.head.appendChild(style);
        return () => { const el = document.getElementById('individual-tutorial-mobile-styles'); if (el) el.remove(); };
    }, []);

    return null;
}
