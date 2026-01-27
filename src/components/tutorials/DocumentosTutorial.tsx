'use client';

import { useEffect, useState, useRef } from 'react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { useCompanyContext } from '@/context/CompanyProvider';

export function DocumentosTutorial() {
  const [shouldShowTutorial, setShouldShowTutorial] = useState(false);
  const [driverInstance, setDriverInstance] = useState<any>(null);
  const [documentUploaded, setDocumentUploaded] = useState(() => {
    // 🔥 Inicializar desde localStorage para persistir entre re-renders
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
          setShouldShowTutorial(data.tutorial);

          // 🔥 Si el tutorial debe mostrarse, limpiar el flag de documento subido
          if (data.tutorial) {
            console.log('🧹 Limpiando flag de documento subido (tutorial nuevo)');
            localStorage.removeItem('tutorial_document_uploaded');
            setDocumentUploaded(false);
          }
        }
      } catch (error) {
        console.error('Error checking tutorial:', error);
      }
    };

    checkTutorial();
  }, []);

  // Listener para detectar cuando se sube un documento
  useEffect(() => {
    const handleDocumentUpload = () => {
      console.log('✅ Documento subido detectado');
      setDocumentUploaded(true);
      // 🔥 Persistir en localStorage
      localStorage.setItem('tutorial_document_uploaded', 'true');
      console.log('💾 Flag guardado en localStorage');
    };

    window.addEventListener('documentUploaded', handleDocumentUpload);

    return () => {
      window.removeEventListener('documentUploaded', handleDocumentUpload);
    };
  }, []);

  // 🔍 Debug: Log del estado
  useEffect(() => {
    console.log('🔍 [Tutorial] documentUploaded:', documentUploaded);
  }, [documentUploaded]);

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
    if (!shouldShowTutorial || hasInitialized.current) return;

    const timer = setTimeout(() => {
      const driverObj = driver({
        showProgress: true,
        showButtons: ['next', 'previous'],
        allowClose: false,
        animate: true,
        overlayOpacity: 0.75,
        disableActiveInteraction: false,

        steps: [
          {
            element: 'body',
            popover: {
              title: '📄 ¡Bienvenido a Documentos!',
              description: 'Te guiaremos por las funciones principales de esta sección donde podrás gestionar todas tus facturas, abonos y documentos fiscales.',
              side: 'bottom',
              align: 'center'
            }
          },
          // ✅ PASO 1: Selector de empresas
          {
            element: '[data-tutorial="company-selector"]',
            popover: {
              title: '🏢 Paso 1: Selecciona una empresa',
              description: 'Primero debes seleccionar al menos una empresa. Hacé clic en los checkboxes para elegir tus empresas. ¡Selecciona una y dale a "siguiente" !',
              side: 'right',
              align: 'start'
            }
          },
          // ✅ PASO 2: Subir documento
          {
            element: '[data-tutorial="upload-button"]',
            popover: {
              title: '📤 Paso 2: Sube un documento',
              description: 'Ahora sube al menos un documento para continuar. Arrastra tus archivos o haz clic para seleccionarlos. Soportamos PDF, ZIP Y RAR. Si ya tienes un documento subido, solo dale a "siguiente".',
              side: 'bottom',
              align: 'center'
            }
          },
          {
            element: '[data-tutorial="tabs-filters"]',
            popover: {
              title: '🔍 Filtros de documentos',
              description: 'Usa estas pestañas para organizar tus documentos: "Sin Confirmar" muestra documentos que el agente no ha podido validar, pendientes de verificación. "Facturas" las facturas validadas, "Abonos" los abonos confirmados, y "Otros" el resto de documentos.',
              side: 'bottom',
              align: 'center'
            }
          },
          {
            element: '[data-tutorial="export-pdf"]',
            popover: {
              title: '📑 Exportar a PDF',
              description: 'Exporta tu listado de documentos a PDF para generar reportes o compartir información con tu contable.',
              side: 'bottom',
              align: 'center'
            }
          },
          {
            element: '[data-tutorial="documents-table"]',
            popover: {
              title: '📋 Tabla de documentos',
              description: 'Aquí verás todos tus documentos organizados. Puedes ordenarlos, buscar y hacer clic en cualquier documento para ver sus detalles completos. ¡También puedes exportar la tabla en Excel, CSV y texto plano,  y elegir que columnas mostrar!',
              side: 'top',
              align: 'center'
            }
          },
          {
            element: 'body',
            popover: {
              title: '✨ ¡Listo para empezar!',
              description: 'Ya conoces cómo gestionar tus documentos, facturas y abonos.',
              side: 'bottom',
              align: 'center'
            }
          }
        ],

        nextBtnText: 'Siguiente →',
        prevBtnText: '← Anterior',
        doneBtnText: '¡Entendido!',

        onHighlightStarted: (element, step, options) => {
          const currentStepIndex = options.state.activeIndex ?? 0;
          lastStepRef.current = currentStepIndex;

          // ✅ Gestionar clases de paso en el body para control CSS preciso
          document.body.classList.forEach(cls => {
            if (cls.startsWith('tutorial-step-')) {
              document.body.classList.remove(cls);
            }
          });
          document.body.classList.add(`tutorial-step-${currentStepIndex}`);


          // ✅ PASO 2 (índice 2): Subir documento
          if (currentStepIndex === 2) {
            console.log('📤 PASO 2: Verificando documentos existentes...');

            // 🔥 VERIFICAR SI YA HAY DOCUMENTOS EN LA TABLA
            const tableBody = document.querySelector('[data-tutorial-step="documents-table"] tbody');
            // Ajustar selector para coincidir con CSS si es necesario, pero por ahora mantenemos lógica simple de check
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
              console.log('✅ Empresa seleccionada, avanzando al paso 2');
              setTimeout(() => {
                driverObj.moveNext();
              }, 100);
            } else {
              console.log('❌ NO hay empresa seleccionada');
              showErrorMessage('⚠️ Por favor, selecciona al menos una empresa antes de continuar.');
            }
          }
          // PASO 2: Verificar documento subido
          else if (currentIndex === 2) {
            // 🔥 VALIDACIÓN ESTRICTA: Verificar si hay documentos REALES en la tabla
            const tableBody = document.querySelector('[data-tutorial="documents-table"] tbody');
            const documentRows = tableBody ? Array.from(tableBody.querySelectorAll('tr')).filter(row => {
              // Filtrar filas que NO sean "No hay documentos" o loading
              const hasEmptyMessage = row.textContent?.includes('No hay') || row.textContent?.includes('Cargando');
              return !hasEmptyMessage;
            }) : [];
            const hasVisibleDocuments = documentRows.length > 0;

            console.log('📤 [PASO 2] Verificando documento:', {
              documentUploaded,
              tableBody: !!tableBody,
              totalRows: tableBody?.querySelectorAll('tr').length || 0,
              documentRowsCount: documentRows.length,
              hasVisibleDocuments,
              localStorageValue: localStorage.getItem('tutorial_document_uploaded')
            });

            // Permitir avanzar si hay documentos en la tabla O si se detectó una subida reciente
            if (hasVisibleDocuments || documentUploaded || localStorage.getItem('tutorial_document_uploaded') === 'true') {
              console.log('✅ Documento subido (detectado en tabla o flag)');
              // Guardar en localStorage para futuras sesiones
              localStorage.setItem('tutorial_document_uploaded', 'true');
              driverObj.moveNext();
            } else {
              console.log('❌ NO se ha subido documento');
              showErrorMessage('⚠️ Por favor, sube al menos un documento antes de continuar.');
            }
          }
          // Resto de pasos: avanzar normalmente
          else if (currentIndex >= 3) {
            const hasSelectedCompanies = selectedIdsRef.current.length > 0;

            console.log('➡️ [PASO', currentIndex, '] Verificando empresa:', { hasSelectedCompanies });

            if (hasSelectedCompanies) {
              driverObj.moveNext();
            } else {
              showErrorMessage('⚠️ Necesitas tener una empresa seleccionada.');
            }
          } else {
            console.log('➡️ [PASO', currentIndex, '] Avanzando sin validación');
            driverObj.moveNext();
          }
        },

        onPrevClick: () => {
          driverObj.movePrevious();
        },

        onDestroyStarted: async () => {
          const finalStep = lastStepRef.current;
          document.body.removeAttribute('data-tutorial-step');

          if (finalStep >= 6) {
            try {
              const response = await fetch('/api/user/tutorial-documentos', {
                method: 'POST',
              });

              if (response.ok) {
                setShouldShowTutorial(false);
                // 🔥 Limpiar el flag de documento subido
                localStorage.removeItem('tutorial_document_uploaded');
                setTimeout(() => {
                  window.location.reload();
                }, 500);
              }
            } catch (error) {
              console.error('Error al marcar tutorial:', error);
            }
          }

          if (driverInstance) {
            driverInstance.destroy();
          }
        },
      });

      setDriverInstance(driverObj);
      hasInitialized.current = true;

      driverObj.drive();

    }, 500);

    return () => {
      clearTimeout(timer);
      if (driverInstance) {
        driverInstance.destroy();
      }
    };
  }, [shouldShowTutorial, selectedCompanyIds, documentUploaded]);

  // Estilos personalizados
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      .driver-popover,
      .driver-popover * {
        pointer-events: auto !important;
        z-index: 2147483647 !important;
      }
      
      .driver-overlay {
        background-color: rgba(0, 0, 0, 0.75) !important;
        opacity: 0.75 !important;
        pointer-events: none !important;
      }

      /* 🔥 PASO 1: SELECTOR DE EMPRESAS */
      body.tutorial-step-1 [data-tutorial="company-selector"],
      body.tutorial-step-1 [data-tutorial="company-selector"] * {
         z-index: 100002 !important;
         position: relative !important;
         pointer-events: auto !important;
         opacity: 1 !important;
      }
      
      [data-radix-popper-content-wrapper],
      [role="dialog"] {
        z-index: 2147483646 !important;
      }

      /* 🔥 PASO 2: SUBIR DOCUMENTO (Botón y Modal) */
      body.tutorial-step-2 [data-tutorial="upload-button"],
      body.tutorial-step-2 [data-tutorial="upload-button"] * {
         z-index: 100002 !important;
         position: relative !important;
         pointer-events: auto !important;
      }
      
      body.tutorial-step-2 [role="dialog"],
      body.tutorial-step-2 [role="dialog"] *,
      body.tutorial-step-2 [data-state="open"],
      body.tutorial-step-2 [data-state="open"] * {
         z-index: 2147483646 !important;
         pointer-events: auto !important;
         opacity: 1 !important;
         visibility: visible !important;
      }
      
      body.tutorial-step-2 [data-radix-dialog-overlay] {
         z-index: 2147483645 !important;
      }

      /* 🔥 PASO 3: TABS FILTERS */
      body.tutorial-step-3 [data-tutorial="tabs-filters"],
      body.tutorial-step-3 [data-tutorial="tabs-filters"] * {
         z-index: 100002 !important;
         position: relative !important;
         background: transparent !important;
      }

      /* 🔥 PASO 4: EXPORT PDF */
      body.tutorial-step-4 [data-tutorial="export-pdf"],
      body.tutorial-step-4 [data-tutorial="export-pdf"] * {
         z-index: 100002 !important;
         position: relative !important;
      }

      /* 🔥 PASO 5: TABLE */
      body.tutorial-step-5 [data-tutorial="documents-table"] {
         z-index: 100002 !important;
         position: relative !important;
         background: inherit !important; 
      }
      body.tutorial-step-5 [data-tutorial="documents-table"] * {
         z-index: 100002 !important;
         position: relative !important;
      }

      .driver-active-element {
        outline: 2px solid #7c3aed !important;
        outline-offset: 4px;
      }
      
      .driver-popover-title { color: hsl(var(--primary)) !important; font-weight: 600; }
      .driver-popover-next-btn { background-color: hsl(var(--primary)) !important; color: white !important; }
      .driver-popover-prev-btn { color: hsl(var(--primary)) !important; border: 1px solid hsl(var(--primary)) !important; }
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
