'use client';

import { useEffect, useRef } from 'react';
import { driver, type DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';
import { useIncidencias } from '@/context/IncidenciasProvider';

export function IncidenciasTutorial() {
  const { shouldShowTutorial, isLoading, markAsCompleted } = useIncidencias();
  const driverInstanceRef = useRef<ReturnType<typeof driver> | null>(null);
  const hasRunRef = useRef(false);
  const lastStepRef = useRef(0);

  useEffect(() => {
    if (isLoading || !shouldShowTutorial || hasRunRef.current) {
      console.log('📊 [IncidenciasTutorial] Esperando...', { isLoading, shouldShowTutorial, hasRun: hasRunRef.current });
      return;
    }

    // Esperar a que la página esté cargada
    const checkForPage = setInterval(() => {
      const headerElement = document.querySelector('[data-tutorial="incidencias-header"]');

      if (headerElement) {
        console.log('✅ [IncidenciasTutorial] Página encontrada, iniciando tutorial');
        clearInterval(checkForPage);
        hasRunRef.current = true;
        startTutorial();
      } else {
        console.log('⏳ [IncidenciasTutorial] Esperando página...');
      }
    }, 500);

    return () => {
      clearInterval(checkForPage);
      if (driverInstanceRef.current) {
        console.log('🧹 [IncidenciasTutorial] Limpiando driver');
        driverInstanceRef.current.destroy();
        driverInstanceRef.current = null;
      }
    };
  }, [isLoading, shouldShowTutorial]);

  const startTutorial = () => {
    console.log('🚀 [IncidenciasTutorial] Iniciando tutorial');

    const steps: DriveStep[] = [
      // Paso 0: Bienvenida
      {
        element: '[data-tutorial="incidencias-header"]',
        popover: {
          title: '⚠️ Gestión de Incidencias',
          description: '¡Bienvenido! Aquí puedes gestionar todos los problemas detectados en tus documentos: duplicados, errores de cálculo y más.',
          side: 'bottom' as const,
          align: 'start' as const,
        },
      },
      // Paso 1: Analytics
      {
        element: '[data-tutorial="incidencias-analytics"]',
        popover: {
          title: '📊 Panel de Métricas',
          description: 'Este panel te muestra un resumen de todas las incidencias: cuántas están abiertas, cuántas resueltas, y qué proveedores tienen más problemas.',
          side: 'right' as const,
          align: 'start' as const,
        },
      },
      // Paso 2: Análisis Masivo
      {
        element: '[data-tutorial="incidencias-analizar"]',
        popover: {
          title: '🔍 Análisis Automático',
          description: 'Usa esta herramienta para revisar todos tus documentos de una vez. El sistema comparará datos automáticamente para detectar duplicados, errores de cálculo y documentos incompletos.',
          side: 'left' as const,
          align: 'start' as const,
        },
      },
      // Paso 3: Tabla de Incidencias de IA (análisis individual manual)
      {
        element: '[data-tutorial="incidencias-ai-table"]',
        popover: {
          title: '🤖 Incidencias del Análisis Individual',
          description: 'Aquí aparecen las incidencias detectadas cuando analizas un documento individualmente desde su vista de detalle. Son análisis manuales e individuales que has iniciado tú.',
          side: 'top' as const,
          align: 'center' as const,
        },
      },
      // Paso 4: Documentos con Incidencias (subida original)
      {
        element: '[data-tutorial="incidencias-documentos"]',
        popover: {
          title: '📄 Incidencias de Subida Original',
          description: 'Esta tabla muestra los documentos con incidencias detectadas durante la subida inicial al sistema. Son problemas encontrados automáticamente al procesar los documentos por primera vez.',
          side: 'top' as const,
          align: 'center' as const,
        },
      },
      // Paso 5: Finalización
      {
        element: 'body',
        popover: {
          title: '🎉 ¡Tutorial Completado!',
          description: '¡Perfecto! Ahora sabes cómo gestionar incidencias. Puedes analizar, validar y resolver problemas para mantener tus documentos en orden.',
          side: 'over' as const,
          align: 'center' as const,
        },
      },
    ];

    const driverInstance = driver({
      showProgress: true,
      showButtons: ['next', 'previous'],
      animate: true,
      allowClose: false,
      overlayOpacity: 0.75,
      disableActiveInteraction: true,
      steps,

      nextBtnText: 'Siguiente →',
      prevBtnText: '← Anterior',
      doneBtnText: '¡Entendido!',

      onHighlightStarted: (element, step, options) => {
        const currentStepIndex = options.state.activeIndex ?? 0;
        lastStepRef.current = currentStepIndex;
        console.log('🎯 [IncidenciasTutorial] Paso:', currentStepIndex, element);
      },

      onNextClick: (element, step, options) => {
        const idx = options.state.activeIndex ?? 0;
        const totalStepsCount = driverInstance.getConfig().steps?.length ?? 0;
        console.log('➡️ [IncidenciasTutorial] onNextClick - Paso:', idx, 'de', totalStepsCount);

        if (idx === totalStepsCount - 1) {
          console.log('🏁 [IncidenciasTutorial] Último paso alcanzado. Completando...');
          markAsCompleted();
          setTimeout(() => {
            console.log('🧨 [IncidenciasTutorial] Ejecutando destroy()');
            driverInstance.destroy();
          }, 100);
        } else {
          driverInstance.moveNext();
        }
      },

      onCloseClick: () => {
        console.log('❌ [IncidenciasTutorial] onCloseClick');
        const idx = driverInstance.getActiveIndex() ?? 0;
        const totalStepsCount = driverInstance.getConfig().steps?.length ?? 0;

        if (idx >= totalStepsCount - 2) {
          markAsCompleted();
        }

        driverInstance.destroy();
      },

      onPrevClick: () => {
        console.log('⬅️ [IncidenciasTutorial] Retrocediendo');
        driverInstance.movePrevious();
      },

      onDestroyStarted: () => {
        console.log('🏁 [IncidenciasTutorial] onDestroyStarted');
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