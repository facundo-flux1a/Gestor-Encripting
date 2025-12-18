'use client';

import { useEffect, useRef } from 'react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { useActividad } from '@/context/ActividadProvider';

export function ActividadTutorial() {
  const { shouldShowTutorial, isLoading, markAsCompleted } = useActividad();
  const driverInstanceRef = useRef<ReturnType<typeof driver> | null>(null);
  const hasRunRef = useRef(false);
  const lastStepRef = useRef(0);

  useEffect(() => {
    if (isLoading || !shouldShowTutorial || hasRunRef.current) {
      console.log('📊 [ActividadTutorial] Esperando...', { isLoading, shouldShowTutorial, hasRun: hasRunRef.current });
      return;
    }

    // Esperar a que la tabla esté renderizada
    const checkForTable = setInterval(() => {
      const tableElement = document.querySelector('[data-tutorial="actividad-table"]');
      
      if (tableElement) {
        console.log('✅ [ActividadTutorial] Tabla encontrada, iniciando tutorial');
        clearInterval(checkForTable);
        hasRunRef.current = true;
        startTutorial();
      } else {
        console.log('⏳ [ActividadTutorial] Esperando tabla...');
      }
    }, 500);

    return () => {
      clearInterval(checkForTable);
      if (driverInstanceRef.current) {
        console.log('🧹 [ActividadTutorial] Limpiando driver');
        driverInstanceRef.current.destroy();
        driverInstanceRef.current = null;
      }
    };
  }, [isLoading, shouldShowTutorial]);

  const startTutorial = () => {
    console.log('🚀 [ActividadTutorial] Iniciando tutorial');

    // Determinar si hay filas ZIP visibles
    const hasZipRows = document.querySelector('[data-tutorial="actividad-zip"]') !== null;
    console.log('📁 [ActividadTutorial] ¿Hay ZIPs?', hasZipRows);

    const driverInstance = driver({
      showProgress: true,
      showButtons: ['next', 'previous'],
      animate: true,
      allowClose: false,
      overlayOpacity: 0.75,
      overlayClickNext: false,
      disableActiveInteraction: true, // ⬅️ CRÍTICO: Deshabilitar interacción con elementos highlighted
      
      steps: [
        // Paso 0: Bienvenida
        {
          element: '[data-tutorial="actividad-welcome"]',
          popover: {
            title: '📊 Historial de Actividad',
            description: '¡Bienvenido! Aquí vas a ver todos los documentos que subiste, su estado de procesamiento, y acciones disponibles.',
            side: 'bottom',
            align: 'start',
          },
        },
        // Paso 1: Tabla principal
        {
          element: '[data-tutorial="actividad-table"]',
          popover: {
            title: '📋 Tabla de Actividades',
            description: 'Esta tabla muestra todas tus actividades. Cada fila representa un documento subido. Podés hacer click en documentos completados para verlos en detalle.',
            side: 'top',
            align: 'center',
          },
        },
        // Paso 2: Estados y badges
        {
          element: '[data-tutorial="actividad-badges"]',
          popover: {
            title: '🎨 Estados y Notificaciones',
            description: 'Los badges de color indican el estado: ✅ Verde = Completado, 🔴 Rojo = Fallido, 🟡 Amarillo = Interrumpido. El badge "✨ Nuevo" o "⚠️ Alerta" indica actividades sin leer.',
            side: 'right',
            align: 'start',
          },
        },
        // Paso 3: Documentos ZIP (condicional)
        ...(hasZipRows
          ? [
              {
                element: '[data-tutorial="actividad-zip"]',
                popover: {
                  title: '📁 Archivos ZIP/RAR',
                  description: 'Los archivos ZIP/RAR se muestran como carpetas. Hacé click en cualquier fila ZIP para expandir y ver los documentos contenidos.',
                  side: 'right',
                  align: 'start',
                },
              },
            ]
          : []),
        // Paso 4/5: Marcar todos como leídos
        {
          element: '[data-tutorial="actividad-mark-read"]',
          popover: {
            title: '✅ Marcar como Leídos',
            description: 'Con este botón podés marcar todas las actividades como leídas de una vez, limpiando los badges "✨ Nuevo" y "⚠️ Alerta".',
            side: 'bottom',
            align: 'end',
          },
        },
        // Paso 5/6: Filtros
        {
          element: '[data-tutorial="actividad-filters"]',
          popover: {
            title: '🔍 Filtros',
            description: 'Usá los filtros para buscar actividades específicas por estado, fecha, o texto. El contador muestra cuántos filtros están activos.',
            side: 'bottom',
            align: 'end',
          },
        },
        // Paso 6/7: Auto-refresh
        {
          element: '[data-tutorial="actividad-autorefresh"]',
          popover: {
            title: '🔄 Actualización Automática',
            description: 'Activá el auto-refresh para que la tabla se actualice automáticamente cada pocos segundos mientras procesás documentos.',
            side: 'bottom',
            align: 'end',
          },
        },
        // Paso 7/8: Acciones por fila
        {
          element: '[data-tutorial="actividad-actions"]',
          popover: {
            title: '⚡ Acciones Disponibles',
            description: 'Cada fila tiene acciones: ✅ Marcar leído, 🔄 Reintentar (si falló), 🗑️ Eliminar. También podés ver el origen (Dashboard/Correo) del documento.',
            side: 'left',
            align: 'center',
          },
        },
        // Paso 8/9: Finalización
        {
          element: 'body',
          popover: {
            title: '🎉 ¡Tutorial Completado!',
            description: '¡Perfecto! Ahora podés gestionar todo tu historial de documentos. Los documentos completados son clickeables para verlos en detalle. Los fallidos o interrumpidos muestran detalles del error al hacer click.',
            side: 'center',
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
        console.log('🎯 [ActividadTutorial] Paso:', currentStepIndex, element);
      },
      
      onNextClick: (element, step, options) => {
        const currentIndex = options.state.activeIndex;
        console.log('➡️ [ActividadTutorial] Avanzando desde paso:', currentIndex);
        driverInstance.moveNext();
      },

      onPrevClick: () => {
        console.log('⬅️ [ActividadTutorial] Retrocediendo');
        driverInstance.movePrevious();
      },
      
      onDestroyStarted: async () => {
        const finalStep = lastStepRef.current;
        const totalSteps = hasZipRows ? 8 : 7; // Ajustar según si hay ZIP
        
        console.log('🏁 [ActividadTutorial] Cerrando en paso:', finalStep, '/ Total:', totalSteps);
        
        // Solo marcar como completado si llegó al final
        if (finalStep >= totalSteps) {
          console.log('✅ [ActividadTutorial] Tutorial completado');
          await markAsCompleted();
        } else {
          console.log('⚠️ [ActividadTutorial] Tutorial cerrado prematuramente');
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

  // 🔥 ESTILOS CRÍTICOS - BLOQUEAR TODOS LOS CLICKS
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