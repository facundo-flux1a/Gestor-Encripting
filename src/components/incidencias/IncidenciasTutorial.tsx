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
        const currentIndex = options.state.activeIndex;
        console.log('➡️ [IncidenciasTutorial] Avanzando desde paso:', currentIndex);
        driverInstance.moveNext();
      },

      onPrevClick: () => {
        console.log('⬅️ [IncidenciasTutorial] Retrocediendo');
        driverInstance.movePrevious();
      },

      onDestroyStarted: async () => {
        const finalStep = lastStepRef.current;
        const totalSteps = steps.length - 1;

        console.log('🏁 [IncidenciasTutorial] Cerrando en paso:', finalStep, '/ Total:', totalSteps);

        // Solo marcar como completado si llegó al final
        if (finalStep >= totalSteps) {
          console.log('✅ [IncidenciasTutorial] Tutorial completado');
          await markAsCompleted();
        } else {
          console.log('⚠️ [IncidenciasTutorial] Tutorial cerrado prematuramente');
        }

        if (driverInstance) {
          driverInstance.destroy();
        }
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