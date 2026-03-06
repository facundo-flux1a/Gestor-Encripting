'use client';

import { useEffect, useRef } from 'react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { useActividad } from '@/context/ActividadProvider';

/**
 * Mobile version of ActividadTutorial.
 * Same behavior as PC but with Android-specific fixes:
 * - touchstart blocker on overlay
 * - No backdrop-filter
 * - touch-action: manipulation and min-height: 44px on buttons
 * - position: fixed for any blockers
 */
export function ActividadTutorialMobile() {
    const { shouldShowTutorial, isLoading, markAsCompleted, setTutorialMode } = useActividad();
    const driverInstanceRef = useRef<ReturnType<typeof driver> | null>(null);
    const hasRunRef = useRef(false);
    const overlayTouchBlockerRef = useRef<((e: TouchEvent) => void) | null>(null);
    const lastStepRef = useRef(0);

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

    useEffect(() => {
        if (isLoading || !shouldShowTutorial || hasRunRef.current) return;

        const checkForTable = setInterval(() => {
            const welcomeElement = document.querySelector('[data-tutorial="actividad-welcome"]');
            if (welcomeElement) {
                clearInterval(checkForTable);
                hasRunRef.current = true;
                startTutorial();
            }
        }, 500);

        return () => {
            clearInterval(checkForTable);
            if (driverInstanceRef.current) {
                driverInstanceRef.current.destroy();
                driverInstanceRef.current = null;
            }
            removeGlobalTouchBlocker();
        };
    }, [isLoading, shouldShowTutorial]);

    const addGlobalTouchBlocker = () => {
        if (overlayTouchBlockerRef.current) return;
        const handler = (e: Event) => {
            const target = e.target as HTMLElement;
            const idx = lastStepRef.current;

            // 1. Popover is ALWAYS allowed
            const isPopover = target.closest('.driver-popover') || target.closest('.driver-popover-wrapper');

            if (isPopover) {
                if (e.type === 'touchstart' || e.type === 'click') logToTerminal(`✅ PERMITIDO [Paso ${idx}]: Click en Popover (${target.tagName})`);
                return;
            }

            // 2. Step-Specific Surgical Whitelists: Block everything else
            let isWhitelisted = false;
            // Examples: Table interaction in specific steps, filters, etc.
            if (idx === 1 && target.closest('[data-tutorial="actividad-table"]')) isWhitelisted = true;
            else if (idx === 4 && target.closest('[data-tutorial="actividad-mark-read"]')) isWhitelisted = true;
            else if (idx === 5 && target.closest('[data-tutorial="actividad-filters"]')) isWhitelisted = true;
            else if (idx === 7 && target.closest('[data-tutorial="actividad-actions"]')) isWhitelisted = true;

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

    const addTouchBlocker = () => { };
    const removeTouchBlocker = () => { };

    const startTutorial = () => {
        setTutorialMode(true);

        const hasRows = document.querySelector('[data-tutorial="actividad-badges"]') !== null;
        const hasZipRows = document.querySelector('[data-tutorial="actividad-zip"]') !== null;

        const driverInstance = driver({
            showProgress: true,
            showButtons: ['next', 'previous'],
            animate: true,
            allowClose: false,
            overlayOpacity: 0.75,
            disableActiveInteraction: true,

            steps: [
                {
                    element: '[data-tutorial="actividad-welcome"]',
                    popover: {
                        title: '📊 Historial de Actividad',
                        description: '¡Bienvenido! Aquí vas a ver todos los documentos que subiste, su estado de procesamiento, y acciones disponibles.',
                        side: 'bottom' as const, align: 'start' as const,
                    },
                },
                {
                    element: '[data-tutorial="actividad-table"]',
                    popover: {
                        title: '📋 Tabla de Actividades',
                        description: 'Esta tabla muestra todas tus actividades. Cada fila representa un documento subido. Podés tocar documentos completados para verlos en detalle.',
                        side: 'top' as const, align: 'center' as const,
                    },
                },
                ...(hasRows ? [{
                    element: '[data-tutorial="actividad-badges"]',
                    popover: {
                        title: '🎨 Estados y Notificaciones',
                        description: 'Los badges de color indican el estado: ✅ Verde = Completado, 🔴 Rojo = Fallido, 🟡 Amarillo = Interrumpido.',
                        side: 'right' as const, align: 'start' as const,
                    },
                }] : []),
                ...(hasZipRows ? [{
                    element: '[data-tutorial="actividad-zip"]',
                    popover: {
                        title: '📁 Archivos ZIP/RAR',
                        description: 'Los archivos ZIP/RAR se muestran como carpetas. Tocá cualquier fila ZIP para expandir y ver los documentos contenidos.',
                        side: 'right' as const, align: 'start' as const,
                    },
                }] : []),
                {
                    element: '[data-tutorial="actividad-mark-read"]',
                    popover: {
                        title: '✅ Marcar como Leídos',
                        description: 'Con este botón podés marcar todas las actividades como leídas de una vez.',
                        side: 'bottom' as const, align: 'end' as const,
                    },
                },
                {
                    element: '[data-tutorial="actividad-filters"]',
                    popover: {
                        title: '🔍 Filtros',
                        description: 'Usá los filtros para buscar actividades específicas por estado, fecha, o texto.',
                        side: 'bottom' as const, align: 'end' as const,
                    },
                },
                {
                    element: '[data-tutorial="actividad-autorefresh"]',
                    popover: {
                        title: '🔄 Actualización Automática',
                        description: 'Activá el auto-refresh para que la tabla se actualice automáticamente mientras procesás documentos.',
                        side: 'bottom' as const, align: 'end' as const,
                    },
                },
                ...(hasRows ? [{
                    element: '[data-tutorial="actividad-actions"]',
                    popover: {
                        title: '⚡ Acciones Disponibles',
                        description: 'Cada fila tiene acciones: ✅ Marcar leído, 🔄 Reintentar (si falló), 🗑️ Eliminar el registro de actividad.',
                        side: 'left' as const, align: 'center' as const,
                    },
                }] : []),
                {
                    element: '[data-tutorial="actividad-welcome"]',
                    popover: {
                        title: '🎉 ¡Tutorial Completado!',
                        description: '¡Perfecto! Ahora podés gestionar todo tu historial de documentos.',
                        align: 'center' as const,
                    },
                },
            ],

            nextBtnText: 'Siguiente →',
            prevBtnText: '← Anterior',
            doneBtnText: '¡Entendido!',

            onHighlightStarted: (element, step, options) => {
                const currentStepIndex = options.state.activeIndex ?? 0;
                lastStepRef.current = currentStepIndex;
                console.log('🎯 [ActividadTutorialMobile] Paso:', currentStepIndex, element);

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
                    // Clean up blockers immediately to avoid "lock"
                    removeGlobalTouchBlocker();
                    document.body.classList.forEach(cls => {
                        if (cls.startsWith('tutorial-step-')) document.body.classList.remove(cls);
                    });
                    setTimeout(() => driverInstance.destroy(), 100);
                } else {
                    driverInstance.moveNext();
                }
            },

            onCloseClick: () => {
                removeGlobalTouchBlocker();
                document.body.classList.forEach(cls => {
                    if (cls.startsWith('tutorial-step-')) document.body.classList.remove(cls);
                });
                const idx = driverInstance.getActiveIndex() ?? 0;
                const total = driverInstance.getConfig().steps?.length ?? 0;
                if (idx >= total - 2) markAsCompleted();
                driverInstance.destroy();
            },

            onPrevClick: () => driverInstance.movePrevious(),

            onDestroyStarted: () => {
                setTutorialMode(false);
                removeGlobalTouchBlocker();
                document.body.classList.forEach(cls => {
                    if (cls.startsWith('tutorial-step-')) document.body.classList.remove(cls);
                });
                const styleEl = document.getElementById('actividad-tutorial-mobile-styles');
                if (styleEl) styleEl.remove();
            },
        });

        driverInstanceRef.current = driverInstance;
        addGlobalTouchBlocker();
        setTimeout(() => driverInstance.drive(), 300);
    };

    useEffect(() => {
        const style = document.createElement('style');
        style.id = 'actividad-tutorial-mobile-styles';
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
        outline: 4px solid hsl(var(--primary)) !important;
        box-shadow: 0 0 0 4px hsla(var(--primary) / 0.3) !important;
        pointer-events: auto !important;
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
        return () => { const el = document.getElementById('actividad-tutorial-mobile-styles'); if (el) el.remove(); };
    }, []);

    return null;
}
