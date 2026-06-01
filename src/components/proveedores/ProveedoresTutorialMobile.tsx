'use client';

import { useEffect, useRef } from 'react';
import { driver, type DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';
import { usePathname } from 'next/navigation';
import { useProveedores } from '@/context/ProveedoresProvider';
import { useCompanyContext } from '@/context/CompanyProvider';
import { injectSkipButton, removeSkipButton } from '@/lib/tutorial-utils';

/**
 * Mobile version of ProveedoresTutorial.
 * Same behavior as PC but with Android-specific fixes:
 * - touchstart blocker on overlay
 * - No backdrop-filter
 * - touch-action: manipulation on buttons, min 44px touch targets
 */
export function ProveedoresTutorialMobile() {
    const { shouldShowTutorial, isLoading, markAsCompleted } = useProveedores();
    const { selectedCompanyIds } = useCompanyContext();
    const hasRunRef = useRef(false);
    const driverInstanceRef = useRef<ReturnType<typeof driver> | null>(null);
    const lastStepRef = useRef<number>(0);
    const overlayTouchBlockerRef = useRef<((e: TouchEvent) => void) | null>(null);

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

            // 1. Popover is ALWAYS allowed
            const isPopover = target.closest('.driver-popover') || target.closest('.driver-popover-wrapper');

            if (isPopover) {
                if (e.type === 'touchstart' || e.type === 'click') logToTerminal(`✅ PERMITIDO [Paso ${idx}]: Click en Popover (${target.tagName})`);
                return;
            }

            // 2. Step-Specific Surgical Whitelists: Block everything else
            let isWhitelisted = false;
            // Strict mode for Proveedores: ONLY popover and critical portals are allowed.
            // Highlighted elements are kept inclickeable via CSS.
            if (target.closest('.driver-popover') || target.closest('[data-radix-portal]')) isWhitelisted = true;

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

    const pathname = usePathname();

    useEffect(() => {
        if (typeof window !== 'undefined' && localStorage.getItem('force_tutorial_proveedores') === 'true') {
            logToTerminal('🔄 [PROVEEDORES] Replay detectado, reseteando hasRunRef');
            hasRunRef.current = false;
        }

        if (isLoading || !shouldShowTutorial || hasRunRef.current) return;

        const hasSelectedCompanies = selectedCompanyIds && selectedCompanyIds.length > 0;

        const startTextOnlyTutorial = () => {
            const textSteps: DriveStep[] = [
                {
                    element: '[data-tutorial="proveedores-header"]',
                    popover: {
                        title: '¡Bienvenido a Entidades! 🏢',
                        description: 'Esta sección te permite gestionar todos tus proveedores y clientes de forma centralizada. Aquí puedes analizar gastos e ingresos, ver documentos y explorar productos.\n\nNota: Para ver datos reales, necesitas tener empresas seleccionadas en el sistema.',
                        side: 'bottom' as const, align: 'start' as const,
                    },
                },
                {
                    element: '[data-tutorial="proveedores-header"]',
                    popover: {
                        title: 'Tabla de Entidades 📊',
                        description: 'La tabla principal muestra un listado de todos tus proveedores o clientes con información básica: nombre, total operado, cantidad de documentos y productos únicos. Podés ordenar, filtrar y buscar entidades.',
                        side: 'bottom' as const,
                    },
                },
                {
                    element: '[data-tutorial="proveedores-header"]',
                    popover: {
                        title: 'Vista de Detalle de Entidad 🔍',
                        description: 'Al tocar cualquier proveedor o cliente de la tabla, entrás a su página de detalle donde encontrarás tres pestañas:\n\n• Resumen: Dashboard interactivo con gráficos\n• Documentos: Acceso completo a todas las facturas\n• Productos: Catálogo completo de productos.',
                        side: 'bottom' as const,
                    },
                },
                {
                    element: '[data-tutorial="proveedores-header"]',
                    popover: {
                        title: '¡Tutorial Completado! 🎉',
                        description: '¡Seleccioná empresas y empezá a gestionar tus entidades de forma inteligente!\n\n✔️ Tabla con listado y métricas\n✔️ Pestañas Proveedores/Clientes\n✔️ Vista de detalle con tres pestañas\n✔️ Análiticas completas',
                        side: 'bottom' as const,
                    },
                },
            ];

            const driverObj = driver({
                showProgress: true,
                steps: textSteps,
                nextBtnText: 'Siguiente →',
                prevBtnText: '← Anterior',
                doneBtnText: '¡Entendido!',
                allowClose: true,
                disableActiveInteraction: true,
                showButtons: ['next', 'previous', 'close'],
                animate: true,
                overlayOpacity: 0.75,
                onHighlightStarted: (element, step, options) => {
                    const currentStepIndex = options.state.activeIndex ?? 0;
                    lastStepRef.current = currentStepIndex;
                    console.log('🎯 [ProveedoresTutorialMobile-Text] Paso:', currentStepIndex, element);

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
                    const total = textSteps.length;
                    if (idx === total - 1) {
                        markAsCompleted();
                        removeGlobalTouchBlocker();
                        removeSkipButton();
                        document.body.classList.forEach(cls => {
                            if (cls.startsWith('tutorial-step-')) document.body.classList.remove(cls);
                        });
                        setTimeout(() => driverObj.destroy(), 100);
                    } else {
                        driverObj.moveNext();
                    }
                },
                onCloseClick: () => {
                    markAsCompleted();
                    removeSkipButton();
                    driverInstanceRef.current?.destroy();
                },
                onPrevClick: () => driverObj.movePrevious(),
                onDestroyStarted: async () => {
                    removeSkipButton();
                    removeGlobalTouchBlocker();
                    document.body.classList.forEach(cls => {
                        if (cls.startsWith('tutorial-step-')) document.body.classList.remove(cls);
                    });
                    const styleEl = document.getElementById('proveedores-tutorial-mobile-styles');
                    if (styleEl) styleEl.remove();
                },
            });

            driverInstanceRef.current = driverObj;
            addGlobalTouchBlocker();
            setTimeout(() => driverObj.drive(), 300);
        };

        const startVisualTutorial = () => {
            const visualSteps: DriveStep[] = [
                {
                    element: '[data-tutorial="proveedores-header"]',
                    popover: {
                        title: '¡Bienvenido a Entidades! 🏢',
                        description: 'Aquí podés gestionar todos tus proveedores y clientes, analizar gastos e ingresos, ver documentos y explorar productos.',
                        side: 'bottom' as const, align: 'start' as const,
                    },
                },
                {
                    element: '[data-tutorial="proveedores-tabs"]',
                    popover: {
                        title: 'Proveedores y Clientes 🔄',
                        description: 'Usá estas pestañas para cambiar entre el listado de Proveedores (gastos) y Clientes (ingresos).',
                        side: 'bottom' as const, align: 'end' as const,
                    },
                },
                {
                    element: '[data-tutorial="proveedores-tabla"]',
                    popover: {
                        title: 'Tabla de Entidades 📊',
                        description: 'La tabla muestra todas tus entidades con: nombre, total operado, documentos y productos únicos. Tocá cualquier fila para entrar al detalle.',
                        side: 'top' as const, align: 'start' as const,
                    },
                },
                { element: '[data-tutorial="proveedores-header"]', popover: { title: 'Vista de Detalle 🔍', description: 'Al tocar un proveedor o cliente verás tres pestañas:\n\n• Resumen: Analíticas y gráficos\n• Documentos: Facturas con filtros\n• Productos: Catálogo con historial de precios', side: 'bottom' as const } },
                { element: '[data-tutorial="proveedores-header"]', popover: { title: 'Pestaña Resumen 📈', description: 'Gráficos de gastos e ingresos mensuales y métricas clave para identificar patrones.', side: 'bottom' as const } },
                { element: '[data-tutorial="proveedores-header"]', popover: { title: 'Pestaña Documentos 📄', description: 'Todas las facturas ordenadas cronológicamente con filtros avanzados.', side: 'bottom' as const } },
                { element: '[data-tutorial="proveedores-header"]', popover: { title: 'Pestaña Productos 📦', description: 'Catálogo completo de productos con historial de precios o ventas y frecuencias.', side: 'bottom' as const } },
                { element: '[data-tutorial="proveedores-header"]', popover: { title: 'Detalle de Producto 🎯', description: 'Al tocar un producto verás estadísticas completas: promedio, evolución y alertas.', side: 'bottom' as const } },
                { element: '[data-tutorial="proveedores-header"]', popover: { title: 'Alertas Inteligentes 🚨', description: 'El sistema detecta automáticamente anomalías como cambios bruscos de precios o cantidades.', side: 'bottom' as const } },
                { element: '[data-tutorial="proveedores-header"]', popover: { title: '¡Tutorial Completado! 🎉', description: '✔️ Pestañas Proveedores/Clientes\n✔️ Tabla con listado y métricas\n✔️ Detalle con tres pestañas\n✔️ Analíticas completas\n✔️ Detección de anomalías\n\n¡Empezá a gestionar tus entidades de forma inteligente!', side: 'bottom' as const } },
            ];

            const driverObj = driver({
                showProgress: true,
                steps: visualSteps,
                nextBtnText: 'Siguiente →',
                prevBtnText: '← Anterior',
                doneBtnText: '¡Entendido!',
                allowClose: true,
                disableActiveInteraction: false,
                showButtons: ['next', 'previous', 'close'],
                animate: true,
                overlayOpacity: 0.75,
                onHighlightStarted: (element, step, options) => {
                    const currentStepIndex = options.state.activeIndex ?? 0;
                    lastStepRef.current = currentStepIndex;
                    console.log('🎯 [ProveedoresTutorialMobile-Visual] Paso:', currentStepIndex, element);

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
                    const total = visualSteps.length;
                    if (idx === total - 1) {
                        markAsCompleted();
                        removeGlobalTouchBlocker();
                        removeSkipButton();
                        document.body.classList.forEach(cls => {
                            if (cls.startsWith('tutorial-step-')) document.body.classList.remove(cls);
                        });
                        setTimeout(() => driverObj.destroy(), 100);
                    } else {
                        driverObj.moveNext();
                    }
                },
                onCloseClick: () => {
                    markAsCompleted();
                    removeSkipButton();
                    driverInstanceRef.current?.destroy();
                },
                onPrevClick: () => driverObj.movePrevious(),
                onDestroyStarted: () => {
                    removeGlobalTouchBlocker();
                    document.body.classList.forEach(cls => {
                        if (cls.startsWith('tutorial-step-')) document.body.classList.remove(cls);
                    });
                    const styleEl = document.getElementById('proveedores-tutorial-mobile-styles');
                    if (styleEl) styleEl.remove();
                },
            });

            driverInstanceRef.current = driverObj;
            addGlobalTouchBlocker();
            setTimeout(() => driverObj.drive(), 300);
        };

        if (!hasSelectedCompanies) {
            hasRunRef.current = true;
            startTextOnlyTutorial();
            return () => {
                if (driverInstanceRef.current) { driverInstanceRef.current.destroy(); driverInstanceRef.current = null; }
            };
        }

        let attempts = 0;
        const interval = setInterval(() => {
            attempts++;
            if (attempts >= 50) {
                clearInterval(interval);
                hasRunRef.current = true;
                startVisualTutorial();
                return;
            }
            const header = document.querySelector('[data-tutorial="proveedores-header"]');
            const tabla = document.querySelector('[data-tutorial="proveedores-tabla"]');
            if (header && tabla) {
                clearInterval(interval);
                hasRunRef.current = true;
                startVisualTutorial();
            }
        }, 100);

        return () => {
            clearInterval(interval);
            if (driverInstanceRef.current) {
                driverInstanceRef.current.destroy();
                driverInstanceRef.current = null;
            }
            removeGlobalTouchBlocker();
        };
    }, [shouldShowTutorial, isLoading, markAsCompleted, selectedCompanyIds]);

    useEffect(() => {
        const style = document.createElement('style');
        style.id = 'proveedores-tutorial-mobile-styles';
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
        pointer-events: none !important; /* Strict inclickeable limit */
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
        return () => { const el = document.getElementById('proveedores-tutorial-mobile-styles'); if (el) el.remove(); };
    }, []);

    return null;
}
