'use client';

import { useEffect, useState, useRef } from 'react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { useTutorial } from '@/context/tutorial-context';
import { useCompanyContext } from '@/context/CompanyProvider';

/**
 * Mobile version of DashboardTutorial.
 * Key Android fixes:
 * - sidebar-blocker uses position: fixed (not absolute)
 * - No programmatic .click() to open/collapse sidebar
 * - touchstart handler added to overlay with preventDefault for proper blocking
 * - No backdrop-filter on popover (causes broken stacking context on Android)
 * - touch-action: manipulation and min-height: 44px on all popover buttons
 */
export function DashboardTutorialMobile() {
    const { shouldShowTutorial, completeTutorial, setIsTutorialActive, currentStep, setCurrentStep } = useTutorial();
    const { companies, selectedCompanyIds } = useCompanyContext();

    const [driverInstance, setDriverInstance] = useState<any>(null);
    const hasInitialized = useRef(false);
    const selectedIdsRef = useRef<number[]>([]);
    const companiesRef = useRef<any[]>([]);
    const lastStepRef = useRef(0);
    const sidebarBlockerRef = useRef<HTMLDivElement | null>(null);
    const overlayTouchBlockerRef = useRef<((e: TouchEvent) => void) | null>(null);

    useEffect(() => { selectedIdsRef.current = selectedCompanyIds; }, [selectedCompanyIds]);
    useEffect(() => { companiesRef.current = companies; }, [companies]);

    const createSidebarBlocker = () => {
        if (sidebarBlockerRef.current) {
            sidebarBlockerRef.current.remove();
            sidebarBlockerRef.current = null;
        }
        const sidebar = document.querySelector('[data-sidebar="sidebar"]');
        if (!sidebar) return;
        const blocker = document.createElement('div');
        blocker.id = 'tutorial-sidebar-blocker-mobile';
        // FIX #4: use position: fixed instead of absolute for stable z-index in mobile viewports
        blocker.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 9999999;
      background: transparent;
      cursor: not-allowed;
      touch-action: none;
    `;
        // FIX #1: also block touch events on the sidebar blocker
        blocker.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
        document.body.appendChild(blocker);
        sidebarBlockerRef.current = blocker;
    };

    const removeSidebarBlocker = () => {
        if (sidebarBlockerRef.current) {
            sidebarBlockerRef.current.remove();
            sidebarBlockerRef.current = null;
        }
        const legacyBlocker = document.getElementById('tutorial-sidebar-blocker-mobile');
        if (legacyBlocker) legacyBlocker.remove();
    };

    const addOverlayTouchBlocker = () => {
        const overlay = document.querySelector('.driver-overlay') as HTMLElement | null;
        if (!overlay || overlayTouchBlockerRef.current) return;
        const handler = (e: TouchEvent) => {
            e.preventDefault();
            e.stopPropagation();
        };
        overlay.addEventListener('touchstart', handler, { passive: false });
        overlayTouchBlockerRef.current = handler;
    };

    const removeOverlayTouchBlocker = () => {
        const overlay = document.querySelector('.driver-overlay') as HTMLElement | null;
        if (overlay && overlayTouchBlockerRef.current) {
            overlay.removeEventListener('touchstart', overlayTouchBlockerRef.current);
        }
        overlayTouchBlockerRef.current = null;
    };

    const showErrorMessage = (hasCompanies: boolean) => {
        const popoverDescription = document.querySelector('.driver-popover-description');
        if (popoverDescription) {
            const existingError = popoverDescription.querySelector('.tutorial-error-msg');
            if (existingError) existingError.remove();
            const errorMsg = document.createElement('p');
            errorMsg.className = 'tutorial-error-msg text-red-500 text-sm mt-2 font-semibold';
            errorMsg.textContent = hasCompanies
                ? '⚠️ Por favor, selecciona al menos una empresa antes de continuar.'
                : '⚠️ Por favor, crea tu primera empresa antes de continuar.';
            popoverDescription.appendChild(errorMsg);
            setTimeout(() => errorMsg.remove(), 3000);
        }
    };

    useEffect(() => {
        if (!shouldShowTutorial) {
            if (driverInstance) {
                driverInstance.destroy();
                setDriverInstance(null);
            }
            return;
        }

        if (hasInitialized.current) return;

        const waitForElement = (selector: string, timeout = 2000): Promise<boolean> => {
            return new Promise((resolve) => {
                if (document.querySelector(selector)) return resolve(true);
                const observer = new MutationObserver(() => {
                    if (document.querySelector(selector)) {
                        observer.disconnect();
                        resolve(true);
                    }
                });
                observer.observe(document.body, { childList: true, subtree: true });
                setTimeout(() => { observer.disconnect(); resolve(false); }, timeout);
            });
        };

        const initDriver = async () => {
            await waitForElement('[data-tutorial="kpis"]');
            const hasCompaniesAtInit = companiesRef.current && companiesRef.current.length > 0;

            const driverObj = driver({
                nextBtnText: 'Siguiente →',
                prevBtnText: '← Anterior',
                doneBtnText: '¡Entendido!',
                showProgress: true,
                showButtons: ['next', 'previous', 'close'],
                animate: true,
                allowClose: true,
                overlayOpacity: 0.75,
                disableActiveInteraction: true,

                onHighlightStarted: (element, step, options) => {
                    const currentIndex = options.state.activeIndex ?? 0;
                    document.body.classList.forEach(cls => {
                        if (cls.startsWith('tutorial-step-')) document.body.classList.remove(cls);
                    });
                    document.body.classList.add(`tutorial-step-${currentIndex}`);

                    const overlay = document.querySelector('.driver-overlay');
                    if (overlay) (overlay as HTMLElement).style.pointerEvents = 'auto';

                    setCurrentStep(currentIndex);
                    lastStepRef.current = currentIndex;

                    setTimeout(() => addOverlayTouchBlocker(), 50);

                    if (currentIndex === 1) {
                        setIsTutorialActive(true);
                        removeSidebarBlocker();
                        setTimeout(() => {
                            const overlay = document.querySelector('.driver-overlay');
                            if (overlay) (overlay as HTMLElement).style.pointerEvents = 'none';
                            // FIX #2: No programmatic sidebar .click() on mobile.
                            // Sidebar interaction is left to the user.
                            // We ensure the company selector is touch-interactive:
                            const companySelector = document.querySelector('[data-tutorial="company-selector"]') as HTMLElement | null;
                            if (companySelector) {
                                companySelector.style.touchAction = 'manipulation';
                                companySelector.querySelectorAll('*').forEach(el => {
                                    (el as HTMLElement).style.touchAction = 'manipulation';
                                });
                            }
                        }, 100);
                    } else if (currentIndex === 2) {
                        setTimeout(() => createSidebarBlocker(), 150);
                    } else {
                        removeSidebarBlocker();
                    }
                },

                onNextClick: (element, step, options) => {
                    const currentIndex = options.state.activeIndex ?? 0;
                    const totalSteps = driverObj.getConfig().steps?.length ?? 0;

                    if (currentIndex === 1) {
                        const hasSelectedCompanies = selectedIdsRef.current.length > 0;
                        const currentHasCompanies = companiesRef.current && companiesRef.current.length > 0;
                        if (currentHasCompanies && hasSelectedCompanies) {
                            setTimeout(() => driverObj.moveNext(), 300);
                        } else if (!currentHasCompanies && companiesRef.current.length > 0) {
                            setTimeout(() => driverObj.moveNext(), 300);
                        } else {
                            showErrorMessage(currentHasCompanies);
                        }
                    } else if (currentIndex === totalSteps - 1) {
                        completeTutorial();
                        setTimeout(() => {
                            driverObj.destroy();
                            setIsTutorialActive(false);
                        }, 100);
                    } else {
                        driverObj.moveNext();
                    }
                },

                onCloseClick: () => {
                    const currentIndex = driverObj.getActiveIndex() ?? 0;
                    const totalSteps = driverObj.getConfig().steps?.length ?? 0;
                    if (currentIndex >= totalSteps - 2) completeTutorial();
                    driverObj.destroy();
                    setIsTutorialActive(false);
                },

                onPrevClick: () => driverObj.movePrevious(),

                steps: [
                    {
                        element: 'body',
                        popover: {
                            title: '¡Bienvenido a tu Gestor Documental! 🎉',
                            description: 'Te guiaremos en un recorrido rápido por las funciones principales de la sección "Dashboard".',
                            side: 'bottom' as any, align: 'center' as any
                        }
                    },
                    {
                        element: hasCompaniesAtInit
                            ? '[data-tutorial="company-selector"]'
                            : '[data-tutorial="company-selector"] button',
                        popover: {
                            title: hasCompaniesAtInit ? 'Seleccionar empresa 🏢' : 'Crear tu primera empresa 🏢',
                            description: hasCompaniesAtInit
                                ? '<p><strong>Acción requerida:</strong> Toca una empresa para seleccionarla.</p><p class="text-sm text-muted-foreground mt-2">Puedes seleccionar múltiples empresas desde el mismo panel.</p>'
                                : '<p><strong>Acción requerida:</strong> Toca "Agregar Empresa" para crear tu primera empresa.</p>',
                            side: 'right' as any, align: 'start' as any
                        }
                    },
                    {
                        element: '[data-sidebar="sidebar"], [data-sidebar="content"]',
                        popover: {
                            title: 'Menú de navegación 🗂️',
                            description: 'Desde este menú lateral puedes acceder a las diferentes secciones: Documentos, Trimestres, Actividad, Incidencias y Proveedores.',
                            side: 'right' as any, align: 'center' as any
                        }
                    },
                    {
                        element: '[data-tutorial="kpis"]',
                        popover: {
                            title: 'Métricas principales 📊',
                            description: 'Estas tarjetas muestran las métricas clave: ingresos, gastos, beneficio bruto, resultado de IVA y total de documentos procesados.',
                            side: 'bottom' as any, align: 'center' as any
                        }
                    },
                    {
                        element: '[data-tutorial="financial-summary"]',
                        popover: {
                            title: 'Resumen Financiero 📈',
                            description: 'Este gráfico muestra la evolución trimestral de tus ingresos (ventas) y gastos.',
                            side: 'top' as any, align: 'center' as any
                        }
                    },
                    {
                        element: '[data-tutorial="distribution-chart"]',
                        popover: {
                            title: 'Distribución de Documentos 🥧',
                            description: 'Aquí ves la distribución de tus documentos: facturas de ingreso, facturas de gasto, albaranes, abonos, etc.',
                            side: 'top' as any, align: 'center' as any
                        }
                    },
                    {
                        element: '[data-tutorial="iva-chart"]',
                        popover: {
                            title: 'Resumen de IVA 💰',
                            description: 'Este gráfico te muestra el IVA repercutido y soportado por trimestre para que controles tu situación fiscal.',
                            side: 'top' as any, align: 'center' as any
                        }
                    },
                    {
                        element: '[data-tutorial="filters"]',
                        popover: {
                            title: 'Filtros de análisis 🔍',
                            description: 'Usa estos filtros para analizar períodos específicos. Selecciona un año y un trimestre para datos más detallados.',
                            side: 'bottom' as any, align: 'start' as any
                        }
                    },
                    {
                        element: 'body',
                        popover: {
                            title: '¡Todo listo! ✨',
                            description: `
                <p>Ya conoces las funciones principales del dashboard. ¡Empieza a explorar!</p>
                <p class="mt-2">Nos vemos en el tutorial de la sección "Documentos". ¡Éxitos!</p>
              `,
                            side: 'bottom' as any, align: 'center' as any
                        }
                    }
                ].filter(step => {
                    if (!hasCompaniesAtInit && step.element === '[data-tutorial="iva-chart"]') return false;
                    return true;
                }),

                onDestroyStarted: () => {
                    setIsTutorialActive(false);
                    setDriverInstance(null);
                    removeSidebarBlocker();
                    removeOverlayTouchBlocker();
                    document.body.classList.forEach(cls => {
                        if (cls.startsWith('tutorial-step-')) document.body.classList.remove(cls);
                    });
                }
            });

            setDriverInstance(driverObj as any);
            setIsTutorialActive(true);
            hasInitialized.current = true;
            driverObj.drive();
        };

        initDriver();
        return () => { removeSidebarBlocker(); removeOverlayTouchBlocker(); };
    }, [shouldShowTutorial]);

    useEffect(() => {
        const style = document.createElement('style');
        style.id = 'dashboard-tutorial-mobile-styles';
        style.textContent = `
      .driver-active-element, .driver-active-element * {
        pointer-events: auto !important; touch-action: manipulation !important;
      }
      .driver-popover, .driver-popover-wrapper, .driver-popover * {
        pointer-events: auto !important; touch-action: manipulation !important;
        -webkit-tap-highlight-color: transparent !important;
      }
      .driver-popover button { min-height: 44px !important; }

      body:has(.driver-overlay) [role="dialog"] { z-index: 10000001 !important; }
      body:has(.driver-overlay) [data-radix-dialog-overlay] { z-index: 10000000 !important; }
      body:has(.driver-overlay) [role="dialog"] * { pointer-events: auto !important; touch-action: manipulation !important; }

      /* Company selector step: always interactive during tutorial */
      body.tutorial-step-1 header,
      body.tutorial-step-1 [data-tutorial="company-selector"],
      body.tutorial-step-1 [data-tutorial="company-selector"] * {
        z-index: 10000001 !important; position: relative !important;
        pointer-events: auto !important; touch-action: manipulation !important;
      }
      body.tutorial-step-1 [data-radix-popper-content-wrapper] {
        z-index: 10000003 !important;
        pointer-events: auto !important; touch-action: manipulation !important;
      }
      body.tutorial-step-1 [data-radix-popper-content-wrapper] * {
        pointer-events: auto !important; touch-action: manipulation !important;
      }

      /* FIX #5: No backdrop-filter - broken stacking context on Android */
      .driver-popover {
        border: 1px solid hsla(var(--primary) / 0.5) !important;
        background-color: rgba(15, 23, 42, 0.95) !important;
        /* backdrop-filter intentionally removed */
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
      .driver-popover-next-btn:active { opacity: 0.85 !important; }
      .driver-popover-prev-btn {
        color: white !important; border: 1px solid rgba(255,255,255,0.2) !important;
        background: transparent !important; border-radius: 6px !important;
        touch-action: manipulation !important;
      }
      .driver-popover-close-btn {
        color: rgba(255,255,255,0.5) !important; touch-action: manipulation !important;
        min-height: 44px !important; min-width: 44px !important;
      }
      .driver-popover-arrow { border-bottom-color: rgba(15,23,42,0.95) !important; border-top-color: rgba(15,23,42,0.95) !important; }
    `;
        document.head.appendChild(style);
        return () => { const el = document.getElementById('dashboard-tutorial-mobile-styles'); if (el) el.remove(); };
    }, []);

    return (
        <>
            {/* No react-rendered blockers — we use DOM elements for z-index control */}
        </>
    );
}
