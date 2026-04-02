'use client';

import { useEffect, useState, useRef } from 'react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { usePathname } from 'next/navigation';
import { useTutorial } from '@/context/tutorial-context';
import { useCompanyContext } from '@/context/CompanyProvider';
import { injectSkipButton, removeSkipButton } from '@/lib/tutorial-utils';

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

    useEffect(() => { selectedIdsRef.current = selectedCompanyIds; }, [selectedCompanyIds]);
    useEffect(() => { companiesRef.current = companies; }, [companies]);

    const addGlobalTouchBlocker = () => {
        if (overlayTouchBlockerRef.current) return;
        const handler = (e: Event) => {
            const target = e.target as HTMLElement;
            const idx = lastStepRef.current;

            if (e.type === 'touchstart' || e.type === 'click') {
                logToTerminal(`🔍 [DASHBOARD] Event: ${e.type}, Step: ${idx}, Target: ${target.tagName}.${target.className}`);
            }

            // 0. Programmatic events (like tutorial .click()) are ALWAYS allowed
            if (e instanceof MouseEvent && !e.isTrusted) return;

            // 1. Popover is ALWAYS allowed
            const isPopover = target.closest('.driver-popover') || target.closest('.driver-popover-wrapper');
            if (isPopover) {
                if (e.type === 'touchstart' || e.type === 'click') logToTerminal(`✅ PERMITIDO [Paso ${idx}]: Popover`);
                return;
            }

            // 2. Step-Specific Surgical Whitelists
            let isWhitelisted = false;

            // Step 2 (Index 1): Company Selector and Creation Modal
            if (idx === 1) {
                const isSidebarTrigger = !!target.closest('[data-sidebar="trigger"]');
                const isCompanySelector = !!target.closest('[data-tutorial="company-selector"]');

                // Sidebar logic: ONLY allow trigger and company selector
                const isInsideSidebar = !!target.closest('[data-sidebar="sidebar"]') || !!target.closest('.bg-sidebar');

                if (isInsideSidebar) {
                    isWhitelisted = isSidebarTrigger || isCompanySelector;
                } else {
                    // Outside sidebar: Allow the "Create Company" modal
                    const isRadixPortal = !!target.closest('[data-radix-portal]');
                    const isRadixPopper = !!target.closest('[data-radix-popper-content-wrapper]');
                    const isDialog = !!target.closest('[role="dialog"]');
                    const isRadixOverlay = !!target.closest('.fixed.inset-0.z-50');
                    const isFormElement = !!target.closest('input') || !!target.closest('button') || !!target.closest('label') || !!target.closest('textarea');

                    if (isRadixPortal || isRadixPopper || isDialog || isRadixOverlay || isFormElement) {
                        isWhitelisted = true;
                    }
                }

                if (isWhitelisted && (e.type === 'touchstart' || e.type === 'click')) {
                    logToTerminal(`✅ PERMITIDO [Paso ${idx}]: Whitelist Modal/Selector (InsideSide=${isInsideSidebar})`);
                }
            } else if (idx >= 2) {
                // Steps 3+: Allow sidebar trigger for tutorial toggling/interaction
                if (target.closest('[data-sidebar="trigger"]')) {
                    isWhitelisted = true;
                    if (e.type === 'touchstart' || e.type === 'click') logToTerminal(`✅ PERMITIDO [Paso ${idx}]: Sidebar Trigger (Whitelist)`);
                }
            }

            if (!isWhitelisted) {
                if (e.type === 'touchstart' || e.type === 'click') {
                    logToTerminal(`🛑 BLOQUEADO [Paso ${idx}]: ${target.tagName} (${target.className})`);
                }
                if (e.cancelable) e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
            }
        };
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

    const pathname = usePathname();

    useEffect(() => {
        if (typeof window !== 'undefined' && localStorage.getItem('force_tutorial_dashboard') === 'true') {
            logToTerminal('🔄 [DASHBOARD] Replay detectado, reseteando hasInitialized');
            hasInitialized.current = false;
        }

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
            // START BLOCKING IMMEDIATELY
            addGlobalTouchBlocker();
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
                disableActiveInteraction: false,

                onHighlightStarted: (element, step, options) => {
                    const currentIndex = options.state.activeIndex ?? 0;
                    document.body.classList.forEach(cls => {
                        if (cls.startsWith('tutorial-step-')) document.body.classList.remove(cls);
                    });
                    document.body.classList.add(`tutorial-step-${currentIndex}`);

                    setCurrentStep(currentIndex);
                    lastStepRef.current = currentIndex;

                    // Ensure blocker is active (redundant but safe)
                    addGlobalTouchBlocker();

                    // Sidebar management: Open at step 3 (index 2), Close at step 4+ (index 3+)
                    setTimeout(() => {
                        const sidebar = document.querySelector('[data-sidebar="sidebar"]');
                        const trigger = document.querySelector('[data-sidebar="trigger"]') as HTMLElement | null;

                        if (currentIndex === 2) {
                            if (!sidebar && trigger) trigger.click();
                        } else if (currentIndex >= 3) {
                            if (sidebar && trigger) trigger.click();
                        }
                    }, 100);

                    injectSkipButton(() => {
                        completeTutorial();
                        removeGlobalTouchBlocker();
                        driverObj.destroy();
                        setIsTutorialActive(false);
                    });
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
                    completeTutorial();
                    driverObj.destroy();
                    setIsTutorialActive(false);
                    removeSkipButton();
                },

                onPrevClick: () => driverObj.movePrevious(),

                steps: [
                    {
                        element: 'body', // Use body for welcome step like PC version
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
                            description: 'Usa los filtros para analizar períodos específicos. Selecciona un año y un trimestre para datos más detallados.',
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
                ],

                onDestroyStarted: () => {
                    removeSkipButton();
                    removeGlobalTouchBlocker();
                    setIsTutorialActive(false);
                    setDriverInstance(null);
                    document.body.classList.forEach(cls => {
                        if (cls.startsWith('tutorial-step-')) document.body.classList.remove(cls);
                    });
                    const styleEl = document.getElementById('dashboard-tutorial-mobile-styles');
                    if (styleEl) styleEl.remove();
                }
            });

            setDriverInstance(driverObj as any);
            setIsTutorialActive(true);
            hasInitialized.current = true;
            driverObj.drive();
        };

        initDriver();
        return () => { removeGlobalTouchBlocker(); };
    }, [shouldShowTutorial]);

    useEffect(() => {
        const style = document.createElement('style');
        style.id = 'dashboard-tutorial-mobile-styles';
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
      body.tutorial-step-1 [data-sidebar="trigger"],
      body.tutorial-step-1 [data-tutorial="company-selector"],
      body.tutorial-step-1 [data-radix-portal],
      body.tutorial-step-1 [role="dialog"],
      body.tutorial-step-1 [role="dialog"] *,
      body.tutorial-step-1 [data-radix-popper-content-wrapper] {
        z-index: 2147483648 !important;
        pointer-events: auto !important;
        opacity: 1 !important;
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
