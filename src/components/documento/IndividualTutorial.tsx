'use client';

import { useEffect, useRef } from 'react';
import { driver, type DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';
import { useIndividual } from '@/context/IndividualProvider';
import { injectSkipButton, removeSkipButton } from '@/lib/tutorial-utils';

export function IndividualTutorial() {
  const { shouldShowTutorial, isLoading, markAsCompleted } = useIndividual();
  const driverInstanceRef = useRef<ReturnType<typeof driver> | null>(null);
  const hasRunRef = useRef(false);
  const lastStepRef = useRef(0);

  useEffect(() => {
    if (isLoading || !shouldShowTutorial || hasRunRef.current) {
      console.log('📊 [IndividualTutorial] Esperando...', { isLoading, shouldShowTutorial, hasRun: hasRunRef.current });
      return;
    }

    // Esperar a que el documento esté cargado
    const checkForDocument = setInterval(() => {
      const documentHeader = document.querySelector('[data-tutorial="documento-header"]');

      if (documentHeader) {
        console.log('✅ [IndividualTutorial] Documento encontrado, iniciando tutorial');
        clearInterval(checkForDocument);
        hasRunRef.current = true;
        startTutorial();
      } else {
        console.log('⏳ [IndividualTutorial] Esperando documento...');
      }
    }, 500);

    return () => {
      clearInterval(checkForDocument);
      if (driverInstanceRef.current) {
        console.log('🧹 [IndividualTutorial] Limpiando driver');
        driverInstanceRef.current.destroy();
        driverInstanceRef.current = null;
      }
    };
  }, [isLoading, shouldShowTutorial]);

  const startTutorial = () => {
    console.log('🚀 [IndividualTutorial] Iniciando tutorial');

    // Detectar elementos opcionales
    const hasIncidencias = document.querySelector('[data-tutorial="documento-incidencias"]') !== null;
    const hasArchivo = document.querySelector('[data-tutorial="documento-archivo"]') !== null;

    console.log('🔍 [IndividualTutorial] Elementos detectados:', { hasIncidencias, hasArchivo });

    const steps: DriveStep[] = [
      // Paso 0: Bienvenida
      {
        element: '[data-tutorial="documento-header"]',
        popover: {
          title: 'Vista de Documento',
          description: '¡Bienvenido! Aquí puedes ver todos los detalles de un documento, editarlo, validar incidencias y más.',
          side: 'bottom' as const,
          align: 'start' as const,
        },
      },
      // Paso 1: Botones de acción
      {
        element: '[data-tutorial="documento-actions"]',
        popover: {
          title: 'Acciones del Documento',
          description: 'Desde aquí puedes: Ver el PDF original, Editar el documento, Validar incidencias, Eliminar y Exportar. Ten en cuenta que si el trimestre está cerrado, no podrás editar.',
          side: 'bottom' as const,
          align: 'end' as const,
        },
      },
      // Paso 2: Modo Auditoría
      {
        element: '[data-tutorial="documento-auditoria"]',
        popover: {
          title: 'Modo Auditoría',
          description: '¿Ves algún descuadre o error? El Modo Auditoría abre una vista dividida donde puedes comparar el documento original con los datos extraídos, mientras la IA te sugiere correcciones automáticas.',
          side: 'bottom' as const,
          align: 'center' as const,
        },
      },
      // Paso 3: Vista principal del documento
      {
        element: '[data-tutorial="documento-view"]',
        popover: {
          title: 'Información del Documento',
          description: 'Aquí podrás ver datos como: número de documento, fechas, tipo, estado de verificación y todas las líneas de productos/servicios.',
          side: 'right' as const,
          align: 'start' as const,
        },
      },
    ];

    // Paso 3: Incidencias (condicional)
    if (hasIncidencias) {
      steps.push({
        element: '[data-tutorial="documento-incidencias"]',
        popover: {
          title: 'Incidencias Detectadas',
          description: 'Este documento tiene incidencias sin resolver. Puedes analizarlo de nuevo o validarlas manualmente si ya las resolviste.',
          side: 'left' as const,
          align: 'start' as const,
        },
      });
    }

    // Paso 4: Análisis de documento
    steps.push({
      element: '[data-tutorial="documento-analizar"]',
      popover: {
        title: 'Análisis con IA',
        description: 'Usa ésta herramienta para que el sistema analice automáticamente el documento y detecte posibles errores o duplicados. Puedes usar tu propia API key o la API pública (con límites diarios), además de especificar aún más el prompt.',
        side: 'left' as const,
        align: 'start' as const,
      },
    });

    // Paso 5: Entidades (proveedor/cliente)
    steps.push({
      element: '[data-tutorial="documento-entidades"]',
      popover: {
        title: 'Entidades del Documento',
        description: 'Aquí ves la información del proveedor o cliente, como: nombre, CIF, dirección y datos de contacto. En modo edición puedes modificarlos.',
        side: 'left' as const,
        align: 'start' as const,
      },
    });

    // Paso 6: Detalles financieros
    steps.push({
      element: '[data-tutorial="documento-financiero"]',
      popover: {
        title: 'Resumen Financiero',
        description: 'Resumen de importes: Base imponible, IVA desglosado por tipo, retenciones (si aplica) y total del documento.',
        side: 'left' as const,
        align: 'start' as const,
      },
    });

    // Paso 7: Ver archivo (condicional)
    if (hasArchivo) {
      steps.push({
        element: '[data-tutorial="documento-archivo"]',
        popover: {
          title: 'Archivo Original',
          description: 'Puedes hacer click en "Ver" para abrir el PDF original del documento en una vista previa.',
          side: 'bottom' as const,
          align: 'center' as const,
        },
      });
    }

    // Paso 8: Finalización
    steps.push({
      element: 'body',
      popover: {
        title: '¡Tutorial completado!',
        description: 'Ya conoces las herramientas para gestionar documentos. Puedes editar, analizar y validar documentos según tus necesidades.',
        side: 'over' as const,
        align: 'center' as const,
      },
    });

    const driverInstance = driver({
      showProgress: true,
      showButtons: ['next', 'previous', 'close'],
      animate: true,
      allowClose: true,
      overlayOpacity: 0.75,
      // overlayClickNext: false,
      disableActiveInteraction: true,
      steps,

      nextBtnText: 'Siguiente →',
      prevBtnText: '← Anterior',
      doneBtnText: '¡Entendido!',

      onHighlightStarted: (element, step, options) => {
        const currentStepIndex = options.state.activeIndex ?? 0;
        lastStepRef.current = currentStepIndex;
        console.log('🎯 [IndividualTutorial] Paso:', currentStepIndex, element);

        injectSkipButton(() => {
          markAsCompleted();
          removeSkipButton();
          driverInstanceRef.current?.destroy();
        });
      },

      onNextClick: (element, step, options) => {
        const idx = options.state.activeIndex ?? 0;
        const totalStepsCount = driverInstance.getConfig().steps?.length ?? 0;
        console.log('➡️ [IndividualTutorial] onNextClick - Paso:', idx, 'de', totalStepsCount);

        if (idx === totalStepsCount - 1) {
          console.log('🏁 [IndividualTutorial] Último paso alcanzado. Completando...');
          markAsCompleted();
          setTimeout(() => {
            console.log('🧨 [IndividualTutorial] Ejecutando destroy()');
            driverInstance.destroy();
          }, 100);
        } else {
          driverInstance.moveNext();
        }
      },

      onCloseClick: () => {
        console.log('❌ [IndividualTutorial] onCloseClick');
        markAsCompleted();
        driverInstance.destroy();
        removeSkipButton();
      },

      onPrevClick: () => {
        console.log('⬅️ [IndividualTutorial] Retrocediendo');
        driverInstance.movePrevious();
      },

      onDestroyStarted: () => {
        console.log('🏁 [IndividualTutorial] onDestroyStarted');
        removeSkipButton();
        // Limpieza de clases del body
        document.body.classList.forEach(cls => {
          if (cls.startsWith('tutorial-step-')) document.body.classList.remove(cls);
        });
      },
    });

    driverInstanceRef.current = driverInstance;

    // Pequeño delay para asegurar renderizado
    setTimeout(() => {
      driverInstance.drive();
    }, 300);
  };

  // 🔥 ESTILOS CRÍTICOS
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      /* 🔥 CRÍTICO: Overlay bloquea TODO excepto el popover */
      .driver-overlay {
        pointer-events: auto !important;
      }
      
      #driver-page-overlay,
      #driver-highlighted-element-stage {
        pointer-events: none !important;
      }
      
      /* 🔥 Elementos highlighted NO son clickeables */
      .driver-active-element,
      .driver-active-element *,
      .driver-active-element button,
      .driver-active-element a,
      .driver-active-element input,
      .driver-active-element [role="button"] {
        pointer-events: none !important;
        cursor: default !important;
      }
      
      /* 🔥 SOLO el popover es interactivo */
      .driver-popover,
      .driver-popover-wrapper,
      .driver-popover *,
      .driver-popover button {
        pointer-events: auto !important;
        cursor: pointer !important;
      }
      
      /* 🔥 Deshabilitar hover effects en elementos highlighted */
      .driver-active-element:hover,
      .driver-active-element *:hover {
        cursor: default !important;
      }
      
      /* Visual feedback de elementos highlighted */
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
      
      /* 🔥 Asegurar que NADA fuera del popover es clickeable */
      body:has(.driver-overlay) * {
        pointer-events: none !important;
      }
      
      body:has(.driver-overlay) .driver-popover,
      body:has(.driver-overlay) .driver-popover * {
        pointer-events: auto !important;
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