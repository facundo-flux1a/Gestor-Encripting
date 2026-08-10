'use client';

import { useEffect, useState, useRef } from 'react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { usePathname } from 'next/navigation';
import { useCompanyContext } from '@/context/CompanyProvider';
import { useTutorial } from '@/context/tutorial-context';
import { injectSkipButton, removeSkipButton } from '@/lib/tutorial-utils';

const DESKTOP_UPLOAD_STEP_INDEX = 2;
const MOBILE_UPLOAD_STEP_INDEX = 3;

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

      if (lastStepRef.current === DESKTOP_UPLOAD_STEP_INDEX && driverRef.current) {
        setTimeout(() => {
          try {
            driverRef.current?.moveNext();
          } catch {
            /* driver puede haberse destruido */
          }
        }, 600);
      }
    };
    window.addEventListener('documentUploaded', handleDocumentUpload);
    return () => window.removeEventListener('documentUploaded', handleDocumentUpload);
  }, []);

  // Detectar solo el modal de subida (no ocultar el tutorial)
  useEffect(() => {
    const checkUploadModal = () => {
      const uploadModal = document.querySelector('[data-tutorial="upload-modal"]');
      const isUploadOpen = !!uploadModal;

      if (isUploadOpen !== isModalOpen) {
        setIsModalOpen(isUploadOpen);
        document.body.classList.toggle('tutorial-upload-modal-open', isUploadOpen);
      }
    };

    const interval = setInterval(checkUploadModal, 150);
    return () => {
      clearInterval(interval);
      document.body.classList.remove('tutorial-upload-modal-open');
    };
  }, [isModalOpen]);

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

  const driverRef = useRef<any>(null);

  useEffect(() => {
    if (!localShouldShow) return;

    if (hasInitialized.current) return;

    const timer = setTimeout(() => {
      hasInitialized.current = true;
      if (driverRef.current) {
        try { driverRef.current.destroy(); } catch (e) {}
        driverRef.current = null;
      }
      document.querySelectorAll('.driver-popover, .driver-overlay, .driver-stage, .driver-popover-wrapper').forEach(el => el.remove());

      const finalSteps = [
        {
          element: 'body',
          popover: {
            title: 'Bienvenido a Documentos',
            description: 'Te guiaremos detalladamente por las funciones y secciones clave de este módulo.',
            side: 'bottom', align: 'center'
          } as any
        },
        {
          element: '[data-tutorial="company-selector"]',
          popover: {
            title: 'Paso 1: Selecciona una empresa',
            description: 'Selecciona una o varias empresas en el selector lateral para visualizar y gestionar sus documentos en tiempo real.',
            side: 'right', align: 'start'
          }
        },
        {
          element: '[data-tutorial="upload-button"]',
          popover: {
            title: 'Paso 2: Subir documentos',
            description: 'Haz clic en Subir para abrir el asistente. Selecciona la empresa, elige un PDF o imagen y confirma la carga. Cuando el archivo se encole, avanzaremos automáticamente.',
            side: 'bottom', align: 'center'
          }
        },
        {
          element: '[data-tutorial="centro-seguridad-link"]',
          popover: {
            title: 'Centro de Seguridad e Inconsistencias',
            description: 'Si un documento subido tiene datos ambiguos o inconsistencias fiscales, se enviará al Centro de Seguridad para su validación manual.',
            side: 'right', align: 'center'
          }
        },
        {
          element: '[data-tutorial="tabs-filters"]',
          popover: {
            title: 'Paso 3: Categorías y Pestañas',
            description: 'Clasifica tus comprobantes. Cambia entre Facturas Recibidas (gastos), Facturas Emitidas (ingresos), Otros tipos, y Sin Confirmar.',
            side: 'bottom', align: 'center'
          }
        },
        {
          element: '[data-tutorial="clean-duplicates"]',
          popover: {
            title: 'Gestión de Duplicados',
            description: 'El sistema detecta automáticamente facturas duplicadas. Haz clic en Limpiar Duplicados para revisar y resolver coincidencias en un solo clic.',
            side: 'bottom', align: 'center'
          }
        },
        {
          element: '[data-tutorial="global-search"]',
          popover: {
            title: 'Búsqueda y Filtros',
            description: 'Encuentra cualquier comprobante al instante escribiendo en la barra de búsqueda global o filtrando columnas específicas en la tabla.',
            side: 'bottom', align: 'center'
          }
        },
        {
          element: '[data-tutorial="export-pdf"]',
          popover: {
            title: 'Exportar Informes y Reportes',
            description: 'Genera un informe PDF con los documentos filtrados usando el botón superior, o bien exporta a Excel y CSV desde la propia tabla.',
            side: 'bottom', align: 'center'
          }
        },
        {
          element: '[data-tutorial="documents-table"]',
          popover: {
            title: 'Tabla Interactiva y Arrastrar Filas',
            description: 'Ordena columnas, ajusta el scroll horizontal y mueve facturas entre Emitidas y Recibidas arrastrando y soltando las filas sobre las pestañas.',
            side: 'top', align: 'center'
          }
        },
        {
          element: 'body',
          popover: {
            title: 'Detalle del Documento',
            description: 'Haz clic en cualquier fila para inspeccionar el desglose individual: bases imponibles, desglose de impuestos (IVA, IRPF, recargos) y productos línea por línea.',
            side: 'bottom', align: 'center'
          }
        },
        {
          element: 'body',
          popover: {
            title: 'Todo listo',
            description: 'Ya conoces todas las secciones y herramientas para administrar tus documentos de forma eficiente.',
            side: 'bottom', align: 'center'
          }
        }
      ].filter(step => {
        if (typeof step.element === 'string' && step.element !== 'body') {
          return !!document.querySelector(step.element);
        }
        return true;
      });

      const completeDocumentosTutorial = async (targetDriver: ReturnType<typeof driver>) => {
        removeSkipButton();
        document.body.classList.forEach(cls => {
          if (cls.startsWith('tutorial-step-')) document.body.classList.remove(cls);
        });

        try {
          const res = await fetch('/api/user/tutorial-documentos', { method: 'POST' });
          if (!res.ok) throw new Error('No se pudo marcar el tutorial como completado');

          localStorage.removeItem('force_tutorial_documentos');
          localStorage.removeItem('tutorial_document_uploaded');
          setLocalShouldShow(false);
          setIsTutorialActive(false);
          driverRef.current = null;
          targetDriver.destroy();
          console.log('✅ [DocumentosTutorial] Tutorial completado, recargando página');
          window.location.reload();
        } catch (error) {
          console.error('❌ [DocumentosTutorial] Error completando tutorial:', error);
        }
      };

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
            void completeDocumentosTutorial(driverObj);
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
            void completeDocumentosTutorial(driverObj);
          } else {
            driverObj.moveNext();
          }
        },

        onCloseClick: () => {
          console.log('❌ [DocumentosTutorial] onCloseClick');
          void completeDocumentosTutorial(driverObj);
        },

        onDestroyStarted: () => {
          console.log('🏁 [DocumentosTutorial] onDestroyStarted');
          setIsTutorialActive(false);
          removeSkipButton();
          document.body.classList.remove('tutorial-upload-modal-open');
          document.body.classList.forEach(cls => {
            if (cls.startsWith('tutorial-step-')) document.body.classList.remove(cls);
          });
        },
      });

      document.querySelectorAll('.driver-popover, .driver-overlay').forEach(el => el.remove());
      driverRef.current = driverObj;
      setDriverInstance(driverObj);
      driverObj.drive(lastStepRef.current);
    }, 400);

    return () => {
      clearTimeout(timer);
      // Do NOT destroy the driver here — cleanup runs on dep changes too.
      // Driver destruction is handled inside onDestroyStarted and the unmount effect.
    };
  }, [localShouldShow, setIsTutorialActive]);

  // Cleanup on component unmount only
  useEffect(() => {
    return () => {
      if (driverRef.current) {
        try { driverRef.current.destroy(); } catch (e) {}
        driverRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const style = document.createElement('style');
    style.id = 'documentos-tutorial-desktop-styles';
    style.textContent = `
      .driver-overlay,
      #driver-page-overlay,
      #driver-highlighted-element-stage {
        z-index: 9997 !important;
        pointer-events: none !important;
      }

      .driver-active-element {
        z-index: 9999 !important;
        position: relative !important;
        outline: 4px solid hsl(var(--primary)) !important;
        box-shadow: 0 0 0 4px hsla(var(--primary) / 0.3) !important;
        border-radius: 8px !important;
        opacity: 1 !important;
        transition: all 0.3s ease !important;
      }

      .driver-stage {
        background-color: transparent !important;
        border-radius: 8px !important;
        box-shadow: none !important;
        z-index: 9998 !important;
        pointer-events: none !important;
      }

      /* Modal de subida: por encima del tutorial y totalmente interactivo */
      [data-radix-portal]:has([data-tutorial="upload-modal"]),
      [data-radix-portal]:has([data-tutorial="upload-modal"]) *,
      [data-tutorial="upload-modal"],
      [data-tutorial="upload-modal"] *,
      body.driver-active [data-tutorial="upload-modal"],
      body.driver-active [data-tutorial="upload-modal"] *,
      body.driver-active [data-radix-portal]:has([data-tutorial="upload-modal"]),
      body.driver-active [data-radix-portal]:has([data-tutorial="upload-modal"]) * {
        pointer-events: auto !important;
        z-index: 2147483647 !important;
      }

      [data-radix-popper-content-wrapper],
      [data-radix-popper-content-wrapper] * {
        pointer-events: auto !important;
        z-index: 2147483648 !important;
      }

      body.tutorial-upload-modal-open .driver-overlay {
        opacity: 0.12 !important;
      }

      body.tutorial-upload-modal-open .driver-popover {
        z-index: 2147483640 !important;
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
        border: 1px solid rgba(139, 92, 246, 0.4) !important;
        background-color: rgba(15, 23, 42, 0.95) !important;
        backdrop-filter: blur(16px) !important;
        border-radius: 14px !important;
        color: white !important;
        padding: 18px 20px !important;
        min-width: 320px !important;
        max-width: 380px !important;
        box-shadow: 0 20px 30px -5px rgba(0, 0, 0, 0.5), 0 8px 15px -6px rgba(0, 0, 0, 0.3) !important;
        z-index: 10000 !important;
      }

      .driver-popover-title {
        color: white !important;
        font-weight: 700 !important;
        font-size: 1.1rem !important;
        margin-bottom: 6px !important;
      }

      .driver-popover-description {
        color: rgba(255, 255, 255, 0.9) !important;
        font-weight: 400 !important;
        font-size: 0.875rem !important;
        line-height: 1.5 !important;
      }

      .driver-popover-footer {
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        gap: 8px !important;
        margin-top: 16px !important;
        padding-top: 12px !important;
        border-top: 1px solid rgba(255, 255, 255, 0.1) !important;
      }

      .driver-popover-navigation-btns {
        display: flex !important;
        align-items: center !important;
        gap: 6px !important;
      }

      .driver-popover-progress-text {
        font-size: 11px !important;
        font-weight: 600 !important;
        color: rgba(255, 255, 255, 0.5) !important;
        margin: 0 4px !important;
        white-space: nowrap !important;
      }

      .driver-popover-next-btn {
        background-color: #6600A3 !important;
        color: white !important;
        border: none !important;
        text-shadow: none !important;
        font-size: 12px !important;
        font-weight: 600 !important;
        padding: 6px 14px !important;
        border-radius: 8px !important;
        height: 32px !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        transition: all 0.2s;
      }

      .driver-popover-next-btn:hover {
        background-color: #7c3aed !important;
        transform: translateY(-1px);
      }

      .driver-popover-prev-btn {
        color: rgba(255, 255, 255, 0.9) !important;
        border: 1px solid rgba(255, 255, 255, 0.2) !important;
        background: rgba(255, 255, 255, 0.06) !important;
        text-shadow: none !important;
        font-size: 12px !important;
        font-weight: 500 !important;
        padding: 6px 12px !important;
        border-radius: 8px !important;
        height: 32px !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
      }

      .driver-popover-prev-btn:hover {
        background: rgba(255, 255, 255, 0.15) !important;
        color: white !important;
      }

      .driver-popover-close-btn {
        color: rgba(255, 255, 255, 0.5) !important;
        top: 12px !important;
        right: 12px !important;
      }

      .driver-popover-close-btn:hover {
        color: white !important;
      }

      .driver-popover-arrow {
        border-bottom-color: rgba(15, 23, 42, 0.95) !important;
        border-top-color: rgba(15, 23, 42, 0.95) !important;
      }
    `;
    document.head.appendChild(style);
    return () => {
      const el = document.getElementById('documentos-tutorial-desktop-styles');
      if (el) el.remove();
    };
  }, []);

  return null;
}
