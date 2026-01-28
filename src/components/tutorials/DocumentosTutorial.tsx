'use client';

import { useEffect, useState, useRef } from 'react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { useCompanyContext } from '@/context/CompanyProvider';
import { useTutorial } from '@/context/tutorial-context';

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

  useEffect(() => {
    const checkTutorial = async () => {
      try {
        const response = await fetch('/api/user/tutorial-documentos');
        if (response.ok) {
          const data = await response.json();
          if (data.tutorial) {
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
  }, [setIsTutorialActive]);

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
      const driverObj = driver({
        showProgress: true,
        showButtons: ['next', 'previous'],
        allowClose: false,
        animate: true,
        overlayOpacity: 0.8,
        overlayColor: '#000000',
        disableActiveInteraction: false,

        steps: [
          {
            element: 'body',
            popover: {
              title: '📄 ¡Bienvenido a Documentos!',
              description: 'Te guiaremos por las funciones principales de esta sección.',
              side: 'bottom', align: 'center'
            }
          },
          {
            element: '[data-tutorial="company-selector"]',
            popover: {
              title: '🏢 Paso 1: Selecciona una empresa',
              description: 'Selecciona al menos una empresa para continuar. Si ya tienes facturas registradas verás un resumen organizado por tipos.',
              side: 'right', align: 'start'
            }
          },
          {
            element: '[data-tutorial="upload-button"]',
            popover: {
              title: '📤 Paso 2: Sube un documento',
              description: 'Ahora sube al menos un documento para continuar. Arrastra tus archivos o haz clic para seleccionarlos. Soportamos PDF, ZIP Y RAR. Si ya tienes un documento subido solo dale a "siguiente".',
              side: 'bottom', align: 'center'
            }
          },
          {
            element: '[data-tutorial="tabs-filters"]',
            popover: {
              title: '🔍 Filtros y Categorías',
              description: 'Organiza tus documentos. Puedes filtrar por facturas emitidas, recibidas o abonos para una gestión más sencilla.',
              side: 'bottom', align: 'center'
            }
          },
          {
            element: '[data-tutorial="export-pdf"]',
            popover: {
              title: '📑 Exportar información',
              description: '¿Necesitas un reporte? Puedes exportar la información de tus documentos filtrados directamente a PDF.',
              side: 'bottom', align: 'center'
            }
          },
          {
            element: '[data-tutorial="documents-table"]',
            popover: {
              title: '📋 Tabla de documentos',
              description: 'Aquí verás todos tus documentos organizados. Puedes ordenarlos, buscar y hacer clic en cualquier documento para ver sus detalles completos. ¡También puedes exportar la tabla en Excel, CSV y texto plano, y elegir que columnas mostrar!',
              side: 'top', align: 'center'
            }
          },
          {
            element: 'body',
            popover: {
              title: '✨ ¡Listo para empezar!',
              description: 'Ya conoces cómo gestionar tus documentos, facturas y abonos.',
              side: 'bottom', align: 'center'
            }
          }
        ],

        nextBtnText: 'Siguiente →',
        prevBtnText: '← Anterior',
        doneBtnText: '¡Entendido!',

        onHighlightStarted: (element, step, options) => {
          const idx = options.state.activeIndex ?? 0;
          lastStepRef.current = idx;
          setCurrentStep(idx);

          document.body.classList.forEach(cls => {
            if (cls.startsWith('tutorial-step-')) document.body.classList.remove(cls);
          });
          document.body.classList.add(`tutorial-step-${idx}`);
        },

        onNextClick: (element, step, options) => {
          const idx = options.state.activeIndex;
          if (idx === 1) {
            if (selectedIdsRef.current.length > 0) setTimeout(() => driverObj.moveNext(), 100);
            else showErrorMessage('⚠️ Por favor, selecciona al menos una empresa antes de continuar.');
          } else if (idx === 2) {
            // 🔍 VALIDACIÓN ROBUSTA DE DOCUMENTOS (Sin falsos positivos)
            const documentContainer = document.querySelector('[data-tutorial="documents-table"]');

            // 1. ¿Hay filas reales en la tabla?
            const hasTableRows = !!documentContainer?.querySelector('tbody tr:not(.no-docs)');

            // 2. ¿Hay carpetas de la vista agrupada ('Otros')?
            const hasFolders = !!documentContainer?.querySelector('.space-y-3.sm\\:space-y-4 button span.font-semibold');

            // 3. Búsqueda de texto específica dentro del contenedor (evitando tabs/headers)
            const containerText = documentContainer?.textContent || '';
            const hasSpecificDoc = containerText.includes('DECLARACIÓN IRPF') ||
              containerText.includes('Nómina') ||
              (containerText.includes('Factura') && !containerText.includes('No hay facturas'));

            if (hasTableRows || hasFolders || hasSpecificDoc || documentUploaded || localStorage.getItem('tutorial_document_uploaded') === 'true') {
              console.log('✅ [TUTORIAL] Paso 2 superado:', { hasTableRows, hasFolders, hasSpecificDoc, documentUploaded, ls: localStorage.getItem('tutorial_document_uploaded') });
              localStorage.setItem('tutorial_document_uploaded', 'true');
              driverObj.moveNext();
            } else {
              console.warn('❌ [TUTORIAL] Paso 2 bloqueado: No se detectan documentos.', {
                hasTableRows, hasFolders, hasSpecificDoc, documentUploaded,
                containerTextSample: containerText.substring(0, 50)
              });
              showErrorMessage('⚠️ Por favor, sube al menos un documento antes de continuar.');
            }
          } else {
            driverObj.moveNext();
          }
        },

        onDestroyStarted: async () => {
          document.body.classList.forEach(cls => {
            if (cls.startsWith('tutorial-step-')) document.body.classList.remove(cls);
          });
          if (lastStepRef.current >= 6) {
            try {
              const res = await fetch('/api/user/tutorial-documentos', { method: 'POST' });
              if (res.ok) {
                setLocalShouldShow(false);
                setIsTutorialActive(false);
                localStorage.removeItem('tutorial_document_uploaded');
                setTimeout(() => window.location.reload(), 500);
              }
            } catch (e) {
              console.error(e);
            }
          }
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
       .driver-popover { z-index: 10000 !important; }
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

      .driver-popover-title { color: hsl(var(--primary)) !important; font-weight: 600; }
      .driver-popover-next-btn { background-color: hsl(var(--primary)) !important; color: white !important; }
    `;
    document.head.appendChild(style);
    return () => {
      if (document.head.contains(style)) document.head.removeChild(style);
    };
  }, []);

  return null;
}
