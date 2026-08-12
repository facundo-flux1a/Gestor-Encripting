'use client';

import { useEffect, useRef, useState } from 'react';
import { driver, type DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';
import { useDocsTutorial } from '@/context/DocsProvider';
import { injectSkipButton, removeSkipButton } from '@/lib/tutorial-utils';

const TUTORIAL_STYLE_ID = 'docs-tutorial-mobile-styles';

const TUTORIAL_STYLES = `
  .driver-overlay {
    pointer-events: auto !important;
  }

  #driver-page-overlay,
  #driver-highlighted-element-stage,
  .driver-overlay svg {
    pointer-events: none !important;
  }

  .driver-active-element,
  .driver-active-element * {
    pointer-events: none !important;
    cursor: default !important;
  }

  .driver-popover,
  .driver-popover-wrapper,
  .driver-popover *,
  .driver-popover button {
    pointer-events: auto !important;
    cursor: pointer !important;
  }

  body:has(.driver-overlay) .driver-popover,
  body:has(.driver-overlay) .driver-popover * {
    pointer-events: auto !important;
  }

  .driver-active-element {
    box-shadow: 0 0 0 4px hsla(var(--primary) / 0.3) !important;
  }
`;

const graphicalMobileSteps: DriveStep[] = [
  {
    element: '[data-tutorial="docs-header"]',
    popover: {
      title: 'API Publica v1',
      description: 'Integracion REST para tu ERP, BI tools y automatizaciones como n8n o Make.',
      side: 'bottom' as any,
      align: 'start' as any,
    },
  },
  {
    element: '[data-tutorial="docs-auth-section"]',
    popover: {
      title: 'Autenticacion',
      description: 'Cada peticion lleva el header <code>X-Api-Key: TU_CLAVE</code>. Sin el, obtenes 401.',
      side: 'bottom' as any,
      align: 'center' as any,
    },
  },
  {
    element: '[data-tutorial="docs-api-keys"]',
    popover: {
      title: 'Crea una API Key',
      description: 'Usa el boton "Nueva Clave" para generar tu token. Lo necesitas para el Playground.',
      side: 'bottom' as any,
      align: 'center' as any,
    },
  },
  {
    element: '[data-tutorial="docs-endpoints-list"]',
    popover: {
      title: 'Endpoints',
      description: 'Documentos, analiticas, trimestres, incidencias y exportacion a Excel.',
      side: 'top' as any,
      align: 'center' as any,
    },
  },
  {
    element: '[data-tutorial="docs-responses-section"]',
    popover: {
      title: 'Impuestos',
      description: '<strong>Total = Base + IVA + Recargo - ABS(Retencion)</strong>. No sumes el array sin discriminar el tipo.',
      side: 'top' as any,
      align: 'center' as any,
    },
  },
  {
    element: 'body',
    popover: {
      title: 'Listo!',
      description: 'Crea una API Key para acceder al Playground y probar peticiones en vivo.',
      side: 'bottom' as any,
      align: 'center' as any,
    },
  },
];

const interactiveMobileSteps: DriveStep[] = [
  {
    element: '[data-tutorial="docs-header"]',
    popover: {
      title: 'Playground en Vivo',
      description: 'Ejecuta peticiones reales contra tus datos desde el navegador.',
      side: 'bottom' as any,
      align: 'start' as any,
    },
  },
  {
    element: '[data-tutorial="docs-api-keys"]',
    popover: {
      title: 'Selecciona tu Key',
      description: 'Expandi "Ver mis claves" y selecciona la que queres usar para el Playground.',
      side: 'bottom' as any,
      align: 'center' as any,
    },
  },
  {
    element: '[data-tutorial="docs-endpoints-list"]',
    popover: {
      title: 'Elegi un Endpoint',
      description: 'Empeza con <code>/documents/full</code> para explorar el arbol completo de tus facturas.',
      side: 'top' as any,
      align: 'center' as any,
    },
  },
  {
    element: '[data-tutorial="docs-param-inputs"]',
    popover: {
      title: 'Parametros',
      description: 'Activa filtros con el checkbox: trimestre, año, empresa, estado de incidencias.',
      side: 'top' as any,
      align: 'center' as any,
    },
  },
  {
    element: '[data-tutorial="docs-run-btn"]',
    popover: {
      title: 'Ejecutar',
      description: 'Lanza la peticion real. Veras el codigo HTTP y el tiempo de respuesta.',
      side: 'top' as any,
      align: 'center' as any,
    },
  },
  {
    element: '[data-tutorial="docs-json-response"]',
    popover: {
      title: 'Respuesta JSON',
      description: 'El payload real de la API, listo para usar como referencia en tu integracion.',
      side: 'top' as any,
      align: 'center' as any,
    },
  },
  {
    element: 'body',
    popover: {
      title: 'A integrar!',
      description: 'Ya dominas el Playground. Configura Webhooks para notificaciones automaticas.',
      side: 'bottom' as any,
      align: 'center' as any,
    },
  },
];

export function DocsTutorialMobile() {
  const { shouldShowTutorial, isLoading, markAsCompleted, tourMode, setTourMode, hasApiKey } = useDocsTutorial();
  const hasInitialized = useRef(false);
  const driverRef = useRef<ReturnType<typeof driver> | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);

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
    if (!isLoading && shouldShowTutorial && tourMode === 'prompt' && !hasApiKey) {
      const t = setTimeout(() => setShowPrompt(true), 600);
      return () => clearTimeout(t);
    }
  }, [isLoading, shouldShowTutorial, tourMode, hasApiKey]);

  const launchTour = (mode: 'graphical' | 'interactive') => {
    setShowPrompt(false);
    setTourMode(mode);
    hasInitialized.current = false;
    setTimeout(() => { hasInitialized.current = false; }, 100);
  };

  useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem('force_tutorial_docs') === 'true') {
      hasInitialized.current = false;
    }

    if (isLoading || !shouldShowTutorial || hasInitialized.current || tourMode === 'prompt') return;

    const steps = tourMode === 'interactive' ? interactiveMobileSteps : graphicalMobileSteps;

    const timer = setTimeout(() => {
      hasInitialized.current = true;

      document.querySelectorAll('.driver-popover, .driver-overlay, .driver-stage, .driver-popover-wrapper, .driver-active-element').forEach(el => el.remove());
      if (driverRef.current) {
        try { driverRef.current.destroy(); } catch { /* ignore */ }
        driverRef.current = null;
      }

      const driverObj = driver({
        showProgress: true,
        showButtons: ['next', 'previous', 'close'],
        animate: true,
        allowClose: true,
        overlayOpacity: 0.75,
        disableActiveInteraction: true,
        steps,
        nextBtnText: 'Siguiente',
        prevBtnText: 'Atrás',
        doneBtnText: '¡Listo!',
        onHighlightStarted: () => {
          setTimeout(() => {
            injectSkipButton(() => finishTutorial(driverObj, markAsCompleted));
          }, 50);
        },
        onNextClick: (_element, _step, options) => {
          const idx = options.index ?? options.state.activeIndex ?? 0;
          if (idx >= steps.length - 1) {
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
    }, 1000);

    return () => clearTimeout(timer);
  }, [isLoading, shouldShowTutorial, markAsCompleted, tourMode]);

  useEffect(() => {
    return () => {
      if (driverRef.current) {
        try { driverRef.current.destroy(); } catch { /* ignore */ }
        driverRef.current = null;
      }
    };
  }, []);

  if (showPrompt) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/60 backdrop-blur-sm px-4 pb-6">
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm p-5 border border-slate-200 dark:border-slate-700 animate-in slide-in-from-bottom-4 duration-300">
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/30 mx-auto mb-3">
            <svg className="w-6 h-6 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
          </div>

          <h2 className="text-lg font-bold text-center text-slate-900 dark:text-white mb-1">
            Sin API Key aún
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 text-center mb-4 leading-relaxed">
            ¿Querés crear una para el Playground interactivo?
          </p>

          <div className="flex flex-col gap-2">
            <button
              onClick={() => launchTour('interactive')}
              className="w-full flex items-center justify-center gap-2 bg-primary text-white rounded-xl px-4 py-3 text-sm font-semibold hover:bg-primary/90 transition-all duration-150"
            >
              Sí, crear API Key
            </button>

            <button
              onClick={() => launchTour('graphical')}
              className="w-full flex items-center justify-center gap-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl px-4 py-3 text-sm font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition-all duration-150"
            >
              No, ver la guía explicativa
            </button>

            <button
              onClick={() => { setShowPrompt(false); markAsCompleted(); }}
              className="w-full text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors py-2"
            >
              Omitir
            </button>
          </div>
        </div>
      </div>
    );
  }

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
