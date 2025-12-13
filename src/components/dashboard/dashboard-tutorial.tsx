'use client';

import { useEffect, useState, useRef } from 'react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { useTutorial } from '@/context/tutorial-context';
import { useCompanyContext } from '@/context/CompanyProvider';

export function DashboardTutorial() {
  const { shouldShowTutorial, completeTutorial, skipTutorial, setIsTutorialActive, currentStep, setCurrentStep } = useTutorial();
  const { companies, selectedCompanyIds } = useCompanyContext();
  
  const [driverInstance, setDriverInstance] = useState(null);
  const isStep2Active = useRef(false);
  const hasInitialized = useRef(false);
  const selectedIdsRef = useRef<number[]>([]);
  const companiesRef = useRef<any[]>([]);
  const lastStepRef = useRef(0);

  useEffect(() => {
    selectedIdsRef.current = selectedCompanyIds;
    console.log('🔄 selectedIdsRef actualizado:', selectedCompanyIds);
  }, [selectedCompanyIds]);

  useEffect(() => {
    companiesRef.current = companies;
    console.log('🔄 companiesRef actualizado:', companies.length, 'empresas');
  }, [companies]);

  useEffect(() => {
    if (!shouldShowTutorial) {
      console.log('❌ Tutorial no debe mostrarse');
      return;
    }
    
    if (hasInitialized.current) {
      console.log('❌ Tutorial ya fue inicializado');
      return;
    }
    
    console.log('✅ Iniciando tutorial. Companies:', companies.length);

    const timer = setTimeout(() => {
      const hasCompaniesAtInit = companiesRef.current && companiesRef.current.length > 0;
      
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🔍 INICIALIZACIÓN - Evaluación previa');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📊 Empresas al iniciar:', companiesRef.current.length);
      console.log('📊 hasCompaniesAtInit:', hasCompaniesAtInit);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      const driverObj = driver({
        showProgress: true,
        showButtons: ['next', 'previous'],
        allowClose: false,
        animate: true,
        overlayOpacity: 0.7,
        overlayClickNext: false,
        disableActiveInteraction: false,
        
        onHighlightStarted: (element, step, options) => {
          const currentIndex = options.state.activeIndex;
          
          setCurrentStep(currentIndex);
          lastStepRef.current = currentIndex;
          console.log('📍 Tutorial paso:', currentIndex);
          
          if (currentIndex === 1) {
            isStep2Active.current = true;
            setIsTutorialActive(true);
            
            setTimeout(() => {
              const overlay = document.querySelector('.driver-overlay');
              
              if (overlay) {
                (overlay as HTMLElement).style.pointerEvents = 'none';
              }
              
              const sidebar = document.querySelector('[data-sidebar="sidebar"]');
              const trigger = document.querySelector('[data-sidebar="trigger"]');
              
              if (sidebar?.getAttribute('data-state') === 'collapsed' && trigger) {
                (trigger as HTMLElement).click();
              }
            }, 100);
          }
          else if (currentIndex === 2) {
            isStep2Active.current = false;
            
            const sidebar = document.querySelector('[data-sidebar="sidebar"]');
            const trigger = document.querySelector('[data-sidebar="trigger"]');
            
            if (sidebar?.getAttribute('data-state') === 'collapsed' && trigger) {
              console.log('🔧 Expandiendo sidebar para el paso 3');
              (trigger as HTMLElement).click();
            }
          }
          else {
            isStep2Active.current = false;
          }
        },
        
        onNextClick: (element, step, options) => {
          const currentIndex = options.state.activeIndex;
          
          if (currentIndex === 1) {
            const currentSelectedIds = selectedIdsRef.current;
            const hasSelectedCompanies = currentSelectedIds.length > 0;
            const currentHasCompanies = companiesRef.current && companiesRef.current.length > 0;
            
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('🔍 VALIDACIÓN PASO 2 (Selector empresa)');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('📊 selectedIdsRef.current:', selectedIdsRef.current);
            console.log('📊 currentSelectedIds:', currentSelectedIds);
            console.log('📊 currentSelectedIds.length:', currentSelectedIds.length);
            console.log('📊 hasSelectedCompanies:', hasSelectedCompanies);
            console.log('📊 currentHasCompanies:', currentHasCompanies);
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            
            if (currentHasCompanies && hasSelectedCompanies) {
              console.log('✅ VALIDACIÓN PASADA - Empresa seleccionada - avanzando al paso 3');
              
              setTimeout(() => {
                console.log('⏩ Ejecutando moveNext()');
                driverObj.moveNext();
              }, 300);
            } 
            else if (!currentHasCompanies && companiesRef.current.length > 0) {
              console.log('✅ EMPRESA CREADA - Avanzando');
              
              setTimeout(() => {
                driverObj.moveNext();
              }, 300);
            }
            else {
              console.log('❌ VALIDACIÓN FALLIDA - NO hay empresas seleccionadas');
              console.log('❌ Mostrando mensaje de error...');
              showErrorMessage(currentHasCompanies);
            }
          } else {
            console.log('⏭️ No es paso 2, avanzando normalmente');
            driverObj.moveNext();
          }
        },

        onPrevClick: () => {
          driverObj.movePrevious();
        },
        
        steps: [
          {
            element: 'body',
            popover: {
              title: '¡Bienvenido a tu Gestor Documental! 🎉',
              description: 'Te guiaremos en un recorrido rápido por las funciones principales de la sección "Dashboard".',
              side: 'center',
              align: 'center'
            }
          },
          {
            element: hasCompaniesAtInit 
              ? '[data-tutorial="company-selector"]' 
              : '[data-tutorial="company-selector"] button',
            popover: {
              title: hasCompaniesAtInit ? 'Seleccionar empresa 🏢' : 'Crear tu primera empresa 🏢',
              description: hasCompaniesAtInit 
                ? '<p><strong>Acción requerida:</strong> Haz clic en una empresa para seleccionarla.</p><p class="text-sm text-muted-foreground mt-2">Puedes seleccionar múltiples empresas desde el mismo panel.</p>'
                : '<p><strong>Acción requerida:</strong> Haz clic en "Agregar Empresa" para crear tu primera empresa.</p><ul class="list-disc list-inside text-sm space-y-1 mt-2"><li><strong>Nombre</strong> (obligatorio): El nombre que se mostrará</li><li><strong>Nombre fiscal</strong> (opcional): La razón social</li><li><strong>CIF</strong> (obligatorio): Tu identificación fiscal</li><li><strong>Mail de carga</strong> (opcional): Para subir documentos</li></ul>',
              side: 'right',
              align: 'start'
            }
          },
          {
            element: '[data-sidebar="sidebar"], [data-sidebar="content"]',
            popover: {
              title: 'Menú de navegación 🗂️',
              description: 'Desde este menú lateral puedes acceder a las diferentes secciones: Documentos, Trimestres, Actividad, Incidencias y Proveedores.',
              side: 'right',
              align: 'center'
            }
          },
          {
            element: '[data-tutorial="kpis"]',
            popover: {
              title: 'Métricas principales 📊',
              description: 'Estas tarjetas muestran las métricas clave: ingresos, gastos, beneficio bruto, resultado de IVA y total de documentos procesados.',
              side: 'bottom',
              align: 'center'
            }
          },
          {
            element: '[data-tutorial="financial-chart"]',
            popover: {
              title: 'Resumen Financiero 📈',
              description: 'Este gráfico muestra la evolución trimestral de tus ingresos (ventas) y gastos.',
              side: 'top',
              align: 'center'
            }
          },
          {
            element: '[data-tutorial="distribution-chart"]',
            popover: {
              title: 'Distribución de Documentos 🥧',
              description: 'Aquí ves la distribución de tus documentos: facturas de ingreso vs facturas de gasto.',
              side: 'top',
              align: 'center'
            }
          },
          {
            element: '[data-tutorial="iva-chart"]',
            popover: {
              title: 'Resumen de IVA 💰',
              description: 'Este gráfico te muestra el IVA repercutido y soportado por trimestre para que controles tu situación fiscal.',
              side: 'top',
              align: 'center'
            }
          },
          {
            element: '[data-tutorial="filters"]',
            popover: {
              title: 'Filtros de análisis 🔍',
              description: 'Usa estos filtros para analizar períodos específicos. Selecciona un año y un trimestre para datos más detallados.',
              side: 'bottom',
              align: 'start'
            }
          },
          {
            element: '[data-tutorial="export-button"]',
            popover: {
              title: 'Exportar a PDF 📄',
              description: 'Cuando necesites un reporte del dashboard, puedes exportarlo a PDF desde aquí.',
              side: 'bottom',
              align: 'end'
            }
          },
         {
  element: 'body',
  popover: {
    title: '¡Todo listo! ✨',
    description: `
      <p>Ya conoces las funciones principales del dashboard. Empieza a explorar y descubrir las funciones de tu gestor!</p>
      <p class="mt-2">Nos vemos en el <span class="inline-flex items-center gap-1 text-violet-600 font-semibold" title="En desarrollo">tutorial<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg></span> de la sección "Documentos". ¡Éxitos!</p>
    `,
    side: 'center',
    align: 'center'
  }
}
        ],nextBtnText: 'Siguiente →',
        prevBtnText: '← Anterior',
        doneBtnText: '¡Comenzar!',
        onDestroyed: async (element, step, options) => {
          const finalStep = lastStepRef.current;
          
          console.log('🔚 Tutorial destruido');
          console.log('📊 Estado al destruir:', {
            activeIndex: options?.state?.activeIndex,
            totalSteps: options?.config?.steps?.length,
            currentStepFromContext: currentStep,
            finalStepFromRef: finalStep
          });
          
          setIsTutorialActive(false);
          
          console.log('🔍 Paso actual guardado desde ref:', finalStep);
          
          if (finalStep >= 8) {
            console.log('🎉 Usuario completó el tutorial (paso', finalStep, ') - llamando a API');
            
            try {
              const response = await fetch('/api/user/tutorial', { 
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                }
              });
              
              console.log('📡 Response status:', response.status);
              
              if (response.ok) {
                const data = await response.json();
                console.log('✅ Respuesta de la API:', data);
                console.log('✅ Tutorial marcado como completado en BD');
                
                completeTutorial();
                
                console.log('🔄 Recargando página para actualizar sesión...');
                setTimeout(() => {
                  window.location.reload();
                }, 500);
              } else {
                const errorData = await response.json();
                console.error('❌ Error al completar tutorial:', response.status, errorData);
              }
            } catch (error) {
              console.error('❌ Error llamando a API:', error);
            }
          } else {
            console.log('⚠️ Tutorial cerrado antes de completar (paso', finalStep, ')');
          }
          
          setCurrentStep(0);
          lastStepRef.current = 0;
        }
      });

      setDriverInstance(driverObj);
      setIsTutorialActive(true);
      hasInitialized.current = true;
      
      if (currentStep > 0) {
        console.log('🔄 Restaurando paso:', currentStep);
        setTimeout(() => {
          driverObj.drive(currentStep);
        }, 100);
      } else {
        driverObj.drive();
      }
    }, 500);

    return () => {
      clearTimeout(timer);
    };
  }, [shouldShowTutorial]);

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
    const style = document.createElement('style');
    style.textContent = `
      .driver-overlay,
      #driver-page-overlay,
      #driver-highlighted-element-stage {
        pointer-events: none !important;
      }
      
      .driver-active-element,
      .driver-active-element * {
        pointer-events: auto !important;
      }
      
      .driver-popover,
      .driver-popover-wrapper,
      .driver-popover * {
        pointer-events: auto !important;
      }
      
      /* 🔥 FIX: Forzar z-index MUY alto para modales de Radix cuando tutorial está activo */
      body:has(.driver-overlay) [role="dialog"] {
        z-index: 10000001 !important;
      }
      
      body:has(.driver-overlay) [data-radix-dialog-overlay] {
        z-index: 10000000 !important;
      }
      
      /* 🔥 FIX CRÍTICO: Forzar pointer-events en TODO dentro del modal */
      body:has(.driver-overlay) [role="dialog"] *,
      body:has(.driver-overlay) [role="dialog"] input,
      body:has(.driver-overlay) [role="dialog"] button,
      body:has(.driver-overlay) [role="dialog"] textarea,
      body:has(.driver-overlay) [role="dialog"] select {
        pointer-events: auto !important;
      }
      
      /* 🔥 NUEVO: Permitir clicks en el selector de empresas cuando tutorial está activo */
      body:has(.driver-overlay) [data-tutorial="company-selector"],
      body:has(.driver-overlay) [data-tutorial="company-selector"] * {
        pointer-events: auto !important;
      }
      
      /* Asegurar que contenido del modal también esté arriba */
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
        border: 2px solid hsl(var(--primary)) !important;
      }
      
      .driver-popover-title {
        color: hsl(var(--primary)) !important;
        font-weight: 600;
      }
      
      .driver-popover-progress-text {
        color: hsl(var(--primary)) !important;
      }
      
      .driver-popover-next-btn {
        background-color: hsl(var(--primary)) !important;
        color: white !important;
        transition: all 0.2s;
      }
      
      .driver-popover-next-btn:hover {
        background-color: hsl(var(--primary) / 0.9) !important;
        transform: translateY(-1px);
      }
      
      .driver-popover-prev-btn {
        color: hsl(var(--primary)) !important;
        border: 1px solid hsl(var(--primary)) !important;
      }
      
      .driver-popover-close-btn {
        color: hsl(var(--muted-foreground)) !important;
      }
      
      .driver-popover-close-btn:hover {
        color: hsl(var(--foreground)) !important;
      }
    `;
    document.head.appendChild(style);
    
    return () => {
      if (document.head.contains(style)) {
        document.head.removeChild(style);
      }
    };
  }, []);

  return <div data-tutorial-step2={isStep2Active.current} style={{ display: 'none' }} />;
}