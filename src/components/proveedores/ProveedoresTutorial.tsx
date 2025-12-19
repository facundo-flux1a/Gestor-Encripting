'use client';

import { useEffect, useRef } from 'react';
import { driver, type DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';
import { useProveedores } from '@/context/ProveedoresProvider';
import { useCompanyContext } from '@/context/CompanyProvider';

export function ProveedoresTutorial() {
  const { shouldShowTutorial, isLoading, markAsCompleted } = useProveedores();
  const { selectedCompanyIds } = useCompanyContext(); // ⬅️ FIX
  const hasRunRef = useRef(false);
  const driverInstanceRef = useRef<ReturnType<typeof driver> | null>(null);
  const lastStepRef = useRef<number>(0);

  useEffect(() => {
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
        allowClose: false,
        overlayClickNext: false,
        disableActiveInteraction: false,
        showButtons: ['next', 'previous'],
        animate: true,
        overlayOpacity: 0.75,
        onHighlightStarted: (element, step, options) => {
          const currentStepIndex = options.state.activeIndex ?? 0;
          lastStepRef.current = currentStepIndex;
          console.log('💡 [ProveedoresTutorial] Paso:', currentStepIndex + 1, '/', textSteps.length);
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
            description: 'Al hacer clic en un proveedor de la tabla, entras a su página de detalle con tres pestañas:\n\n• Resumen: Analíticas y gráficos completos de gastos y compras\n• Documentos: Todas las facturas y comprobantes con filtros avanzados\n• Productos: Catálogo completo con historial de precios\n\nEsta vista te permite profundizar en toda la información específica de ese proveedor.',
            side: 'over' as const,
          },
        },
        {
          element: 'body',
          popover: {
            title: 'Pestaña Resumen - Analíticas 📈',
            description: 'En la pestaña Resumen del proveedor seleccionado visualizas:\n\n• Gráfico de Gastos: Evolución mensual de tus compras a ese proveedor en el tiempo\n• Cantidad de Compras: Frecuencia de pedidos y comportamiento de compra\n• Métricas Clave: Total gastado acumulado, promedio mensual y fecha de última compra\n\nIdentifica patrones estacionales, temporadas altas de compra y optimiza costos.',
            side: 'over' as const,
          },
        },
        {
          element: 'body',
          popover: {
            title: 'Pestaña Documentos 📄',
            description: 'En la pestaña Documentos del proveedor tienes acceso completo a:\n\n• Todas las facturas y comprobantes de ese proveedor ordenados cronológicamente\n• Filtros avanzados por rango de fechas, tipo de documento y monto\n• Búsqueda rápida por número de documento o concepto\n• Descarga de archivos PDF originales de cada comprobante\n\nAudita transacciones y haz seguimiento detallado de cada operación fácilmente.',
            side: 'over' as const,
          },
        },{
          element: 'body',
          popover: {
            title: 'Pestaña Productos 📦',
            description: 'En la pestaña Productos del proveedor exploras su catálogo completo:\n\n• Lista completa de productos que has comprado a ese proveedor específico\n• Historial de precios de cada producto con evolución temporal\n• Cantidad total comprada acumulada y frecuencia de pedidos\n• Fecha de última compra de cada producto\n\nCompara precios históricos entre diferentes períodos y detecta variaciones importantes.',
            side: 'over' as const,
          },
        },
        {
          element: 'body',
          popover: {
            title: 'Detalle Individual de Producto 🎯',
            description: 'Al hacer clic en un producto específico desde la pestaña Productos, accedes a su análisis profundo:\n\n• Alertas Inteligentes: El sistema detecta automáticamente cambios bruscos de precio mayores al 20%, variaciones inusuales de cantidad comprada o patrones anómalos en la frecuencia\n• Estadísticas Completas: Precio promedio ponderado, última compra realizada, cantidad total acumulada y frecuencia de pedidos\n• Gráficos Históricos: Visualización de la evolución de precios y cantidades a lo largo del tiempo',
            side: 'over' as const,
          },
        },
        {
          element: 'body',
          popover: {
            title: 'Pestañas de Análisis de Producto 📊',
            description: 'Dentro del detalle de cada producto encontrarás cuatro pestañas de análisis:\n\n• Resumen: Métricas generales, estadísticas principales y gráficos de tendencia\n• Precios: Evolución histórica completa con detección automática de anomalías de precio\n• Patrones: Análisis de frecuencia de compra, detección de estacionalidad y tendencias de consumo\n• Detalles: Historial completo línea por línea con fecha exacta, cantidad comprada y precio unitario de cada transacción',
            side: 'over' as const,
          },
        },
        {
          element: 'body',
          popover: {
            title: 'Alertas Inteligentes 🚨',
            description: 'El sistema detecta automáticamente anomalías en tus compras de productos:\n\n• Cambios Bruscos de Precio: Variaciones superiores al 20% entre compras consecutivas del mismo producto\n• Cantidades Inusuales: Pedidos muy por encima o muy por debajo del promedio histórico\n• Patrones Anormales: Cambios significativos en la frecuencia habitual de pedidos\n\nEstas alertas te ayudan a identificar problemas potenciales, detectar errores de facturación y negociar mejores condiciones con tus proveedores.',
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
        allowClose: false,
        overlayClickNext: false,
        disableActiveInteraction: false,
        showButtons: ['next', 'previous'],
        animate: true,
        overlayOpacity: 0.75,
        onHighlightStarted: (element, step, options) => {
          const currentStepIndex = options.state.activeIndex ?? 0;
          lastStepRef.current = currentStepIndex;
          console.log('💡 [ProveedoresTutorial] Paso:', currentStepIndex + 1, '/', visualSteps.length);
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
        onDestroyStarted: async () => {
          const finalStep = lastStepRef.current;
          const totalSteps = visualSteps.length - 1;
          
          console.log('🏁 [ProveedoresTutorial] === onDestroyStarted VISUAL ===');
          console.log('📊 [ProveedoresTutorial] Paso final:', finalStep, '/ Total:', totalSteps);
          
          if (finalStep >= totalSteps) {
            console.log('✅ [ProveedoresTutorial] Tutorial completo terminado');
            await markAsCompleted();
          } else {
            console.log('⚠️ [ProveedoresTutorial] Tutorial cerrado prematuramente');
          }
          
          if (driverInstanceRef.current) {
            driverInstanceRef.current.destroy();
            driverInstanceRef.current = null;
          }
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