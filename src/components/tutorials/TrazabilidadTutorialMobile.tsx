'use client';

import { useEffect, useRef } from 'react';
import { driver, type DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';
import { useTrazabilidadTutorial } from '@/context/TrazabilidadTutorialProvider';
import { injectSkipButton, removeSkipButton } from '@/lib/tutorial-utils';

const TUTORIAL_STYLE_ID = 'trazabilidad-tutorial-mobile-styles';

const TUTORIAL_STYLES = `
  /* Bloquear interacción con el fondo mientras el tutorial está activo */
  body.driver-active main,
  body.driver-active header {
    pointer-events: none !important;
  }

  .driver-overlay {
    pointer-events: auto !important;
    cursor: default !important;
  }

  .driver-overlay path {
    pointer-events: auto !important;
    cursor: default !important;
  }

  .driver-active-element,
  .driver-active-element * {
    pointer-events: none !important;
    cursor: default !important;
  }

  /* Popover interactivo */
  .driver-popover,
  .driver-popover-wrapper,
  .driver-popover *,
  .driver-popover button {
    pointer-events: auto !important;
    cursor: pointer !important;
  }

  #tutorial-skip-btn,
  #tutorial-skip-btn * {
    pointer-events: auto !important;
    cursor: pointer !important;
  }

  /* Highlight con glow esmeralda / primary unificado */
  .driver-active-element {
    outline: 3px solid hsl(var(--primary)) !important;
    box-shadow: 0 0 0 4px hsla(var(--primary) / 0.3), 0 0 25px hsla(var(--primary) / 0.2) !important;
    border-radius: 12px !important;
  }

  /* Tarjeta Popover Glassmorphism Dark Mobile */
  .driver-popover {
    background-color: rgba(15, 23, 42, 0.95) !important;
    backdrop-filter: blur(16px) !important;
    -webkit-backdrop-filter: blur(16px) !important;
    border: 1px solid hsla(var(--primary) / 0.45) !important;
    border-radius: 16px !important;
    color: #f8fafc !important;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.8), 0 0 25px hsla(var(--primary) / 0.15) !important;
    padding: 16px !important;
    max-width: 92vw !important;
    font-family: inherit !important;
  }

  .driver-popover-title {
    color: #ffffff !important;
    font-weight: 700 !important;
    font-size: 1rem !important;
    letter-spacing: -0.01em !important;
    margin-bottom: 6px !important;
    display: flex !important;
    align-items: center !important;
    gap: 6px !important;
  }

  .driver-popover-description {
    color: #cbd5e1 !important;
    font-weight: 400 !important;
    font-size: 0.82rem !important;
    line-height: 1.5 !important;
    white-space: pre-line !important;
  }

  .driver-popover-progress-text {
    color: #94a3b8 !important;
    font-size: 0.72rem !important;
    font-weight: 500 !important;
  }

  .driver-popover-footer {
    margin-top: 12px !important;
    display: flex !important;
    align-items: center !important;
    gap: 6px !important;
  }

  /* Botón Siguiente oficial Muvail primary */
  .driver-popover-next-btn {
    background-color: hsl(var(--primary)) !important;
    color: #ffffff !important;
    border: none !important;
    text-shadow: none !important;
    font-size: 11px !important;
    font-weight: 600 !important;
    padding: 6px 12px !important;
    border-radius: 8px !important;
    height: 30px !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    transition: all 0.2s ease !important;
    cursor: pointer !important;
  }

  .driver-popover-next-btn:hover {
    background-color: hsl(var(--primary) / 0.9) !important;
  }

  .driver-popover-prev-btn {
    background: rgba(255, 255, 255, 0.06) !important;
    color: #cbd5e1 !important;
    border: 1px solid rgba(255, 255, 255, 0.15) !important;
    text-shadow: none !important;
    font-size: 11px !important;
    font-weight: 500 !important;
    padding: 6px 10px !important;
    border-radius: 8px !important;
    height: 30px !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    transition: all 0.2s ease !important;
    cursor: pointer !important;
  }

  .driver-popover-close-btn {
    display: none !important;
  }

  /* Flechas del popover acordes al tema dark */
  .driver-popover-arrow-side-bottom {
    border-bottom-color: rgba(15, 23, 42, 0.95) !important;
  }
  .driver-popover-arrow-side-top {
    border-top-color: rgba(15, 23, 42, 0.95) !important;
  }
  .driver-popover-arrow-side-left {
    border-left-color: rgba(15, 23, 42, 0.95) !important;
  }
  .driver-popover-arrow-side-right {
    border-right-color: rgba(15, 23, 42, 0.95) !important;
  }
`;

// En mobile reducimos pasos: omitimos exportación por ser menos accesible en pantalla chica
const steps: DriveStep[] = [
  {
    element: '[data-tutorial="trazabilidad-header"]',
    popover: {
      title: 'Trazabilidad',
      description: 'Seguimiento de comprobantes: volumen total, procesados con éxito y fallidos.',
      side: 'bottom' as any,
      align: 'start' as any,
    },
  },
  {
    element: '[data-tutorial="trazabilidad-metrics"]',
    popover: {
      title: 'Métricas Clave',
      description: 'Resumen del período: total de comprobantes, procesados con éxito, en revisión, con errores, efectividad y tiempo promedio.',
      side: 'bottom' as any,
      align: 'center' as any,
    },
  },
  {
    element: '[data-tutorial="trazabilidad-period-tabs"]',
    popover: {
      title: 'Período',
      description: 'Alterna entre Día, Semana y Mes, o define un rango personalizado con el calendario.',
      side: 'bottom' as any,
      align: 'start' as any,
    },
  },
  {
    element: '[data-tutorial="trazabilidad-chart"]',
    popover: {
      title: 'Gráfico',
      description: 'Barras por período: verde (exitosos), amarillo (en Centro de Seguridad por incidencia) y rojo (fallidos). Toca una barra para filtrar ese período.',
      side: 'top' as any,
      align: 'center' as any,
    },
  },
  {
    element: '[data-tutorial="trazabilidad-nav"]',
    popover: {
      title: 'Navegación',
      description: 'Moverse entre períodos anteriores y posteriores, o volver con el botón "Hoy".',
      side: 'bottom' as any,
      align: 'center' as any,
    },
  },
  {
    element: '[data-tutorial="trazabilidad-status-filters"]',
    popover: {
      title: 'Estados',
      description: 'Filtra rápidamente los exitosos, en revisión o con fallos.',
      side: 'bottom' as any,
      align: 'start' as any,
    },
  },
  {
    element: '[data-tutorial="trazabilidad-batch-list"]',
    popover: {
      title: 'Lotes',
      description: 'Puedes desplegar el detalle de cualquier envío; los múltiples (como ZIPs) agrupan sus documentos.',
      side: 'top' as any,
      align: 'center' as any,
    },
  },
  {
    element: 'body',
    popover: {
      title: '¡Listo!',
      description: 'Puedes reiniciar este tutorial desde Configuración → Repetir Tutoriales.',
      side: 'bottom' as any,
      align: 'center' as any,
    },
  },
];

interface TrazabilidadTutorialMobileProps {
  isDataLoading?: boolean;
}

export function TrazabilidadTutorialMobile({ isDataLoading = false }: TrazabilidadTutorialMobileProps) {
  const { shouldShowTutorial, isLoading, markAsCompleted } = useTrazabilidadTutorial();
  const hasInitialized = useRef(false);
  const driverRef = useRef<ReturnType<typeof driver> | null>(null);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    if (!document.getElementById(TUTORIAL_STYLE_ID)) {
      const style = document.createElement('style');
      style.id = TUTORIAL_STYLE_ID;
      style.textContent = TUTORIAL_STYLES;
      document.head.appendChild(style);
    }

    return () => {
      document.getElementById(TUTORIAL_STYLE_ID)?.remove();
    };
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem('force_tutorial_trazabilidad') === 'true') {
      hasInitialized.current = false;
    }

    if (isLoading || isDataLoading || !shouldShowTutorial || hasInitialized.current) return;

    const timer = setTimeout(() => {
      hasInitialized.current = true;

      document.querySelectorAll('.driver-popover, .driver-overlay, .driver-stage, .driver-popover-wrapper, .driver-active-element').forEach(el => el.remove());
      if (driverRef.current) {
        try { driverRef.current.destroy(); } catch { /* ignore */ }
        driverRef.current = null;
      }

      const availableSteps = steps.filter(step => {
        if (typeof step.element === 'string' && step.element !== 'body') {
          return !!document.querySelector(step.element as string);
        }
        return true;
      });

      const driverObj = driver({
        showProgress: true,
        showButtons: ['next', 'previous', 'close'],
        animate: true,
        allowClose: true,
        overlayOpacity: 0.75,
        disableActiveInteraction: true,
        stagePadding: 6,
        stageRadius: 12,
        steps: availableSteps,
        nextBtnText: 'Siguiente',
        prevBtnText: 'Atrás',
        onHighlightStarted: () => {
          setTimeout(() => {
            if (driverObj.isActive()) {
              driverObj.refresh();
            }
            injectSkipButton(() => finishTutorial(driverObj, markAsCompleted));
          }, 60);
        },
        onNextClick: (_element, _step, options) => {
          const idx = options.index ?? options.state.activeIndex ?? 0;
          if (idx >= availableSteps.length - 1) {
            finishTutorial(driverObj, markAsCompleted);
          } else {
            driverObj.moveNext();
          }
        },
        onDoneClick: () => {
          finishTutorial(driverObj, markAsCompleted);
        },
        onPrevClick: () => {
          driverObj.movePrevious();
        },
        onCloseClick: () => {
          finishTutorial(driverObj, markAsCompleted);
        },
        onDestroyStarted: () => {
          removeSkipButton();
        },
      });

      driverRef.current = driverObj;
      driverObj.drive();

      // Recalcular posición si la ventana cambia de tamaño
      const handleResize = () => {
        if (driverRef.current?.isActive()) {
          driverRef.current.refresh();
        }
      };
      window.addEventListener('resize', handleResize);
    }, 400);

    return () => clearTimeout(timer);
  }, [isLoading, isDataLoading, shouldShowTutorial, markAsCompleted]);

  useEffect(() => {
    return () => {
      if (driverRef.current) {
        try { driverRef.current.destroy(); } catch { /* ignore */ }
        driverRef.current = null;
      }
    };
  }, []);

  return null;
}

function finishTutorial(
  driverObj: ReturnType<typeof driver>,
  markAsCompleted: () => Promise<void>
) {
  removeSkipButton();
  void markAsCompleted();
  setTimeout(() => {
    try { driverObj.destroy(); } catch { /* ignore */ }
  }, 100);
}
