'use client';

import { useEffect, useRef } from 'react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { usePathname } from 'next/navigation';
import { useCompanyContext } from '@/context/CompanyProvider';
import { useTrimestres } from '@/context/TrimestresProvider';
import { injectSkipButton, removeSkipButton } from '@/lib/tutorial-utils';

export function TrimestresTutorial() {
  const { shouldShowTutorial, isLoading, markAsCompleted, setTutorialState, setMostrarVacios } = useTrimestres();
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

  const pathname = usePathname();

  useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem('force_tutorial_trimestres') === 'true') {
      console.log('🔄 [TrimestresTutorial] Replay detectado, reseteando hasRunRef');
      hasRunRef.current = false;
    }

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
              description: (() => {
                const now = new Date();
                const month = now.getMonth();
                const day = now.getDate();
                const year = now.getFullYear();

                let q = 0;
                let qYear = year;

                // Lógica de periodos de gracia (20/30 días)
                if (month === 0 && day <= 30) { q = 4; qYear = year - 1; }
                else if (month === 3 && day <= 20) { q = 1; }
                else if (month === 6 && day <= 20) { q = 2; }
                else if (month === 9 && day <= 20) { q = 3; }
                else {
                  if (month < 3) q = 1;
                  else if (month < 6) q = 2;
                  else if (month < 9) q = 3;
                  else q = 4;
                }

                return `Los documentos se asignan al trimestre viable más cercano. Por ejemplo: si hay documentos antiguos, irán al T${q} ${qYear} (actual). Si ese trimestre está cerrado, irán al siguiente disponible.`;
              })(),
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

          // ✅ Gestionar clases de paso en el body para control CSS preciso
          document.body.classList.forEach(cls => {
            if (cls.startsWith('tutorial-step-')) {
              document.body.classList.remove(cls);
            }
          });
          document.body.classList.add(`tutorial-step-${currentStepIndex}`);

          // ✅ FORZAR MOSTRAR VACIOS (Step 4 en adelante = índice 3)
          if (currentStepIndex >= 3) {
            console.log('🔄 [TrimestresTutorial] Forzando mostrarVacios: true');
            setMostrarVacios(true);
          }

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

          injectSkipButton(() => {
            markAsCompleted();
            driverInstanceRef.current?.destroy();
            removeSkipButton();
          });
        },

        onNextClick: (element, step, options) => {
          const idx = options.state.activeIndex ?? 0;
          const totalStepsCount = driverInstance.getConfig().steps?.length ?? 0;
          console.log('➡️ [TrimestresTutorial] onNextClick - Paso:', idx, 'de', totalStepsCount);

          if (idx === 1) {
            const hasSelectedCompanies = selectedIdsRef.current.length > 0;
            if (hasSelectedCompanies) {
              setTimeout(() => {
                driverInstance.moveNext();
              }, 100);
            } else {
              showErrorMessage('⚠️ Por favor, selecciona al menos una empresa antes de continuar.');
            }
          } else if (idx === totalStepsCount - 1) {
            console.log('🏁 [TrimestresTutorial] Último paso alcanzado. Completando...');
            markAsCompleted();
            removeSkipButton();
            setTimeout(() => {
              console.log('🧨 [TrimestresTutorial] Ejecutando destroy()');
              driverInstance.destroy();
            }, 100);
          } else {
            driverInstance.moveNext();
          }
        },

        onCloseClick: () => {
          console.log('❌ [TrimestresTutorial] onCloseClick - Marcando como completado');
          markAsCompleted();
          driverInstance.destroy();
          removeSkipButton();
        },

        onPrevClick: () => {
          driverInstance.movePrevious();
        },

        onDestroyStarted: () => {
          console.log('🏁 [TrimestresTutorial] onDestroyStarted invocado');
          document.body.removeAttribute('data-tutorial-step');
          setTutorialState(false, 0);
          removeSkipButton();

          // Asegurar que las clases del body se limpien
          document.body.classList.forEach(cls => {
            if (cls.startsWith('tutorial-step-')) {
              document.body.classList.remove(cls);
            }
          });
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

      /* 🔒 Step 6 (index 5): Tabla de Documentos - filas no clickeables */
      body.tutorial-step-5 [data-tutorial="trimestres-table"] tbody tr,
      body.tutorial-step-5 [data-tutorial="trimestres-table"] tbody tr * {
        pointer-events: none !important;
        cursor: not-allowed !important;
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