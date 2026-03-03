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
            removeTouchBlocker();
        };
    }, [isLoading, shouldShowTutorial]);

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
                    element: 'body',
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
                setTimeout(() => addTouchBlocker(), 50);
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
                setTutorialMode(false);
                removeTouchBlocker();
                document.body.classList.forEach(cls => {
                    if (cls.startsWith('tutorial-step-')) document.body.classList.remove(cls);
                });
            },
        });

        driverInstanceRef.current = driverInstance;
        setTimeout(() => driverInstance.drive(), 300);
    };

    useEffect(() => {
        const style = document.createElement('style');
        style.id = 'actividad-tutorial-mobile-styles';
        style.textContent = `
      .driver-overlay { pointer-events: auto !important; }
      #driver-page-overlay, #driver-highlighted-element-stage { pointer-events: none !important; }
      .driver-active-element, .driver-active-element *, .driver-active-element button,
      .driver-active-element a, .driver-active-element input, .driver-active-element [role="button"] {
        pointer-events: none !important; cursor: default !important;
      }
      .driver-popover, .driver-popover-wrapper, .driver-popover *, .driver-popover button {
        pointer-events: auto !important; cursor: pointer !important;
        touch-action: manipulation !important; -webkit-tap-highlight-color: transparent !important;
      }
      .driver-popover button { min-height: 44px !important; }
      .driver-active-element {
        outline: 4px solid hsl(var(--primary)) !important;
        box-shadow: 0 0 0 4px hsla(var(--primary) / 0.3) !important;
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
      body:has(.driver-overlay) * { pointer-events: none !important; }
      body:has(.driver-overlay) .driver-popover, body:has(.driver-overlay) .driver-popover * { pointer-events: auto !important; }
    `;
        document.head.appendChild(style);
        return () => { const el = document.getElementById('actividad-tutorial-mobile-styles'); if (el) el.remove(); };
    }, []);

    return null;
}
