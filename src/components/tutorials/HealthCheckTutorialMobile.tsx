'use client';

import { useEffect } from 'react';
import { driver, type DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';
import { useHealthCheckTutorial } from '@/context/HealthCheckProvider';

export function HealthCheckTutorialMobile() {
  const { shouldShowTutorial, isLoading, markAsCompleted } = useHealthCheckTutorial();

  useEffect(() => {
    if (isLoading || !shouldShowTutorial) return;

    const timer = setTimeout(() => {
      startTour();
    }, 1200);

    return () => clearTimeout(timer);
  }, [isLoading, shouldShowTutorial]);

  const startTour = () => {
    const steps: DriveStep[] = [
      {
        element: '[data-tutorial="health-header"]',
        popover: {
          title: '🏥 Salud Documental',
          description: 'Bienvenido al centro de diagnóstico. Aquí auditamos la integridad de tus documentos.',
          side: 'bottom',
          align: 'start',
        },
      },
      {
        element: '[data-tutorial="health-kpis"]',
        popover: {
          title: '📊 Indicadores',
          description: 'Score de Salud y control de descuadres en tiempo real.',
          side: 'bottom',
          align: 'center',
        },
      },
      {
        element: '[data-tutorial="health-table"]',
        popover: {
          title: '📋 Incidencias',
          description: 'Detalle de facturas con errores matemáticos o de datos.',
          side: 'top',
          align: 'center',
        },
      },
      {
        element: '[data-tutorial="health-ia"]',
        popover: {
          title: '✨ Diagnóstico IA',
          description: 'Usa Muvail AI para analizar y corregir errores automáticamente.',
          side: 'top',
          align: 'center',
        },
      },
      {
        element: '[data-tutorial="health-header"]',
        popover: {
          title: '🚀 ¡Listo!',
          description: 'Mantén tu salud documental al 100%.',
          side: 'bottom',
          align: 'center',
        },
      },
    ];

    const driverObj = driver({
      showProgress: true,
      animate: true,
      overlayOpacity: 0.75,
      disableActiveInteraction: true,
      steps,
      nextBtnText: 'Siguiente',
      prevBtnText: 'Atrás',
      doneBtnText: '¡Listo!',
      onNextClick: (element, step, options) => {
        if (options.state.activeIndex === steps.length - 1) {
          markAsCompleted();
          driverObj.destroy();
        } else {
          driverObj.moveNext();
        }
      },
      onCloseClick: () => {
        markAsCompleted();
        driverObj.destroy();
      },
      onDestroyStarted: () => {
        markAsCompleted();
      }
    });

    driverObj.drive();
  };

  // 🔥 ESTILOS CRÍTICOS MOBILE
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      .driver-overlay {
        pointer-events: none !important;
        z-index: 2147483630 !important;
      }
      
      #driver-page-overlay,
      #driver-highlighted-element-stage {
        pointer-events: none !important;
      }
      
      .driver-active-element {
        z-index: 2147483640 !important;
        pointer-events: none !important;
        outline: 4px solid hsl(var(--primary)) !important;
        box-shadow: 0 0 0 4px hsla(var(--primary) / 0.3) !important;
      }
      
      .driver-popover,
      .driver-popover-wrapper,
      .driver-popover *,
      .driver-popover button {
        pointer-events: auto !important;
        z-index: 2147483647 !important;
        touch-action: manipulation !important;
      }
      
      .driver-popover {
        border: 1px solid hsla(var(--primary) / 0.5) !important;
        background-color: rgba(15, 23, 42, 0.9) !important;
        backdrop-filter: blur(8px) !important;
        border-radius: 12px !important;
        color: white !important;
        box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.3) !important;
        max-width: 300px !important;
      }
      
      .driver-popover button {
        min-height: 44px !important;
      }
      
      .driver-popover-title {
        color: white !important;
        font-weight: 700 !important;
      }

      .driver-popover-description {
        color: rgba(255, 255, 255, 0.9) !important;
        line-height: 1.4 !important;
        font-size: 0.9rem !important;
      }
      
      .driver-popover-next-btn {
        background-color: hsl(var(--primary)) !important;
        color: white !important;
        border: none !important;
        border-radius: 6px !important;
      }
      
      .driver-popover-prev-btn {
        color: white !important;
        border: 1px solid rgba(255, 255, 255, 0.2) !important;
        background: transparent !important;
        border-radius: 6px !important;
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
