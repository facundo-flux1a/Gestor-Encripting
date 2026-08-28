'use client';

import { useEffect, useState, useRef } from 'react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { usePathname } from 'next/navigation';
import { useCompanyContext } from '@/context/CompanyProvider';
import { useTutorial } from '@/context/tutorial-context';
import { injectSkipButton, removeSkipButton } from '@/lib/tutorial-utils';

export function DocumentosTutorial() {
  const {
    setIsTutorialActive,
    setCurrentStep
  } = useTutorial();

  const [localShouldShow, setLocalShouldShow] = useState(false);
  const [driverInstance, setDriverInstance] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [documentUploaded, setDocumentUploaded] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('tutorial_document_uploaded') === 'true';
    }
    return false;
  });

  const hasInitialized = useRef(false);
  const lastStepRef = useRef(0);
  const { selectedCompanyIds } = useCompanyContext();
  const selectedIdsRef = useRef<number[]>([]);

  useEffect(() => {
    selectedIdsRef.current = selectedCompanyIds;
  }, [selectedCompanyIds]);

  const pathname = usePathname();

  useEffect(() => {
    const checkTutorial = async () => {
      try {
        const response = await fetch('/api/user/tutorial-documentos');
        if (response.ok) {
          const data = await response.json();
          let showTutorial = Boolean(data.tutorial);

          // ✅ FORCE REPLAY CHECK
          if (typeof window !== 'undefined' && localStorage.getItem('force_tutorial_documentos') === 'true') {
            console.log('🔄 [DocumentosTutorial] Forzando tutorial por solicitud de usuario (Replay)');
            showTutorial = true;
          }

          if (showTutorial) {
            setLocalShouldShow(true);
            setIsTutorialActive(true);
            localStorage.removeItem('tutorial_document_uploaded');
            setDocumentUploaded(false);
          }
        }
      } catch (error) {
        console.error('Error checking tutorial:', error);
      }
    };
    checkTutorial();
  }, [setIsTutorialActive, pathname]);

  useEffect(() => {
    const handleDocumentUpload = () => {
      console.log('🎯 [Tutorial Debug] Documento subido detectado');
      setDocumentUploaded(true);
      localStorage.setItem('tutorial_document_uploaded', 'true');
    };
    window.addEventListener('documentUploaded', handleDocumentUpload);
    return () => window.removeEventListener('documentUploaded', handleDocumentUpload);
  }, []);

  // 🔥 DETECCIÓN NULCEAR DE MODALES 🔥
  useEffect(() => {
    const checkModal = () => {
      // 1. Buscar TODOS los diálogos
      const dialogs = document.querySelectorAll('[role="dialog"]');
      // 2. Buscar TODOS los portales de Radix
      const portals = document.querySelectorAll('[data-radix-portal]');

      // Filtrar para encontrar "diálogos reales" que NO sean el tutorial
      const realModals = Array.from(dialogs).filter(el =>
        !el.classList.contains('driver-popover') &&
        !el.closest('.driver-popover')
      );

      const hasRealModal = realModals.length > 0 || portals.length > 0;

      if (hasRealModal !== isModalOpen) {
        console.log(hasRealModal ? '🚀 [Tutorial Debug] MODAL ENCONTRADO' : '✅ [Tutorial Debug] MODAL CERRADO');
        setIsModalOpen(hasRealModal);

        if (hasRealModal) {
          document.body.classList.add('tutorial-modal-open');
          if (driverInstance) {
            console.log('🧹 [Tutorial Debug] Destruyendo instancia');
            driverInstance.destroy();
            setDriverInstance(null);
          }

          // Limpieza manual de emergencia
          const overlays = document.querySelectorAll('.driver-overlay, .driver-popover, .driver-active-element, .driver-stage, .driver-highlight-overlay');
          overlays.forEach(el => (el as HTMLElement).style.display = 'none');
          document.body.style.pointerEvents = 'auto';
          document.body.style.overflow = 'auto'; // Asegurar scroll si Radix lo bloquea mal
        } else {
          document.body.classList.remove('tutorial-modal-open');
        }
      }
    };

    const interval = setInterval(checkModal, 150);
    return () => clearInterval(interval);
  }, [isModalOpen, driverInstance]);

  const showErrorMessage = (message: string) => {
    const popper = document.querySelector('.driver-popover-description');
    if (popper) {
      const existing = popper.querySelector('.tutorial-error-msg');
      if (existing) existing.remove();
      const errorMsg = document.createElement('p');
      errorMsg.className = 'tutorial-error-msg text-red-500 text-sm mt-3 font-semibold';
      errorMsg.textContent = message;
      popper.appendChild(errorMsg);
      setTimeout(() => errorMsg.remove(), 4000);
    }
  };

  useEffect(() => {
    if (!localShouldShow || isModalOpen) return;

    const timer = setTimeout(() => {
      const finalSteps = [
        {
          element: 'body',
          popover: {
            title: 'Tu espacio de documentos',
            description: 'Muvail organiza este flujo para que sepas qué cargar, qué revisar y cuál es el siguiente paso.',
            side: 'bottom', align: 'center'
          } as any
        },
        {
          element: '[data-tutorial="company-selector"]',
          popover: {
            title: '1. Elige el contexto',
            description: 'Selecciona al menos una empresa. La vista se actualiza para mostrar solo la información que corresponde a esa operación.',
            side: 'right', align: 'start'
          }
        },
        {
          element: '[data-tutorial="upload-button"]',
          popover: {
            title: '2. Incorpora un documento',
            description: 'Arrastra archivos o selecciónalos desde tu equipo. Si hace falta una revisión, Muvail lo señaliza en el Centro de seguridad.',
            side: 'bottom', align: 'center'
          }
        },
        {
          element: 'body',
          popover: {
            title: 'Una señal de revisión no es un callejón sin salida',
            description: 'Si el documento no aparece en esta lista, revisa el Centro de seguridad. Ahí vas a encontrar el contexto necesario para resolverlo.',
            side: 'bottom', align: 'center'
          }
        },
        {
          element: '[data-tutorial="tabs-filters"]',
          popover: {
            title: 'Encuentra lo que necesitas',
            description: 'Usa categorías y filtros para pasar de una vista general a una revisión puntual, sin perder el contexto de la empresa.',
            side: 'bottom', align: 'center'
          }
        },
        {
          element: '[data-tutorial="export-pdf"]',
          popover: {
            title: 'Comparte la información',
            description: 'Cuando la vista ya tiene el contexto correcto, exporta el resultado para continuar el trabajo fuera de Muvail.',
            side: 'bottom', align: 'center'
          }
        },
        {
          element: '[data-tutorial="documents-table"]',
          popover: {
            title: 'La información, a la vista',
            description: 'Ordena, busca o abre cada documento para profundizar. Los estados hacen visible qué está listo y qué requiere atención.',
            side: 'top', align: 'center'
          }
        },
        {
          element: 'body',
          popover: {
            title: 'Profundiza solo cuando haga falta',
            description: 'Al abrir una fila encontrás el detalle extraído línea por línea para validar la información con control.',
            side: 'bottom', align: 'center'
          }
        },
        {
          element: 'body',
          popover: {
            title: 'Todo listo',
            description: 'Ya conoces el flujo: elige contexto, incorpora documentos y revisa las señales que necesitan tu atención.',
            side: 'bottom', align: 'center'
          }
        }
      ].filter(step => {
        if (typeof step.element === 'string' && step.element !== 'body') {
          return !!document.querySelector(step.element);
        }
        return true;
      });

      const driverObj = driver({
        showProgress: true,
        showButtons: ['next', 'previous'],
        allowClose: false,
        animate: true,
        overlayOpacity: 0.8,
        overlayColor: '#000000',
        disableActiveInteraction: false,
        steps: finalSteps,

        nextBtnText: 'Siguiente →',
        prevBtnText: '← Anterior',
        doneBtnText: '¡Entendido!',

        onHighlightStarted: (element, step, options) => {
          const idx = options.state.activeIndex ?? 0;
          lastStepRef.current = idx;
          setCurrentStep(idx);

          document.body.classList.add(`tutorial-step-${idx}`);

          injectSkipButton(() => {
            fetch('/api/user/tutorial-documentos', { method: 'POST' })
              .then(() => {
                setLocalShouldShow(false);
                setIsTutorialActive(false);
                localStorage.removeItem('tutorial_document_uploaded');
                driverObj.destroy();
              })
              .catch(console.error);
          });
        },

        onNextClick: (element, step, options) => {
          const idx = options.state.activeIndex ?? 0;
          const totalStepsCount = finalSteps.length;
          console.log('➡️ [DocumentosTutorial] onNextClick - Paso:', idx, 'de', totalStepsCount);

          if (idx === 1) {
            if (selectedIdsRef.current.length > 0) setTimeout(() => driverObj.moveNext(), 100);
            else showErrorMessage('⚠️ Por favor, selecciona al menos una empresa antes de continuar.');
          } else if (idx === 2) {
            // 🔍 VALIDACIÓN ROBUSTA DE DOCUMENTOS
            const documentContainer = document.querySelector('[data-tutorial="documents-table"]');
            const hasTableRows = !!documentContainer?.querySelector('tbody tr:not(.no-docs)');
            const hasFolders = !!documentContainer?.querySelector('.space-y-3.sm\\:space-y-4 button span.font-semibold');
            const containerText = documentContainer?.textContent || '';
            const hasSpecificDoc = containerText.includes('DECLARACIÓN IRPF') ||
              containerText.includes('Nómina') ||
              (containerText.includes('Factura') && !containerText.includes('No hay facturas'));

            if (hasTableRows || hasFolders || hasSpecificDoc || documentUploaded || localStorage.getItem('tutorial_document_uploaded') === 'true') {
              console.log('✅ [DocumentosTutorial] Paso 2 superado');
              localStorage.setItem('tutorial_document_uploaded', 'true');
              driverObj.moveNext();
            } else {
              showErrorMessage('⚠️ Por favor, sube al menos un documento antes de continuar.');
            }
          } else if (idx === totalStepsCount - 1) {
            console.log('🏁 [DocumentosTutorial] Último paso alcanzado. Completando...');
            // ✅ Llamada inmediata al backend
            fetch('/api/user/tutorial-documentos', { method: 'POST' })
              .then(res => {
                if (res.ok) {
                  setLocalShouldShow(false);
                  setIsTutorialActive(false);
                  localStorage.removeItem('tutorial_document_uploaded');
                  // Clear replay flag
                  if (typeof window !== 'undefined') {
                    localStorage.removeItem('force_tutorial_documentos');
                  }
                  console.log('✅ [DocumentosTutorial] DB actualizada');
                }
              })
              .catch(console.error);

            // ✅ Cierre de UI
            setTimeout(() => {
              console.log('🧨 [DocumentosTutorial] Ejecutando destroy() y forzando recarga para limpiar DOM');
              driverObj.destroy();
              window.location.reload();
            }, 100);
          } else {
            driverObj.moveNext();
          }
        },

        onCloseClick: () => {
          console.log('❌ [DocumentosTutorial] onCloseClick');
          fetch('/api/user/tutorial-documentos', { method: 'POST' }).catch(console.error);
          driverObj.destroy();
          setIsTutorialActive(false);
          removeSkipButton();
        },

        onDestroyStarted: () => {
          console.log('🏁 [DocumentosTutorial] onDestroyStarted');
          setIsTutorialActive(false);
          removeSkipButton();
          document.body.classList.forEach(cls => {
            if (cls.startsWith('tutorial-step-')) document.body.classList.remove(cls);
          });
        },
      });

      setDriverInstance(driverObj);
      driverObj.drive(lastStepRef.current);

      return () => {
        clearTimeout(timer);
        if (driverInstance) driverInstance.destroy();
      };
    }, 400);
  }, [localShouldShow, isModalOpen, setIsTutorialActive]);

  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
        /* .driver-popover { z-index: 10000 !important; } */
        .driver-overlay { 
           z-index: 9997 !important; 
           pointer-events: none !important; 
        }

        .driver-active-element { 
          z-index: 9999 !important; 
          position: relative !important;
          border: none !important;
          border-radius: 8px !important;
          box-shadow: none !important;
          /* Fondo restaurado a natural (removido transparent !important) */
          opacity: 1 !important;
          transition: all 0.3s ease !important;
          outline: none !important;
        }

       body.tutorial-modal-open .driver-overlay,
       body.tutorial-modal-open .driver-popover,
       body.tutorial-modal-open .driver-active-element,
       body.tutorial-modal-open .driver-stage,
       body.tutorial-modal-open .driver-highlight-overlay {
          display: none !important;
          opacity: 0 !important;
          pointer-events: none !important;
          visibility: hidden !important;
       }
 
       /* Limpieza del stage de recorte */
       .driver-stage {
          background-color: transparent !important;
          border-radius: 8px !important;
          box-shadow: none !important;
          z-index: 9998 !important; /* Justo debajo del elemento activo */
       }

      /* 🔥 NIVEL DIVINO PARA EL MODAL 🔥 */
      [role="dialog"], [data-radix-portal], [data-radix-portal] > *, .fixed.inset-0.z-[100] {
         z-index: 2147483647 !important;
         pointer-events: auto !important;
         opacity: 1 !important;
      }

      body[class*="tutorial-step-"] * {
         backdrop-filter: none !important;
         -webkit-backdrop-filter: none !important;
      }

      body.tutorial-step-1 [data-sidebar="container"] { pointer-events: none !important; }
      body.tutorial-step-1 [data-tutorial="company-selector"] [role="checkbox"],
      body.tutorial-step-1 [data-tutorial="company-selector"] label {
         pointer-events: auto !important;
      }

      body.tutorial-step-2 [data-sidebar="container"] { pointer-events: none !important; }
      body.tutorial-step-2 [data-tutorial="upload-button"] {
         pointer-events: auto !important;
         z-index: 100 !important;
      }

      .driver-popover {
        border: 1px solid hsla(var(--primary) / 0.5) !important;
        background-color: rgba(7, 31, 29, 0.92) !important;
        backdrop-filter: blur(12px) !important;
        border-radius: 12px !important;
        color: white !important;
        box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1) !important;
        z-index: 10000 !important;
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
      if (document.head.contains(style)) document.head.removeChild(style);
    };
  }, []);

  return null;
}
