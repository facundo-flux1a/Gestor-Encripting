'use client';

import { useEffect, useState, useRef } from 'react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { usePathname } from 'next/navigation';
import { useTutorial } from '@/context/tutorial-context';
import { useCompanyContext } from '@/context/CompanyProvider';
import { injectSkipButton, removeSkipButton } from '@/lib/tutorial-utils';

export function DashboardTutorial() {
  const { shouldShowTutorial, completeTutorial, skipTutorial, setIsTutorialActive, currentStep, setCurrentStep } = useTutorial();
  const { companies, selectedCompanyIds } = useCompanyContext();

  const [driverInstance, setDriverInstance] = useState(null);
  const [isStep1Active, setIsStep1Active] = useState(false);
  const [isShieldActive, setIsShieldActive] = useState(false);
  const isStep2Active = useRef(false);


  const hasInitialized = useRef(false);
  const selectedIdsRef = useRef<number[]>([]);
  const companiesRef = useRef<any[]>([]);
  const lastStepRef = useRef(0);
  const sidebarBlockerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    selectedIdsRef.current = selectedCompanyIds;
    console.log('🔄 selectedIdsRef actualizado:', selectedCompanyIds);
  }, [selectedCompanyIds]);

  useEffect(() => {
    companiesRef.current = companies;
    console.log('🔄 companiesRef actualizado:', companies.length, 'empresas');
  }, [companies]);

  const createSidebarBlocker = () => {
    if (sidebarBlockerRef.current) {
      sidebarBlockerRef.current.remove();
      sidebarBlockerRef.current = null;
    }

    const sidebar = document.querySelector('[data-sidebar="sidebar"]');
    if (!sidebar) return;

    const blocker = document.createElement('div');
    blocker.id = 'tutorial-sidebar-blocker';
    blocker.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 9999999;
      background: transparent;
      cursor: not-allowed;
    `;

    sidebar.appendChild(blocker);
    sidebarBlockerRef.current = blocker;

    console.log('🔒 Overlay bloqueador creado sobre la sidebar');
  };

  const removeSidebarBlocker = () => {
    if (sidebarBlockerRef.current) {
      sidebarBlockerRef.current.remove();
      sidebarBlockerRef.current = null;
      console.log('🔓 Overlay bloqueador removido');
    }
  };

  const pathname = usePathname();

  useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem('force_tutorial_dashboard') === 'true') {
      console.log('🔄 [DashboardTutorial] Replay detectado, reseteando hasInitialized');
      hasInitialized.current = false;
    }

    if (!shouldShowTutorial) {
      if (driverInstance) {
        console.log('🛑 [DashboardTutorial] Destruyendo driver desde el efecto cleanup');
        (driverInstance as any).destroy();
        setDriverInstance(null);
      }
      return;
    }

    if (hasInitialized.current) {
      console.log('❌ Tutorial ya fue inicializado');
      return;
    }

    console.log('✅ Iniciando tutorial. Companies:', companies.length);

    // Helper para esperar a que el DOM esté listo
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

        setTimeout(() => {
          observer.disconnect();
          resolve(false);
        }, timeout);
      });
    };

    const initDriver = async () => {
      // Esperar a que el elemento crítico (KPIs) esté presente
      // Esto asegura que la página de "Overview" ha renderizado
      const kpisExist = await waitForElement('[data-tutorial="kpis"]');
      console.log('🔍 Elemento KPI encontrado:', kpisExist);

      const hasCompaniesAtInit = companiesRef.current && companiesRef.current.length > 0;

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🔍 INICIALIZACIÓN - Evaluación previa');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📊 Empresas al iniciar:', companiesRef.current.length);
      console.log('📊 hasCompaniesAtInit:', hasCompaniesAtInit);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

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
          console.log('🎯 [DashboardTutorial] Paso:', currentIndex, element);

          // Gestionar clases de paso en el body para control CSS preciso
          document.body.classList.forEach(cls => {
            if (cls.startsWith('tutorial-step-')) {
              document.body.classList.remove(cls);
            }
          });
          document.body.classList.add(`tutorial-step-${currentIndex}`);

          // Reset overlay pointer events for all steps
          const overlay = document.querySelector('.driver-overlay');
          if (overlay) (overlay as HTMLElement).style.pointerEvents = 'auto';

          setCurrentStep(currentIndex);
          lastStepRef.current = currentIndex;

          // Control del Bloqueador React para Paso 1 y Escudo para Pasos 8/9
          if (currentIndex === 0 || currentIndex === 8) { // Pasos 'body' (final ahora es 8 si hay empresas)
            setIsStep1Active(true);
            setIsShieldActive(false);
          } else if (currentIndex === 7) { // Paso Filtros
            setIsStep1Active(false);
            setIsShieldActive(true);
          } else {
            setIsStep1Active(false);
            setIsShieldActive(false);
          }

          if (currentIndex === 1) {
            isStep2Active.current = true;
            setIsTutorialActive(true);
            removeSidebarBlocker();
            setTimeout(() => {
              const overlay = document.querySelector('.driver-overlay');
              if (overlay) {
                console.log('🔓 Deshabilitando pointer-events en overlay para permitir interacción con selector');
                (overlay as HTMLElement).style.pointerEvents = 'none';
              }
              const sidebar = document.querySelector('[data-sidebar="sidebar"]');
              const trigger = document.querySelector('[data-sidebar="trigger"]');
              if (sidebar?.getAttribute('data-state') === 'collapsed' && trigger) {
                (trigger as HTMLElement).click();
              }
            }, 100);
          } else if (currentIndex === 2) {
            isStep2Active.current = false;
            const sidebar = document.querySelector('[data-sidebar="sidebar"]');
            const trigger = document.querySelector('[data-sidebar="trigger"]');
            if (sidebar?.getAttribute('data-state') === 'collapsed' && trigger) {
              (trigger as HTMLElement).click();
            }
            setTimeout(() => createSidebarBlocker(), 150);
          } else {
            isStep2Active.current = false;
            removeSidebarBlocker();
          }

          injectSkipButton(() => {
            skipTutorial();
            driverObj.destroy();
          });
        },

        onNextClick: (element, step, options) => {
          const currentIndex = options.state.activeIndex ?? 0;
          const totalSteps = driverObj.getConfig().steps?.length ?? 0;
          console.log('➡️ [DashboardTutorial] onNextClick - Paso:', currentIndex, 'de', totalSteps);

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
            console.log('🏁 [DashboardTutorial] Último paso alcanzado. Completando y cerrando...');
            // ✅ Llamada directa para asegurar que se guarde en DB
            completeTutorial();
            // ✅ Cierre forzado con pequeño delay
            setTimeout(() => {
              console.log('🧨 [DashboardTutorial] Ejecutando destroy()');
              driverObj.destroy();
              setIsTutorialActive(false);
            }, 100);
          } else {
            driverObj.moveNext();
          }
        },

        onCloseClick: () => {
          console.log('❌ [DashboardTutorial] onCloseClick - Marcando como completado y cerrando');
          completeTutorial();
          driverObj.destroy();
          setIsTutorialActive(false);
          removeSkipButton();
        },

        onPrevClick: () => driverObj.movePrevious(),

        steps: [
          {
            element: 'body',
            popover: {
              title: 'Bienvenido a tu Gestor Documental',
              description: 'Te guiaremos en un recorrido rápido por las funciones principales de la sección Dashboard.',
              side: 'bottom' as any,
              align: 'center' as any
            }
          },
          {
            element: hasCompaniesAtInit
              ? '[data-tutorial="company-selector"]'
              : '[data-tutorial="company-selector"] button',
            popover: {
              title: hasCompaniesAtInit ? 'Seleccionar empresa' : 'Crear tu primera empresa',
              description: hasCompaniesAtInit
                ? '<p>Haz clic en una empresa para seleccionarla y cargar sus datos.</p><p class="text-sm text-muted-foreground mt-2">Puedes seleccionar múltiples empresas desde el mismo panel.</p>'
                : '<p>Haz clic en Agregar Empresa para crear tu primera empresa.</p>',
              side: 'right' as any,
              align: 'start' as any
            }
          },
          {
            element: '[data-sidebar="sidebar"], [data-sidebar="content"]',
            popover: {
              title: 'Menú de navegación',
              description: 'Desde este menú lateral puedes acceder a todas las secciones: Documentos, Centro de Seguridad, Trimestres, Entidades, Webhooks, Docs y la Cola de Subidas.',
              side: 'right' as any,
              align: 'center' as any
            }
          },
          {
            element: '[data-tutorial="kpis"]',
            popover: {
              title: 'Métricas principales',
              description: 'Estas tarjetas muestran las métricas clave: ingresos, gastos, beneficio bruto, resultado de IVA y total de documentos procesados.',
              side: 'bottom' as any,
              align: 'center' as any
            }
          },
          {
            element: '[data-tutorial="financial-summary"]',
            popover: {
              title: 'Resumen Financiero',
              description: 'Este gráfico muestra la evolución trimestral de tus ingresos y gastos.',
              side: 'top' as any,
              align: 'center' as any
            }
          },
          {
            element: '[data-tutorial="distribution-chart"]',
            popover: {
              title: 'Distribución de Documentos',
              description: 'Aquí ves la distribución de tus documentos: facturas de ingreso, facturas de gasto, albaranes y otros.',
              side: 'top' as any,
              align: 'center' as any
            }
          },
          {
            element: '[data-tutorial="iva-chart"]',
            popover: {
              title: 'Resumen de IVA',
              description: 'Este gráfico te muestra el IVA repercutido y soportado por trimestre para que controles tu situación fiscal.',
              side: 'top' as any,
              align: 'center' as any
            }
          },
          {
            element: '[data-tutorial="top-providers"]',
            popover: {
              title: 'Proveedores y Clientes Principales',
              description: 'Aquí puedes consultar el listado con los proveedores y clientes que representan la mayor cantidad de gastos e ingresos.',
              side: 'top' as any,
              align: 'center' as any
            }
          },
          {
            element: '[data-tutorial="filters"]',
            popover: {
              title: 'Filtros de análisis',
              description: 'Usa estos filtros para analizar períodos específicos. Selecciona un año y un trimestre para datos más detallados.',
              side: 'bottom' as any,
              align: 'start' as any
            }
          },
          {
            element: 'body',
            popover: {
              title: 'Todo listo',
              description: '<p>Ya conoces las funciones principales del dashboard. Empieza a explorar y administrar tu negocio.</p>',
              side: 'bottom' as any,
              align: 'center' as any
            }
          }
        ].filter(step => {
          if (!hasCompaniesAtInit && step.element === '[data-tutorial="iva-chart"]') return false;
          return true;
        }),
        onDestroyStarted: () => {
          console.log('🏁 [DashboardTutorial] onDestroyStarted invocado');
          // Limpiar estado local
          setIsTutorialActive(false);
          setDriverInstance(null);

          // Asegurar que las clases del body se limpien
          removeSkipButton();
          document.body.classList.forEach(cls => {
            if (cls.startsWith('tutorial-step-')) {
              document.body.classList.remove(cls);
            }
          });
        }
      });

      // DOM Cleanup para evitar popovers superpuestos o duplicados
      document.querySelectorAll('.driver-popover, .driver-overlay').forEach(el => el.remove());

      setDriverInstance(driverObj as any);
      setIsTutorialActive(true);
      hasInitialized.current = true;
      driverObj.drive();
    };

    initDriver();

    return () => {
      removeSidebarBlocker();
    };
  }, [shouldShowTutorial]); const showErrorMessage = (hasCompanies: boolean) => {
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
    const style = document.createElement('style');
    style.textContent = `
      .driver-active-element,
      .driver-active-element * {
        pointer-events: auto !important;
      }
      
      .driver-popover,
      .driver-popover-wrapper,
      .driver-popover * {
        pointer-events: auto !important;
      }
      
      body:has(.driver-overlay) [role="dialog"] {
        z-index: 10000001 !important;
      }
      
      body:has(.driver-overlay) [data-radix-dialog-overlay] {
        z-index: 10000000 !important;
      }
      
      body:has(.driver-overlay) [role="dialog"] *,
      body:has(.driver-overlay) [role="dialog"] input,
      body:has(.driver-overlay) [role="dialog"] button,
      body:has(.driver-overlay) [role="dialog"] textarea,
      body:has(.driver-overlay) [role="dialog"] select {
        pointer-events: auto !important;
      }
      
      body:has(.driver-overlay) [data-tutorial="company-selector"],
      body:has(.driver-overlay) [data-tutorial="company-selector"] * {
        pointer-events: auto !important;
      }
      
      [data-radix-popper-content-wrapper],
      [data-radix-portal],
      [role="dialog"],
      [data-radix-popper-content-wrapper] *,
      [data-radix-portal] * {
        pointer-events: auto !important;
      }
      
      .driver-active-element {
        outline: 4px solid hsl(var(--primary)) !important;
        box-shadow: 0 0 0 4px hsla(var(--primary) / 0.3) !important;
      }
      
      .driver-popover {
        border: 1px solid hsla(var(--primary) / 0.5) !important;
        background-color: rgba(15, 23, 42, 0.8) !important;
        backdrop-filter: blur(12px) !important;
        border-radius: 12px !important;
        color: white !important;
        box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1) !important;
      }
      
      .driver-popover-title {
        color: white !important;
        font-weight: 700 !important;
        font-size: 1.1rem !important;
      }

      .driver-popover-description {
        color: rgba(255, 255, 255, 0.9) !important;
        font-weight: 500 !important;
        line-height: 1.5 !important;
      }
      
      .driver-popover-progress-text {
        color: rgba(255, 255, 255, 0.5) !important;
      }
      
      .driver-popover-next-btn {
        background-color: hsl(var(--primary)) !important;
        color: white !important;
        border: none !important;
        text-shadow: none !important;
        font-weight: 600 !important;
        transition: all 0.2s;
        border-radius: 6px !important;
      }
      
      .driver-popover-next-btn:hover {
        background-color: hsl(var(--primary) / 0.9) !important;
        transform: translateY(-1px);
      }
      
      .driver-popover-prev-btn {
        color: white !important;
        border: 1px solid rgba(255, 255, 255, 0.2) !important;
        background: transparent !important;
        text-shadow: none !important;
        font-weight: 500 !important;
        border-radius: 6px !important;
      }

      .driver-popover-prev-btn:hover {
        background: rgba(255, 255, 255, 0.1) !important;
        color: white !important;
      }
      
      .driver-popover-close-btn {
        color: rgba(255, 255, 255, 0.5) !important;
      }
      
      .driver-popover-close-btn:hover {
        color: white !important;
      }

      .driver-popover-arrow {
        border-bottom-color: rgba(15, 23, 42, 0.8) !important;
        border-top-color: rgba(15, 23, 42, 0.8) !important;
      }
      
      #tutorial-sidebar-blocker {
        position: absolute !important;
        inset: 0 !important;
        z-index: 9999999 !important;
        cursor: not-allowed !important;
      }

      /* Overlay: cubrir todo el viewport por encima del layout (z-10) */
      .driver-overlay {
        z-index: 99999 !important;
        position: fixed !important;
        inset: 0 !important;
        pointer-events: auto !important;
      }

      .driver-overlay svg {
        width: 100% !important;
        height: 100% !important;
      }

      /* Solo el elemento activo del paso actual queda por encima del overlay */
      .driver-active-element:not(body) {
        z-index: 100000 !important;
        position: relative !important;
      }

      .driver-active-element:not(body),
      .driver-active-element:not(body) * {
        pointer-events: auto !important;
      }

      /* Popover siempre encima de todo */
      .driver-popover,
      .driver-popover-wrapper {
        z-index: 100001 !important;
      }

      /* Paso 1: selector de empresa en sidebar */
      body.tutorial-step-1 [data-tutorial="company-selector"],
      body.tutorial-step-1 [data-tutorial="company-selector"] * {
        z-index: 100002 !important;
        pointer-events: auto !important;
      }

      /* Paso 2: menú lateral */
      body.tutorial-step-2 [data-sidebar="sidebar"],
      body.tutorial-step-2 [data-sidebar="content"] {
        z-index: 100002 !important;
        position: relative !important;
      }

      /* Pasos 7-8: filtros en header sticky */
      body.tutorial-step-7 header,
      body.tutorial-step-7 header *,
      body.tutorial-step-8 header,
      body.tutorial-step-8 header * {
        z-index: 100002 !important;
        position: relative !important;
      }

      body.tutorial-step-7 [data-radix-popper-content-wrapper],
      body.tutorial-step-8 [data-radix-popper-content-wrapper] {
        z-index: 100003 !important;
      }
    `;

    // Inject styles...
    const sidebarContainer = document.querySelector('[data-sidebar="container"]');
    if (sidebarContainer) {
      console.log('🔍 [Tutorial Style] Sidebar container encontrado:', sidebarContainer);
      console.log('🔍 [Tutorial Style] Computed Z-Index:', window.getComputedStyle(sidebarContainer).zIndex);
    } else {
      console.error('❌ [Tutorial Style] Sidebar container NO encontrado');
    }

    document.head.appendChild(style);

    return () => {
      if (document.head.contains(style)) {
        document.head.removeChild(style);
      }
    };
  }, []);

  return (
    <>
      {isStep1Active && (
        <div
          id="step1-blocker"
          className="fixed inset-0 z-[999999] bg-transparent cursor-default"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            console.log('🛡️ Click bloqueado por step1-blocker');
          }}
          style={{ pointerEvents: 'auto' }}
        />
      )}
      {isShieldActive && (
        <div
          id="interaction-shield"
          className="fixed inset-0 z-[200000] bg-transparent cursor-default"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
          }}
          style={{ pointerEvents: 'auto' }}
        />
      )}
      <div data-tutorial-step2={isStep2Active.current} style={{ display: 'none' }} />
    </>
  );
}