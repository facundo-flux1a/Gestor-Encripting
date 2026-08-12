'use client';

import { useEffect, useRef, useState } from 'react';
import { driver, type DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';
import { useDocsTutorial } from '@/context/DocsProvider';
import { injectSkipButton, removeSkipButton } from '@/lib/tutorial-utils';

const TUTORIAL_STYLE_ID = 'docs-tutorial-styles';

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

// ─── Graphical Tour (sin API Key) ──────────────────────────────────────────────
const graphicalSteps: DriveStep[] = [
  {
    element: '[data-tutorial="docs-header"]',
    popover: {
      title: 'Documentacion de la API v1',
      description: 'Bienvenido a la referencia tecnica. Esta API REST permite a tu ERP, BI tools como Tableau, o plataformas como n8n, acceder a tus datos fiscales en tiempo real.',
      side: 'bottom' as any,
      align: 'start' as any,
    },
  },
  {
    element: '[data-tutorial="docs-auth-section"]',
    popover: {
      title: 'Autenticacion Bearer',
      description: 'Toda peticion debe incluir el header <code>X-Api-Key: TU_CLAVE</code>. Sin el, el servidor retornara un <code>401 Unauthorized</code>. Las claves estan vinculadas a una empresa especifica.',
      side: 'bottom' as any,
      align: 'center' as any,
    },
  },
  {
    element: '[data-tutorial="docs-api-keys"]',
    popover: {
      title: 'Necesitas una API Key',
      description: 'Para usar el Playground interactivo necesitas una API Key. Podes crear una ahora mismo con el boton "Nueva Clave" que aparece aqui arriba.',
      side: 'bottom' as any,
      align: 'center' as any,
    },
  },
  {
    element: '[data-tutorial="docs-endpoints-list"]',
    popover: {
      title: 'Catalogo de Endpoints',
      description: 'La API ofrece endpoints para consultas avanzadas de documentos (<code>/documents/full</code>), analiticas financieras (<code>/analytics</code>), trimestres fiscales, incidencias, y exportacion a Excel.',
      side: 'top' as any,
      align: 'center' as any,
    },
  },
  {
    element: '[data-tutorial="docs-responses-section"]',
    popover: {
      title: 'Regla Critica: Impuestos',
      description: 'Atencion: el campo <code>impuestos[]</code> mezcla IVA (+), Recargo (+) y Retenciones (-). Nunca los sumes ciegos. La formula correcta es: <strong>Total = Base + IVA + Recargo - ABS(Retencion)</strong>.',
      side: 'top' as any,
      align: 'center' as any,
    },
  },
  {
    element: '[data-tutorial="docs-webhooks-info"]',
    popover: {
      title: 'Notificaciones Push (Webhooks)',
      description: 'En lugar de consultar la API cada N segundos, me gusta configurar webhooks para recibir notificaciones automaticas en tu sistema cuando ocurran eventos.',
      side: 'top' as any,
      align: 'center' as any,
    },
  },
  {
    element: 'body',
    popover: {
      title: 'Explora la API',
      description: 'Ya conoces la estructura de la API. Crea una API Key para acceder al Playground interactivo y probar peticiones reales en vivo contra tus datos.',
      side: 'bottom' as any,
      align: 'center' as any,
    },
  },
];

// ─── Interactive Tour (con API Key) ─────────────────────────────────────────
const interactiveSteps: DriveStep[] = [
  {
    element: '[data-tutorial="docs-header"]',
    popover: {
      title: 'Playground Interactivo',
      description: 'Bienvenido al Playground en vivo. Podes ejecutar peticiones reales contra tus datos directamente desde el navegador.',
      side: 'bottom' as any,
      align: 'start' as any,
    },
  },
  {
    element: '[data-tutorial="docs-api-keys"]',
    popover: {
      title: 'Selecciona tu API Key',
      description: 'Expandi "Ver mis claves existentes" y hace clic en la que queres usar. Tambien podes pegar una clave manualmente o generar una nueva.',
      side: 'bottom' as any,
      align: 'center' as any,
    },
  },
  {
    element: '[data-tutorial="docs-auth-section"]',
    popover: {
      title: 'Autenticacion Segura',
      description: 'Cuando usas el Playground con una clave seleccionada, el token viaja siempre server-side. Nunca se expone en el navegador.',
      side: 'bottom' as any,
      align: 'center' as any,
    },
  },
  {
    element: '[data-tutorial="docs-endpoints-list"]',
    popover: {
      title: 'Elegi un Endpoint',
      description: 'Cada endpoint tiene su propio panel de parametros y Playground. Empeza con <code>/documents/full</code> para ver el arbol completo de tus facturas.',
      side: 'top' as any,
      align: 'center' as any,
    },
  },
  {
    element: '[data-tutorial="docs-param-inputs"]',
    popover: {
      title: 'Parametros',
      description: 'Activa los parametros que necesitas con el checkbox de la izquierda. Podes filtrar por trimestre, año, empresa, estado de incidencias y mas.',
      side: 'top' as any,
      align: 'center' as any,
    },
  },
  {
    element: '[data-tutorial="docs-run-btn"]',
    popover: {
      title: 'Ejecutar Peticion',
      description: 'Hace clic en "Ejecutar Peticion" para lanzar la llamada real al endpoint. Veras el tiempo de respuesta y el codigo HTTP devuelto.',
      side: 'top' as any,
      align: 'start' as any,
    },
  },
  {
    element: '[data-tutorial="docs-json-response"]',
    popover: {
      title: 'Respuesta JSON en Vivo',
      description: 'Aqui se muestra la respuesta real con sintaxis coloreada. Podes inspeccionar el payload completo y usarlo como referencia.',
      side: 'top' as any,
      align: 'center' as any,
    },
  },
  {
    element: '[data-tutorial="docs-responses-section"]',
    popover: {
      title: 'Calculo de Impuestos — Regla Critica',
      description: '<strong>No sumes el array de impuestos sin discriminar el tipo.</strong> La formula es: <code>Total = Base + IVA + Recargo - ABS(Retencion)</code>.',
      side: 'top' as any,
      align: 'center' as any,
    },
  },
  {
    element: 'body',
    popover: {
      title: 'Listo para integrar',
      description: 'Dominas el Playground. Para notificaciones en tiempo real sin polling, me gusta configurar Webhooks desde el menu lateral.',
      side: 'bottom' as any,
      align: 'center' as any,
    },
  },
];

export function DocsTutorial() {
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

  // Show prompt dialog for users without API key
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
    // trigger the driver useEffect below
    setTimeout(() => {
      hasInitialized.current = false;
    }, 100);
  };

  useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem('force_tutorial_docs') === 'true') {
      hasInitialized.current = false;
    }

    // Don't run the driver while showing the prompt or in prompt mode
    if (isLoading || !shouldShowTutorial || hasInitialized.current || tourMode === 'prompt') return;

    const steps = tourMode === 'interactive' ? interactiveSteps : graphicalSteps;

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
    }, 800);

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

  // ─── API Key Prompt Dialog ────────────────────────────────────────────────
  if (showPrompt) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-md w-full p-6 border border-slate-200 dark:border-slate-700 animate-in fade-in zoom-in-95 duration-200">
          {/* Icon */}
          <div className="flex items-center justify-center w-14 h-14 rounded-full bg-amber-100 dark:bg-amber-900/30 mx-auto mb-4">
            <svg className="w-7 h-7 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
          </div>

          <h2 className="text-xl font-bold text-center text-slate-900 dark:text-white mb-2">
            No tenés una API Key aún
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 text-center mb-6 leading-relaxed">
            El Playground interactivo requiere una API Key para ejecutar peticiones en vivo. ¿Querés crear una ahora mismo?
          </p>

          <div className="grid gap-3">
            <button
              onClick={() => launchTour('interactive')}
              className="w-full flex items-center justify-center gap-2 bg-primary text-white rounded-xl px-4 py-3 text-sm font-semibold hover:bg-primary/90 transition-all duration-150 shadow-sm hover:shadow-md"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Sí, crear API Key y ver el tour técnico
            </button>

            <button
              onClick={() => launchTour('graphical')}
              className="w-full flex items-center justify-center gap-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl px-4 py-3 text-sm font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition-all duration-150"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              No, ver la guía explicativa primero
            </button>

            <button
              onClick={() => { setShowPrompt(false); markAsCompleted(); }}
              className="w-full text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors py-2"
            >
              Omitir tutorial
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
