'use client';

import { useEffect, useRef } from 'react';
import { driver, type DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';
import { useProveedores } from '@/context/ProveedoresProvider';
import { useCompanyContext } from '@/context/CompanyProvider';

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

    useEffect(() => {
        if (isLoading || !shouldShowTutorial || hasRunRef.current) return;

        const hasSelectedCompanies = selectedCompanyIds && selectedCompanyIds.length > 0;

        const startTextOnlyTutorial = () => {
            const textSteps: DriveStep[] = [
                {
                    element: 'body',
                    popover: {
                        title: '¡Bienvenido a Proveedores! 🏢',
                        description: 'Esta sección te permite gestionar todos tus proveedores de forma centralizada. Aquí puedes analizar gastos, ver documentos, explorar productos y detectar anomalías.\n\nNota: Para ver datos reales, necesitas tener empresas seleccionadas en el sistema.',
                        side: 'over' as const,
                    },
                },
                {
                    element: 'body',
                    popover: {
                        title: 'Tabla de Proveedores 📊',
                        description: 'La tabla principal muestra un listado de todos tus proveedores con información básica: nombre, total gastado, cantidad de documentos y productos únicos. Podés ordenar, filtrar y buscar proveedores.',
                        side: 'over' as const,
                    },
                },
                {
                    element: 'body',
                    popover: {
                        title: 'Vista de Detalle del Proveedor 🔍',
                        description: 'Al tocar cualquier proveedor de la tabla, entras a su página de detalle donde encontrarás tres pestañas:\n\n• Resumen: Dashboard interactivo con gráficos de gastos\n• Documentos: Acceso completo a todas las facturas\n• Productos: Catálogo completo de productos comprados.',
                        side: 'over' as const,
                    },
                },
                {
                    element: 'body',
                    popover: {
                        title: '¡Tutorial Completado! 🎉',
                        description: '¡Selecciona empresas y empieza a gestionar tus proveedores de forma inteligente!\n\n✅ Tabla con listado y métricas\n✅ Vista de detalle con tres pestañas\n✅ Analíticas completas por proveedor',
                        side: 'over' as const,
                    },
                },
            ];

            const driverObj = driver({
                showProgress: true,
                steps: textSteps,
                nextBtnText: 'Siguiente →',
                prevBtnText: '← Anterior',
                doneBtnText: '¡Entendido!',
                allowClose: false,
                disableActiveInteraction: false,
                showButtons: ['next', 'previous'],
                animate: true,
                overlayOpacity: 0.75,
                onHighlightStarted: (element, step, options) => {
                    lastStepRef.current = options.state.activeIndex ?? 0;
                    setTimeout(() => addTouchBlocker(), 50);
                },
                onNextClick: () => driverObj.moveNext(),
                onPrevClick: () => driverObj.movePrevious(),
                onDestroyStarted: async () => {
                    const finalStep = lastStepRef.current;
                    const totalSteps = textSteps.length - 1;
                    if (finalStep >= totalSteps) await markAsCompleted();
                    removeTouchBlocker();
                    if (driverInstanceRef.current) {
                        driverInstanceRef.current.destroy();
                        driverInstanceRef.current = null;
                    }
                },
            });

            driverInstanceRef.current = driverObj;
            setTimeout(() => driverObj.drive(), 300);
        };

        const startVisualTutorial = () => {
            const visualSteps: DriveStep[] = [
                {
                    element: '[data-tutorial="proveedores-header"]',
                    popover: {
                        title: '¡Bienvenido a Proveedores! 🏢',
                        description: 'Aquí puedes gestionar todos tus proveedores, analizar gastos, ver documentos y explorar productos.',
                        side: 'bottom' as const, align: 'start' as const,
                    },
                },
                {
                    element: '[data-tutorial="proveedores-tabla"]',
                    popover: {
                        title: 'Tabla de Proveedores 📊',
                        description: 'La tabla muestra todos tus proveedores con: nombre, total gastado, documentos y productos únicos. Tocá cualquier fila para entrar al detalle del proveedor.',
                        side: 'top' as const, align: 'start' as const,
                    },
                },
                { element: 'body', popover: { title: 'Vista de Detalle 🔍', description: 'Al tocar un proveedor verás tres pestañas:\n\n• Resumen: Analíticas y gráficos\n• Documentos: Facturas con filtros\n• Productos: Catálogo con historial de precios', side: 'over' as const } },
                { element: 'body', popover: { title: 'Pestaña Resumen 📈', description: 'Gráficos de gastos mensuales y métricas clave para identificar patrones y optimizar costos.', side: 'over' as const } },
                { element: 'body', popover: { title: 'Pestaña Documentos 📄', description: 'Todas las facturas ordenadas cronológicamente con filtros avanzados.', side: 'over' as const } },
                { element: 'body', popover: { title: 'Pestaña Productos 📦', description: 'Catálogo completo de productos con historial de precios y frecuencias de compra.', side: 'over' as const } },
                { element: 'body', popover: { title: 'Détalle de Producto 🎯', description: 'Al tocar un producto verás estadísticas completas: precio promedio, evolución y alertas sobre variaciones de costos.', side: 'over' as const } },
                { element: 'body', popover: { title: 'Alertas Inteligentes 🚨', description: 'El sistema detecta automáticamente anomalías como cambios bruscos de precio o cantidades inusuales.', side: 'over' as const } },
                { element: 'body', popover: { title: '¡Tutorial Completado! 🎉', description: '✅ Tabla con listado y métricas\n✅ Detalle con tres pestañas\n✅ Analíticas completas\n✅ Detección inteligente de anomalías\n\n¡Empieza a gestionar tus compras de forma inteligente!', side: 'over' as const } },
            ];

            const driverObj = driver({
                showProgress: true,
                steps: visualSteps,
                nextBtnText: 'Siguiente →',
                prevBtnText: '← Anterior',
                doneBtnText: '¡Entendido!',
                allowClose: false,
                disableActiveInteraction: false,
                showButtons: ['next', 'previous'],
                animate: true,
                overlayOpacity: 0.75,
                onHighlightStarted: (element, step, options) => {
                    lastStepRef.current = options.state.activeIndex ?? 0;
                    setTimeout(() => addTouchBlocker(), 50);
                },
                onNextClick: (element, step, options) => {
                    const idx = options.state.activeIndex ?? 0;
                    const total = driverObj.getConfig().steps?.length ?? 0;
                    if (idx === total - 1) {
                        markAsCompleted();
                        setTimeout(() => driverObj.destroy(), 100);
                    } else {
                        driverObj.moveNext();
                    }
                },
                onCloseClick: () => {
                    const idx = driverObj.getActiveIndex() ?? 0;
                    const total = driverObj.getConfig().steps?.length ?? 0;
                    if (idx >= total - 2) markAsCompleted();
                    driverObj.destroy();
                },
                onPrevClick: () => driverObj.movePrevious(),
                onDestroyStarted: () => {
                    removeTouchBlocker();
                    document.body.classList.forEach(cls => {
                        if (cls.startsWith('tutorial-step-')) document.body.classList.remove(cls);
                    });
                },
            });

            driverInstanceRef.current = driverObj;
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
            if (driverInstanceRef.current) { driverInstanceRef.current.destroy(); driverInstanceRef.current = null; }
        };
    }, [shouldShowTutorial, isLoading, markAsCompleted, selectedCompanyIds]);

    useEffect(() => {
        const style = document.createElement('style');
        style.id = 'proveedores-tutorial-mobile-styles';
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
        return () => { const el = document.getElementById('proveedores-tutorial-mobile-styles'); if (el) el.remove(); };
    }, []);

    return null;
}
