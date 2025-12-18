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
        overlayClickNext: false,
        disableActiveInteraction: false,
        
        steps: [
          {
            element: 'body',
            popover: {
              title: '📄 ¡Bienvenido a Documentos!',
              description: 'Te guiaremos por las funciones principales de esta sección donde podrás gestionar todas tus facturas, abonos y documentos fiscales.',
              side: 'center',
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
              align: 'start'
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
              align: 'end'
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
              side: 'center',
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
          
          // ✅ PASO 1 (índice 1): Selector de empresas
          if (currentStepIndex === 1) {
            console.log('🏢 PASO 1: Abriendo selector de empresas');
            document.body.setAttribute('data-tutorial-step', '1');
            
            setTimeout(() => {
              const overlay = document.querySelector('.driver-overlay');
              if (overlay) {
                (overlay as HTMLElement).style.pointerEvents = 'none';
              }
              
              const trigger = document.querySelector('[data-tutorial="company-selector"] button[role="combobox"]');
              
              if (trigger) {
                console.log('✅ Trigger encontrado, abriendo popover...');
                (trigger as HTMLElement).click();
                
                setTimeout(() => {
                  const popoverContent = document.querySelector('[data-radix-popper-content-wrapper]');
                  if (popoverContent) {
                    console.log('✅ Popover content encontrado, haciendo interactivo...');
                    (popoverContent as HTMLElement).style.pointerEvents = 'auto';
                    (popoverContent as HTMLElement).style.zIndex = '10000002';
                    
                    const allElements = popoverContent.querySelectorAll('*');
                    allElements.forEach(el => {
                      (el as HTMLElement).style.pointerEvents = 'auto';
                    });
                    
                    console.log(`✅ ${allElements.length} elementos hechos interactivos`);
                  }
                }, 200);
              }
            }, 100);
          }
          // ✅ PASO 2 (índice 2): Subir documento
          else if (currentStepIndex === 2) {
            console.log('📤 PASO 2: Verificando documentos existentes...');
            document.body.setAttribute('data-tutorial-step', '2');
            
            // 🔥 VERIFICAR SI YA HAY DOCUMENTOS EN LA TABLA
            const tableBody = document.querySelector('[data-tutorial="documents-table"] tbody');
            const documentRows = tableBody ? Array.from(tableBody.querySelectorAll('tr')).filter(row => {
              const hasEmptyMessage = row.textContent?.includes('No hay') || row.textContent?.includes('Cargando');
              return !hasEmptyMessage;
            }) : [];
            const hasExistingDocuments = documentRows.length > 0;
            
            console.log('📊 Documentos existentes:', { hasExistingDocuments, count: documentRows.length });
            
            // Solo abrir el modal si NO hay documentos
            if (!hasExistingDocuments) {
              console.log('📤 No hay documentos, abriendo modal...');
              
              setTimeout(() => {
                const overlay = document.querySelector('.driver-overlay');
                if (overlay) {
                  (overlay as HTMLElement).style.pointerEvents = 'none';
                }
                
                const uploadButton = document.querySelector('[data-tutorial="upload-button"]');
                
                if (uploadButton) {
                  console.log('✅ Botón de subida encontrado, abriendo modal...');
                  (uploadButton as HTMLElement).click();
                  
                  setTimeout(() => {
                    // Hacer interactivo TODO el dialog/modal
                    const dialogOverlay = document.querySelector('[role="dialog"]');
                    const dialogContent = document.querySelector('[role="dialog"]')?.parentElement;
                    
                    if (dialogOverlay) {
                      console.log('✅ Modal encontrado, haciendo interactivo...');
                      (dialogOverlay as HTMLElement).style.pointerEvents = 'auto';
                      (dialogOverlay as HTMLElement).style.zIndex = '10000002';
                      
                      const allElements = dialogOverlay.querySelectorAll('*');
                      allElements.forEach(el => {
                        (el as HTMLElement).style.pointerEvents = 'auto';
                      });
                      
                      console.log(`✅ ${allElements.length} elementos del modal hechos interactivos`);
                    }
                    
                    if (dialogContent) {
                      (dialogContent as HTMLElement).style.pointerEvents = 'auto';
                      (dialogContent as HTMLElement).style.zIndex = '10000003';
                    }
                    
                    // Hacer interactivo el backdrop del dialog
                    const backdrop = document.querySelector('[data-radix-dialog-overlay]');
                    if (backdrop) {
                      (backdrop as HTMLElement).style.pointerEvents = 'auto';
                      (backdrop as HTMLElement).style.zIndex = '10000001';
                    }
                  }, 300);
                }
              }, 100);
            } else {
              console.log('✅ Ya hay documentos subidos, saltando apertura del modal');
            }
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
            
            // Permitir avanzar SOLO si hay documentos visibles en la tabla
            if (hasVisibleDocuments) {
              console.log('✅ Documento subido (detectado en la tabla)');
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
      
      /* 🔥 SIDEBAR: Por encima del overlay y SIEMPRE interactiva */
      body:has(.driver-overlay) [data-sidebar],
      body:has(.driver-overlay) aside[data-sidebar] {
        z-index: 10000001 !important;
        position: relative !important;
      }
      
      /* 🔥 TODOS los elementos de la sidebar son clickeables */
      body:has(.driver-overlay) [data-sidebar] *,
      body:has(.driver-overlay) aside[data-sidebar] *,
      body:has(.driver-overlay) [data-tutorial="company-selector"],
      body:has(.driver-overlay) [data-tutorial="company-selector"] *,
      body:has(.driver-overlay) [data-tutorial="company-selector"] input,
      body:has(.driver-overlay) [data-tutorial="company-selector"] button,
      body:has(.driver-overlay) [data-tutorial="company-selector"] label {
        pointer-events: auto !important;
      }
      
      /* 🔥 Popover de empresas por encima de todo */
      body:has(.driver-overlay) [data-radix-popper-content-wrapper] {
        z-index: 10000002 !important;
        pointer-events: auto !important;
      }
      
      body:has(.driver-overlay) [data-radix-popper-content-wrapper] * {
        pointer-events: auto !important;
      }
      
      /* 🔥 MODAL DE SUBIDA: Por encima de todo y completamente interactivo */
      body[data-tutorial-step="2"] [role="dialog"],
      body[data-tutorial-step="2"] [role="dialog"] *,
      body[data-tutorial-step="2"] [data-radix-dialog-overlay],
      body[data-tutorial-step="2"] [data-radix-dialog-content] {
        pointer-events: auto !important;
        z-index: 10000002 !important;
      }
      
      body[data-tutorial-step="2"] [data-radix-dialog-overlay] {
        z-index: 10000001 !important;
      }
      
      /* 🔥 Asegurar que inputs, botones, y área de drag-drop son clickeables */
      body[data-tutorial-step="2"] input,
      body[data-tutorial-step="2"] button,
      body[data-tutorial-step="2"] select,
      body[data-tutorial-step="2"] textarea,
      body[data-tutorial-step="2"] [role="button"],
      body[data-tutorial-step="2"] [type="file"] {
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

  return null;
}