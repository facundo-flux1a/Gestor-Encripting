'use client';

import { useEffect, useRef } from 'react';
import { driver, type DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';
import { usePathname } from 'next/navigation';
import { useProveedores } from '@/context/ProveedoresProvider';
import { useCompanyContext } from '@/context/CompanyProvider';
import { injectSkipButton, removeSkipButton } from "@/lib/tutorial-utils";

export function ProveedoresTutorial() {
  const { shouldShowTutorial, isLoading, markAsCompleted } = useProveedores();
  const { selectedCompanyIds } = useCompanyContext(); // ⬅️ FIX
  const hasRunRef = useRef(false);
  const driverInstanceRef = useRef<ReturnType<typeof driver> | null>(null);
  const lastStepRef = useRef<number>(0);

  const pathname = usePathname();

  useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem('force_tutorial_proveedores') === 'true') {
      console.log('🔄 [ProveedoresTutorial] Replay detectado, reseteando hasRunRef');
      hasRunRef.current = false;
    }

    console.log('🔵 [ProveedoresTutorial] === INICIO useEffect ===');
    console.log('🔍 [ProveedoresTutorial] Estado actual:', {
      isLoading,
      shouldShowTutorial,
      hasRun: hasRunRef.current,
      selectedCompanyIds: selectedCompanyIds?.length || 0, // ⬅️ FIX
    });

    if (isLoading) {
      console.log('⏳ [ProveedoresTutorial] Saliendo: isLoading = true');
      return;
    }

    if (!shouldShowTutorial) {
      console.log('❌ [ProveedoresTutorial] Saliendo: shouldShowTutorial = false');
      return;
    }

    if (hasRunRef.current) {
      console.log('🔒 [ProveedoresTutorial] Saliendo: Ya se ejecutó');
      return;
    }

    console.log('✅ [ProveedoresTutorial] Todas las condiciones OK');

    const hasSelectedCompanies = selectedCompanyIds && selectedCompanyIds.length > 0; // ⬅️ FIX
    console.log('🏢 [ProveedoresTutorial] Empresas seleccionadas:', hasSelectedCompanies);

    // 🎬 FUNCIÓN: Tutorial CORTO (sin empresas - 4 pasos)
    const startTextOnlyTutorial = () => {
      console.log('🎬 [ProveedoresTutorial] === INICIANDO TUTORIAL CORTO (SIN EMPRESAS) ===');

      const textSteps: DriveStep[] = [
        {
          element: 'body',
          popover: {
            title: '¡Bienvenido a Proveedores! 🏢',
            description: 'Esta sección te permite gestionar todos tus proveedores de forma centralizada. Aquí puedes analizar gastos, ver documentos, explorar productos y detectar anomalías.\n\nNota: Para ver datos reales, necesitas tener empresas seleccionadas en el sistema.',
            side: 'over' as const,
          },
        },
        {
          element: 'body',
          popover: {
            title: 'Tabla de Proveedores 📊',
            description: 'La tabla principal muestra un listado de todos tus proveedores con información básica:\n\n• Nombre del proveedor y su identificación fiscal\n• Total Gastado: Suma de todas las compras realizadas\n• Documentos: Cantidad de facturas y comprobantes\n• Productos Únicos: Número de productos diferentes comprados\n\nPuedes ordenar por cualquier columna, filtrar resultados y buscar proveedores específicos por nombre.',
            side: 'over' as const,
          },
        },
        {
          element: 'body',
          popover: {
            title: 'Vista de Detalle del Proveedor 🔍',
            description: 'Al hacer clic en cualquier proveedor de la tabla, entras a su página de detalle donde encontrarás tres pestañas principales:\n\n• Resumen: Dashboard interactivo con gráficos de gastos mensuales, evolución de compras en el tiempo y métricas clave como total gastado, promedio mensual y última compra. Identifica patrones estacionales y temporadas altas.\n\n• Documentos: Acceso completo a todas las facturas y comprobantes del proveedor con filtros avanzados por fecha, tipo de documento y monto. Búsqueda rápida por número o concepto y descarga de PDFs originales.\n\n• Productos: Catálogo completo de todos los productos que has comprado a ese proveedor con historial de precios, cantidades totales, frecuencia de compra y última fecha de adquisición. Compara precios históricos entre diferentes períodos.',
            side: 'over' as const,
          },
        },
        {
          element: 'body',
          popover: {
            title: '¡Tutorial Completado! 🎉',
            description: 'Ahora conoces las funcionalidades principales de la sección Proveedores:\n\n✅ Tabla con listado y métricas básicas\n✅ Vista de detalle con tres pestañas: Resumen, Documentos y Productos\n✅ Analíticas completas por proveedor\n✅ Gestión de facturas y exploración de catálogos\n\n¡Selecciona empresas y empieza a gestionar tus proveedores de forma inteligente!',
            side: 'over' as const,
          },
        },
      ];

      console.log('📋 [ProveedoresTutorial] Steps cortos creados:', textSteps.length);

      const driverObj = driver({
        showProgress: true,
        steps: textSteps,
        nextBtnText: 'Siguiente →',
        prevBtnText: '← Anterior',
        doneBtnText: '¡Entendido!',
        allowClose: true,
        // overlayClickNext: false,
        disableActiveInteraction: false,
        showButtons: ['next', 'previous', 'close'],
        animate: true,
        overlayOpacity: 0.75,
        onHighlightStarted: (element, step, options) => {
          const currentStepIndex = options.state.activeIndex ?? 0;
          lastStepRef.current = currentStepIndex;
          console.log('💡 [ProveedoresTutorial] Paso:', currentStepIndex + 1, '/', textSteps.length);

          injectSkipButton(() => {
            markAsCompleted();
            removeSkipButton();
            driverInstanceRef.current?.destroy();
          });
        },
        onNextClick: (element, step, options) => {
          const currentIndex = options.state.activeIndex;
          console.log('➡️ [ProveedoresTutorial] Avanzando desde paso:', currentIndex);
          driverObj.moveNext();
        },
        onPrevClick: () => {
          console.log('⬅️ [ProveedoresTutorial] Retrocediendo');
          driverObj.movePrevious();
        },
        onCloseClick: () => {
          console.log('❌ [ProveedoresTutorial] onCloseClick');
          markAsCompleted();
          driverObj.destroy();
          removeSkipButton();
        },
        onDestroyStarted: async () => {
          const finalStep = lastStepRef.current;
          const totalSteps = textSteps.length - 1;

          console.log('🏁 [ProveedoresTutorial] === onDestroyStarted ===');
          console.log('📊 [ProveedoresTutorial] Paso final:', finalStep, '/ Total:', totalSteps);

          if (finalStep >= totalSteps) {
            console.log('✅ [ProveedoresTutorial] Tutorial completado, marcando...');
            await markAsCompleted();
          } else {
            console.log('⚠️ [ProveedoresTutorial] Tutorial cerrado prematuramente');
          }

          if (driverInstanceRef.current) {
            driverInstanceRef.current.destroy();
            driverInstanceRef.current = null;
          }
          removeSkipButton();
        },
      });

      driverInstanceRef.current = driverObj;
      console.log('✅ [ProveedoresTutorial] Driver corto creado y guardado');

      setTimeout(() => {
        console.log('▶️ [ProveedoresTutorial] Ejecutando drive() corto');
        driverObj.drive();
      }, 300);
    };

    // 🎬 FUNCIÓN: Tutorial COMPLETO (con empresas - 10 pasos)
    const startVisualTutorial = () => {
      console.log('🎬 [ProveedoresTutorial] === INICIANDO TUTORIAL COMPLETO (CON EMPRESAS) ===');

      const visualSteps: DriveStep[] = [
        {
          element: '[data-tutorial="proveedores-header"]',
          popover: {
            title: '¡Bienvenido a Proveedores! 🏢',
            description: 'Aquí puedes gestionar todos tus proveedores, analizar gastos, ver documentos y explorar productos. Te mostramos cómo funciona esta sección paso a paso.',
            side: 'bottom' as const,
            align: 'start' as const,
          },
        },
        {
          element: '[data-tutorial="proveedores-tabla"]',
          popover: {
            title: 'Tabla de Proveedores 📊',
            description: 'Esta tabla muestra el listado de todos tus proveedores con información resumida:\n\n• Nombre del proveedor y su CUIT o identificación fiscal\n• Total Gastado: Suma de todas las compras realizadas\n• Documentos: Cantidad de facturas y comprobantes\n• Productos Únicos: Número de productos diferentes comprados\n\nPuedes ordenar, filtrar y buscar proveedores fácilmente. Haz clic en cualquier fila para entrar a la vista de detalle del proveedor con analíticas completas.',
            side: 'top' as const,
            align: 'start' as const,
          },
        },
        {
          element: 'body',
          popover: {
            title: 'Vista de Detalle del Proveedor 🔍',
            description: 'Cuando tengas proveedores registrados, al hacer clic en uno de ellos entrarás a su página de detalle. Si aún no ves ninguno, no te preocupes, irán apareciendo a medida que proceses documentos. En esa vista encontrarás tres pestañas:\n\n• Resumen: Analíticas y gráficos completos de gastos y compras\n• Documentos: Todas las facturas y comprobantes con filtros avanzados\n• Productos: Catálogo completo con historial de precios',
            side: 'over' as const,
          },
        },
        {
          element: 'body',
          popover: {
            title: 'Pestaña Resumen - Analíticas 📈',
            description: 'En la pestaña Resumen (visible cuando selecciones un proveedor) visualizarías gráficos de gastos mensuales, frecuencia de pedidos y métricas clave. Esto te permitirá identificar patrones estacionales y optimizar costos cuando tengas historial.',
            side: 'over' as const,
          },
        },
        {
          element: 'body',
          popover: {
            title: 'Pestaña Documentos 📄',
            description: 'La pestaña Documentos almacenará todas las facturas y comprobantes ordenados cronológicamente. Podrás usar filtros avanzados y descargar PDFs originales. Si aún no hay datos, esta sección se llenará automáticamente al procesar tus facturas.',
            side: 'over' as const,
          },
        }, {
          element: 'body',
          popover: {
            title: 'Pestaña Productos 📦',
            description: 'Aquí explorarías el catálogo completo de productos comprados a ese proveedor. Podrás ver historiales de precios y frecuencias de compra para comparar periodos, una vez que el sistema haya procesado tu información.',
            side: 'over' as const,
          },
        },
        {
          element: 'body',
          popover: {
            title: 'Detalle Individual de Producto 🎯',
            description: 'Al acceder al detalle de un producto específico (disponible cuando tengas historial de compras), verás estadísticas completas como precio promedio y gráficos de evolución, además de alertas sobre variaciones de costos.',
            side: 'over' as const,
          },
        },
        {
          element: 'body',
          popover: {
            title: 'Pestañas de Análisis de Producto 📊',
            description: 'El detalle de cada producto ofrecerá cuatro pestañas de análisis: Resumen, Precios, Patrones y Detalles. Estas herramientas te ayudarán a entender tu consumo y detectar anomalías en cuanto tengas datos suficientes.',
            side: 'over' as const,
          },
        },
        {
          element: 'body',
          popover: {
            title: 'Alertas Inteligentes 🚨',
            description: 'Finalmente, el sistema está diseñado para detectar automáticamente anomalías como cambios bruscos de precio o cantidades inusuales. Estas alertas te avisarán proactivamente sobre problemas potenciales en tus futuras compras.',
            side: 'over' as const,
          },
        },
        {
          element: 'body',
          popover: {
            title: '¡Tutorial Completado! 🎉',
            description: 'Ahora conoces todas las funcionalidades de la sección Proveedores:\n\n✅ Tabla con listado y métricas básicas de proveedores\n✅ Vista de detalle con tres pestañas: Resumen, Documentos y Productos\n✅ Analíticas completas por proveedor\n✅ Exploración profunda de cada producto con alertas\n✅ Sistema de detección inteligente de anomalías\n\n¡Empieza a usar la plataforma para optimizar tus compras y tomar decisiones informadas!',
            side: 'over' as const,
          },
        },
      ];

      console.log('📋 [ProveedoresTutorial] Steps completos creados:', visualSteps.length);

      const driverObj = driver({
        showProgress: true,
        steps: visualSteps,
        nextBtnText: 'Siguiente →',
        prevBtnText: '← Anterior',
        doneBtnText: '¡Entendido!',
        allowClose: true,
        // overlayClickNext: false,
        disableActiveInteraction: false,
        showButtons: ['next', 'previous', 'close'],
        animate: true,
        overlayOpacity: 0.75,
        onHighlightStarted: (element, step, options) => {
          const currentStepIndex = options.state.activeIndex ?? 0;
          lastStepRef.current = currentStepIndex;
          console.log('💡 [ProveedoresTutorial] Paso:', currentStepIndex + 1, '/', visualSteps.length);

          injectSkipButton(() => {
            markAsCompleted();
            removeSkipButton();
            driverInstanceRef.current?.destroy();
          });
        },
        onNextClick: (element, step, options) => {
          const idx = options.state.activeIndex ?? 0;
          const totalStepsCount = driverObj.getConfig().steps?.length ?? 0;
          console.log('➡️ [ProveedoresTutorial] onNextClick - Paso:', idx, 'de', totalStepsCount);

          if (idx === totalStepsCount - 1) {
            console.log('🏁 [ProveedoresTutorial] Último paso alcanzado. Completando...');
            markAsCompleted();
            setTimeout(() => {
              console.log('🧨 [ProveedoresTutorial] Ejecutando destroy()');
              driverObj.destroy();
            }, 100);
          } else {
            driverObj.moveNext();
          }
        },

        onCloseClick: () => {
          console.log('❌ [ProveedoresTutorial] onCloseClick - Marcando como completado');
          markAsCompleted();
          driverObj.destroy();
          removeSkipButton();
        },

        onPrevClick: () => {
          console.log('⬅️ [ProveedoresTutorial] Retrocediendo');
          driverObj.movePrevious();
        },

        onDestroyStarted: () => {
          console.log('🏁 [ProveedoresTutorial] onDestroyStarted');
          removeSkipButton();
          // Limpieza de clases del body
          document.body.classList.forEach(cls => {
            if (cls.startsWith('tutorial-step-')) document.body.classList.remove(cls);
          });
        },
      });

      driverInstanceRef.current = driverObj;
      console.log('✅ [ProveedoresTutorial] Driver completo creado');

      setTimeout(() => {
        console.log('▶️ [ProveedoresTutorial] Ejecutando drive() completo');
        driverObj.drive();
      }, 300);
    };

    // Ejecutar según contexto
    if (!hasSelectedCompanies) {
      console.log('🚀 [ProveedoresTutorial] Sin empresas → Tutorial corto (4 pasos)');
      hasRunRef.current = true;
      startTextOnlyTutorial();

      return () => {
        console.log('🧹 [ProveedoresTutorial] Cleanup (corto)');
        if (driverInstanceRef.current) {
          driverInstanceRef.current.destroy();
          driverInstanceRef.current = null;
        }
      };
    }

    // Con empresas: buscar elementos para tutorial visual
    console.log('🔍 [ProveedoresTutorial] Con empresas → Buscando elementos...');

    let attempts = 0;
    const maxAttempts = 50;

    const checkForPage = () => {
      const header = document.querySelector('[data-tutorial="proveedores-header"]');
      const tabla = document.querySelector('[data-tutorial="proveedores-tabla"]');

      console.log(`🔎 [ProveedoresTutorial] Intento ${attempts}/${maxAttempts}:`, {
        header: !!header,
        tabla: !!tabla,
      });

      return !!(header && tabla);
    };

    const interval = setInterval(() => {
      attempts++;

      if (attempts >= maxAttempts) {
        console.warn('⚠️ [ProveedoresTutorial] TIMEOUT → Usando tutorial completo sin highlights');
        clearInterval(interval);
        hasRunRef.current = true;
        startVisualTutorial();
        return;
      }

      if (!checkForPage()) {
        return;
      }

      console.log('✅ [ProveedoresTutorial] Elementos encontrados!');
      clearInterval(interval);
      hasRunRef.current = true;
      startVisualTutorial();
    }, 100);

    return () => {
      console.log('🧹 [ProveedoresTutorial] Cleanup (visual con interval)');
      clearInterval(interval);
      if (driverInstanceRef.current) {
        driverInstanceRef.current.destroy();
        driverInstanceRef.current = null;
      }
    };

  }, [shouldShowTutorial, isLoading, markAsCompleted, selectedCompanyIds]); // ⬅️ FIX

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