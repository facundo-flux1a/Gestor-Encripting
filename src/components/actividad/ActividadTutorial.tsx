'use client';

import { useEffect, useRef } from 'react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { useActividad } from '@/context/ActividadProvider';

export function ActividadTutorial() {
  const { shouldShowTutorial, isLoading, markAsCompleted, setTutorialMode } = useActividad();
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
      const welcomeElement = document.querySelector('[data-tutorial="actividad-welcome"]');

      if (welcomeElement) {
        console.log('✅ [ActividadTutorial] Elemento de bienvenida encontrado, iniciando tutorial');
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
    // 🎯 Activar modo tutorial (limpia filtros y guarda previos)
    setTutorialMode(true);

    // Determinar si hay filas y ZIPs visibles
    const hasRows = document.querySelector('[data-tutorial="actividad-badges"]') !== null;
    const hasZipRows = document.querySelector('[data-tutorial="actividad-zip"]') !== null;
    console.log('📊 [ActividadTutorial] ¿Hay filas?', hasRows, '¿Hay ZIPs?', hasZipRows);

    const driverInstance = driver({
      showProgress: true,
      showButtons: ['next', 'previous'],
      animate: true,
      allowClose: false,
      overlayOpacity: 0.75,
      // overlayClickNext: false,
      disableActiveInteraction: true, // ⬅️ CRÍTICO: Deshabilitar interacción con elementos highlighted

      steps: [
        // Paso 0: Bienvenida
        {
          element: '[data-tutorial="actividad-welcome"]',
          popover: {
            title: '📊 Historial de Actividad',
            description: '¡Bienvenido! Aquí vas a ver todos los documentos que subiste, su estado de procesamiento, y acciones disponibles.',
            side: 'bottom' as const,
            align: 'start' as const,
          },
        },
        // Paso 1: Tabla principal
        {
          element: '[data-tutorial="actividad-table"]',
          popover: {
            title: '📋 Tabla de Actividades',
            description: 'Esta tabla muestra todas tus actividades. Cada fila representa un documento subido. Podés hacer click en documentos completados para verlos en detalle.',
            side: 'top' as const,
            align: 'center' as const,
          },
        },
        // Paso 2: Estados y badges (condicional)
        ...(hasRows
          ? [
            {
              element: '[data-tutorial="actividad-badges"]',
              popover: {
                title: '🎨 Estados y Notificaciones',
                description: 'Los badges de color indican el estado: ✅ Verde = Completado, 🔴 Rojo = Fallido, 🟡 Amarillo = Interrumpido. El badge "✨ Nuevo" o "⚠️ Alerta" indica actividades sin leer.',
                side: 'right' as const,
                align: 'start' as const,
              },
            },
          ]
          : []),
        // Paso 3: Documentos ZIP (condicional)
        ...(hasZipRows
          ? [
            {
              element: '[data-tutorial="actividad-zip"]',
              popover: {
                title: '📁 Archivos ZIP/RAR',
                description: 'Los archivos ZIP/RAR se muestran como carpetas. Hacé click en cualquier fila ZIP para expandir y ver los documentos contenidos.',
                side: 'right' as const,
                align: 'start' as const,
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
            side: 'bottom' as const,
            align: 'end' as const,
          },
        },
        // Paso 5/6: Filtros
        {
          element: '[data-tutorial="actividad-filters"]',
          popover: {
            title: '🔍 Filtros',
            description: 'Usá los filtros para buscar actividades específicas por estado, fecha, o texto (Predeterminadamente, los filtros mostrarán actividad fallidas para su pronta revisión). El contador muestra cuántos filtros están activos.',
            side: 'bottom' as const,
            align: 'end' as const,
          },
        },
        // Paso 6/7: Auto-refresh
        {
          element: '[data-tutorial="actividad-autorefresh"]',
          popover: {
            title: '🔄 Actualización Automática',
            description: 'Activá el auto-refresh para que la tabla se actualice automáticamente cada pocos segundos mientras procesás documentos.',
            side: 'bottom' as const,
            align: 'end' as const,
          },
        },
        // Paso 7/8: Acciones por fila (condicional)
        ...(hasRows
          ? [
            {
              element: '[data-tutorial="actividad-actions"]',
              popover: {
                title: '⚡ Acciones Disponibles',
                description: 'Cada fila tiene acciones: ✅ Marcar leído, 🔄 Reintentar (si falló), 🗑️ Eliminar (Ésta acción solo eliminará el registro de actividad, no el documento asociado). También podés ver el origen (Dashboard/Correo) del documento.',
                side: 'left' as const,
                align: 'center' as const,
              },
            },
          ]
          : []),
        // Paso 8/9: Finalización
        {
          element: 'body',
          popover: {
            title: '🎉 ¡Tutorial Completado!',
            description: '¡Perfecto! Ahora podés gestionar todo tu historial de documentos. Los documentos completados son clickeables para verlos en detalle. Los fallidos o interrumpidos muestran detalles del error al hacer click.',
            // side: 'center' as const,
            align: 'center' as const,
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
        const idx = options.state.activeIndex ?? 0;
        const totalSteps = driverInstance.getConfig().steps?.length ?? 0;
        console.log('➡️ [ActividadTutorial] onNextClick - Paso:', idx, 'de', totalSteps);

        if (idx === totalSteps - 1) {
          console.log('🏁 [ActividadTutorial] Último paso alcanzado. Completando...');
          markAsCompleted();
          setTimeout(() => {
            console.log('🧨 [ActividadTutorial] Ejecutando destroy()');
            driverInstance.destroy();
          }, 100);
        } else {
          driverInstance.moveNext();
        }
      },

      onCloseClick: () => {
        console.log('❌ [ActividadTutorial] onCloseClick');
        const idx = driverInstance.getActiveIndex() ?? 0;
        const totalSteps = driverInstance.getConfig().steps?.length ?? 0;

        if (idx >= totalSteps - 2) {
          markAsCompleted();
        }

        driverInstance.destroy();
      },

      onPrevClick: () => {
        // console.log('⬅️ [ActividadTutorial] Retrocediendo');
        driverInstance.movePrevious();
      },

      onDestroyStarted: () => {
        // 🎯 Desactivar modo tutorial (restaura filtros originales)
        setTutorialMode(false);

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