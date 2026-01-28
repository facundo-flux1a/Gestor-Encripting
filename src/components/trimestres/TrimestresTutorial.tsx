'use client';

import { useEffect, useRef } from 'react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { useCompanyContext } from '@/context/CompanyProvider';
import { useTrimestres } from '@/context/TrimestresProvider';

export function TrimestresTutorial() {
  const { shouldShowTutorial, isLoading, markAsCompleted, setTutorialState } = useTrimestres();
  const driverInstanceRef = useRef<ReturnType<typeof driver> | null>(null);
  const hasRunRef = useRef(false);
  const lastStepRef = useRef(0);
  const { selectedCompanyIds } = useCompanyContext();
  const selectedIdsRef = useRef<number[]>([]);

  useEffect(() => {
    selectedIdsRef.current = selectedCompanyIds;
  }, [selectedCompanyIds]);

  const showErrorMessage = (message: string) => {
    const popoverDescription = document.querySelector('.driver-popover-description');
    if (popoverDescription) {
      const existingError = popoverDescription.querySelector('.tutorial-error-msg');
      if (existingError) existingError.remove();

      const errorMsg = document.createElement('p');
      errorMsg.className = 'tutorial-error-msg text-red-500 text-sm mt-3 font-semibold';
      errorMsg.textContent = message;
      popoverDescription.appendChild(errorMsg);

      setTimeout(() => errorMsg.remove(), 4000);
    }
  };

  useEffect(() => {
    if (isLoading || !shouldShowTutorial || hasRunRef.current) {
      if (isLoading || !shouldShowTutorial) {
        console.log('📊 [TrimestresTutorial] Esperando...', { isLoading, shouldShowTutorial });
      }
      return;
    }

    console.log('🎯 [TrimestresTutorial] Iniciando tutorial');
    hasRunRef.current = true;

    const timeoutId = setTimeout(() => {
      const driverInstance = driver({
        showProgress: true,
        showButtons: ['next', 'previous'],
        animate: true,
        allowClose: false,
        overlayOpacity: 0.75,
        disableActiveInteraction: false,

        steps: [
          {
            element: '[data-tutorial="trimestres-welcome"]',
            popover: {
              title: '¡Bienvenido a Trimestres! 📅',
              description: 'Aquí vas a poder organizar y gestionar tus documentos por períodos trimestrales. Te voy a mostrar cómo funciona todo.',
              side: 'bottom',
              align: 'center',
            },
          },
          {
            element: '[data-tutorial="trimestres-company-selector"]',
            popover: {
              title: '🏢 Selecciona tu empresa',
              description: '¡Selecciona una y dale a \'siguiente\'!',
              side: 'left',
              align: 'center',
            },
          },
          {
            element: '[data-tutorial="trimestres-selector"]',
            popover: {
              title: 'Selector de Trimestre',
              description: 'Aquí puedes cambiar entre trimestres. El sistema muestra automáticamente el trimestre más reciente disponible.',
              side: 'bottom',
              align: 'start',
            },
          },
          {
            element: '[data-tutorial="trimestres-toggle"]',
            popover: {
              title: 'Mostrar Trimestres Vacíos',
              description: 'Activa esta opción para ver trimestres sin documentos. Por defecto, solo se muestran trimestres con documentos.',
              side: 'left',
              align: 'start',
            },
          },
          {
            element: '[data-tutorial="trimestres-stats"]',
            popover: {
              title: 'Estadísticas del Trimestre',
              description: 'Estas tarjetas te muestran un resumen rápido: documentos totales, ingresos, gastos y el IVA neto del trimestre.',
              side: 'bottom',
              align: 'center',
            },
          },
          {
            element: '[data-tutorial="trimestres-table"]',
            popover: {
              title: '📋 Tabla de Documentos',
              description: 'Aquí ves todos los documentos del trimestre seleccionado. Podés buscar, filtrar y editar documentos.',
              side: 'top',
              align: 'center',
            },
          },
          {
            element: '[data-tutorial="trimestres-close-button"]',
            popover: {
              title: 'Cerrar Trimestre ⚠️',
              description: '⚠️ IMPORTANTE: Al cerrar un trimestre, todos sus documentos quedan bloqueados y NO PODRÁN ser editados. Los nuevos documentos se asignan al siguiente trimestre disponible.',
              side: 'left',
              align: 'start',
            },
          },
          {
            element: '[data-tutorial="trimestres-table"]',
            popover: {
              title: '📌 Sobre la asignación de documentos',
              description: 'Los documentos se asignan al trimestre viable más cercano. Por ejemplo: si un documento es del Q1 2025 pero ya pasó, irá al Q4 2025 (actual). Si Q4 está cerrado, irá al siguiente disponible.',
              side: 'top',
              align: 'center',
            },
          },
          {
            element: 'body',
            popover: {
              title: '¡Todo listo! 🎉',
              description: 'Ya conoces todas las herramientas para gestionar tus trimestres. ¡Empieza a organizar tus documentos!',
              side: 'over',
              align: 'center',
            },
          },
        ],

        nextBtnText: 'Siguiente →',
        prevBtnText: '← Anterior',
        doneBtnText: '¡Entendido!',

        onHighlightStarted: (element, step, options) => {
          const currentStepIndex = options.state.activeIndex ?? 0;
          lastStepRef.current = currentStepIndex;

          // 🔄 Sincronizar estado con el proveedor
          setTutorialState(true, currentStepIndex);

          // ✅ PASO 1 (índice 1): Selector de empresas
          if (currentStepIndex === 1) {
            console.log('🏢 PASO 1: Abriendo selector de empresas');
            document.body.setAttribute('data-tutorial-step', '1');

            setTimeout(() => {
              // 🔥 Hacer overlay no-clickeable
              const overlay = document.querySelector('.driver-overlay');
              if (overlay) {
                (overlay as HTMLElement).style.pointerEvents = 'none';
              }

              const trigger = document.querySelector('[data-tutorial="trimestres-company-selector"] button[role="combobox"]');

              if (trigger) {
                console.log('✅ Trigger encontrado, abriendo popover...');
                (trigger as HTMLElement).click();

                setTimeout(() => {
                  const popoverContent = document.querySelector('[data-radix-popper-content-wrapper]');
                  if (popoverContent) {
                    console.log('✅ Popover content encontrado, haciendo interactivo...');
                    (popoverContent as HTMLElement).style.pointerEvents = 'auto';
                    (popoverContent as HTMLElement).style.zIndex = '10000003';

                    const allElements = popoverContent.querySelectorAll('*');
                    allElements.forEach(el => {
                      (el as HTMLElement).style.pointerEvents = 'auto';
                    });

                    // 🔥 PREVENIR que clicks dentro del popover lo cierren
                    popoverContent.addEventListener('click', (e) => {
                      e.stopPropagation();
                      console.log('🛡️ Click en popover interceptado');
                    }, true);

                    console.log(`✅ ${allElements.length} elementos hechos interactivos`);
                  }
                }, 200);
              }
            }, 100);
          } else {
            document.body.removeAttribute('data-tutorial-step');
          }
        },

        onNextClick: (element, step, options) => {
          const currentIndex = options.state.activeIndex;

          console.log('🎯 [onNextClick] currentIndex:', currentIndex);

          // PASO 1: Verificar empresa seleccionada
          if (currentIndex === 1) {
            const hasSelectedCompanies = selectedIdsRef.current.length > 0;

            console.log('🏢 [PASO 1] Verificando empresa:', { hasSelectedCompanies, selectedIds: selectedIdsRef.current });

            if (hasSelectedCompanies) {
              console.log('✅ Empresa seleccionada, avanzando');
              setTimeout(() => {
                driverInstance.moveNext();
              }, 100);
            } else {
              console.log('❌ NO hay empresa seleccionada');
              showErrorMessage('⚠️ Por favor, selecciona al menos una empresa antes de continuar.');
            }
          }
          // Resto de pasos: avanzar normalmente
          else {
            console.log('➡️ [PASO', currentIndex, '] Avanzando');
            driverInstance.moveNext();
          }
        },

        onPrevClick: () => {
          driverInstance.movePrevious();
        },

        onDestroyStarted: async () => {
          const finalStep = lastStepRef.current;
          document.body.removeAttribute('data-tutorial-step');

          // 🔄 Limpiar estado en el proveedor
          setTutorialState(false, 0);

          // Solo marcar como completado si llegó al final (paso 8 = índice 8)
          if (finalStep >= 8) {
            console.log('🏁 [TrimestresTutorial] Tutorial completado en paso:', finalStep);
            await markAsCompleted();
          } else {
            console.log('⚠️ [TrimestresTutorial] Tutorial cerrado prematuramente en paso:', finalStep);
          }

          if (driverInstance) {
            driverInstance.destroy();
          }
        },
      });

      driverInstanceRef.current = driverInstance;
      driverInstance.drive();
    }, 400);

    return () => {
      clearTimeout(timeoutId);
      if (driverInstanceRef.current) {
        console.log('🧹 [TrimestresTutorial] Limpiando driver');
        driverInstanceRef.current.destroy();
        driverInstanceRef.current = null;
      }
    };
  }, [isLoading, shouldShowTutorial, markAsCompleted, setTutorialState]);

  // 🔥 ESTILOS CRÍTICOS
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      /* 🔥 CRÍTICO: Overlay NUNCA bloquea clicks */
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
      
      /* 🔥 HEADER: Por encima del overlay y SIEMPRE interactiva */
      body:has(.driver-overlay) header,
      body:has(.driver-overlay) [data-tutorial="trimestres-company-selector"],
      body:has(.driver-overlay) [data-tutorial="trimestres-company-selector"] * {
        z-index: 10000001 !important;
        position: relative !important;
        pointer-events: auto !important;
      }
      
      /* 🔥 Popover de empresas POR ENCIMA DE TODO */
      body[data-tutorial-step="1"] [data-radix-popper-content-wrapper] {
        z-index: 10000003 !important;
        pointer-events: auto !important;
      }
      
      body[data-tutorial-step="1"] [data-radix-popper-content-wrapper] * {
        pointer-events: auto !important;
      }
      
      /* 🔥 Asegurar que checkboxes e inputs son clickeables */
      body[data-tutorial-step="1"] input,
      body[data-tutorial-step="1"] button,
      body[data-tutorial-step="1"] label,
      body[data-tutorial-step="1"] [role="checkbox"] {
        pointer-events: auto !important;
      }
      
      .driver-active-element {
        box-shadow: 0 0 0 4px hsla(var(--primary) / 0.3) !important;
      }
      
      .driver-popover {
        border: none !important;
        box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1) !important;
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

  return null;
}