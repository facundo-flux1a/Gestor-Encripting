'use client';

import { useEffect, useRef } from 'react';
import { driver, type DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';
import { useSiiTutorial } from '@/context/SiiTutorialProvider';
import { injectSkipButton, removeSkipButton } from '@/lib/tutorial-utils';

const TUTORIAL_STYLE_ID = 'sii-tutorial-desktop-styles';

const TUTORIAL_STYLES = `
  /* Bloquear toda interacción con la página de fondo mientras el tutorial está activo */
  body.driver-active main,
  body.driver-active header,
  body.driver-active [data-tutorial="sii-tabs-bar"],
  body.driver-active [data-tutorial="sii-tabs-bar"] * {
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

  /* Highlight con glow violeta */
  .driver-active-element {
    outline: 3px solid #7c3aed !important;
    box-shadow: 0 0 0 4px rgba(124, 58, 237, 0.35), 0 0 20px rgba(124, 58, 237, 0.2) !important;
    border-radius: 8px !important;
  }

  /* Tarjeta Popover Glassmorphism Dark */
  .driver-popover {
    background-color: rgba(15, 23, 42, 0.95) !important;
    backdrop-filter: blur(16px) !important;
    border: 1px solid rgba(139, 92, 246, 0.45) !important;
    border-radius: 14px !important;
    color: #f8fafc !important;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 25px rgba(139, 92, 246, 0.15) !important;
    padding: 18px !important;
    max-width: 400px !important;
  }

  .driver-popover-title {
    color: #ffffff !important;
    font-weight: 700 !important;
    font-size: 1.05rem !important;
    letter-spacing: -0.01em !important;
    margin-bottom: 8px !important;
    display: flex !important;
    align-items: center !important;
    gap: 6px !important;
  }

  .driver-popover-description {
    color: #cbd5e1 !important;
    font-weight: 400 !important;
    font-size: 0.85rem !important;
    line-height: 1.55 !important;
    white-space: pre-line !important;
  }

  .driver-popover-progress-text {
    color: #94a3b8 !important;
    font-size: 0.75rem !important;
    font-weight: 500 !important;
  }

  .driver-popover-footer {
    margin-top: 14px !important;
    display: flex !important;
    align-items: center !important;
    gap: 8px !important;
  }

  /* Botón Siguiente oficial unificado con los otros tutoriales (#6600A3) */
  .driver-popover-next-btn {
    background-color: #6600A3 !important;
    color: #ffffff !important;
    border: none !important;
    text-shadow: none !important;
    font-size: 12px !important;
    font-weight: 600 !important;
    padding: 6px 14px !important;
    border-radius: 8px !important;
    height: 32px !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    transition: all 0.2s ease !important;
    cursor: pointer !important;
  }

  .driver-popover-next-btn:hover {
    background-color: #7c3aed !important;
    transform: translateY(-1px) !important;
  }

  .driver-popover-prev-btn {
    background: rgba(255, 255, 255, 0.06) !important;
    color: #cbd5e1 !important;
    border: 1px solid rgba(255, 255, 255, 0.15) !important;
    text-shadow: none !important;
    font-size: 12px !important;
    font-weight: 500 !important;
    padding: 6px 12px !important;
    border-radius: 8px !important;
    height: 32px !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    transition: all 0.2s ease !important;
    cursor: pointer !important;
  }

  .driver-popover-prev-btn:hover {
    background: rgba(255, 255, 255, 0.12) !important;
    color: #ffffff !important;
  }

  .driver-popover-close-btn {
    display: none !important;
  }
`;

interface SiiTutorialProps {
  isDataLoading?: boolean;
}

export function SiiTutorial({ isDataLoading = false }: SiiTutorialProps) {
  const { shouldShowTutorial, isLoading, markAsCompleted } = useSiiTutorial();
  const hasStartedRef = useRef(false);
  const driverRef = useRef<ReturnType<typeof driver> | null>(null);
  const markAsCompletedRef = useRef(markAsCompleted);

  useEffect(() => {
    markAsCompletedRef.current = markAsCompleted;
  }, [markAsCompleted]);

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
    return () => {
      removeSkipButton();
      if (driverRef.current) {
        try { driverRef.current.destroy(); } catch { /* ignore */ }
        driverRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem('force_tutorial_sii') === 'true') {
      hasStartedRef.current = false;
    }

    if (isLoading || isDataLoading || !shouldShowTutorial || hasStartedRef.current) {
      return;
    }

    const timer = setTimeout(() => {
      if (hasStartedRef.current) return;
      hasStartedRef.current = true;

      document.querySelectorAll('.driver-popover, .driver-overlay, .driver-stage, .driver-popover-wrapper, .driver-active-element').forEach(el => el.remove());
      if (driverRef.current) {
        try { driverRef.current.destroy(); } catch { /* ignore */ }
        driverRef.current = null;
      }

      const ensureTab = (tab: 'credenciales' | 'enviar' | 'emitidas' | 'recibidas' | 'llaa' | 'documentos_locales') => {
        const btn = document.querySelector(`[data-tutorial="sii-tab-${tab}"]`) as HTMLElement;
        if (btn) btn.click();
      };

      const getTabForSelector = (selector: string): 'credenciales' | 'enviar' | 'emitidas' | 'recibidas' | 'llaa' | 'documentos_locales' => {
        if (selector.includes('enviar')) return 'enviar';
        if (selector.includes('emitidas')) return 'emitidas';
        if (selector.includes('recibidas')) return 'recibidas';
        if (selector.includes('llaa')) return 'llaa';
        if (selector.includes('locales')) return 'documentos_locales';
        return 'credenciales';
      };

      const allPossibleSteps: DriveStep[] = [
        // ── PASO 1: Header ──
        {
          element: '[data-tutorial="sii-header"]',
          popover: {
            title: '🏛️ SII AEAT — Suministro Inmediato',
            description: 'Conexión directa con la Agencia Tributaria para registrar y consultar facturas en tiempo real según la normativa del SII.',
            side: 'bottom' as any,
            align: 'start' as any,
          },
        },
        // ── PASO 2: Estado del Certificado (Ping) ──
        {
          element: '[data-tutorial="sii-cert-pill"]',
          popover: {
            title: 'Estado de Conexión (Ping)',
            description: 'Comprueba el enlace con los servidores de la AEAT. Muestra si tu certificado digital (.p12/.pfx) está conectado y listo para operar.',
            side: 'bottom' as any,
            align: 'end' as any,
          },
        },
        // ── PASO 3: Tarjetas Resumen ──
        {
          element: '[data-tutorial="sii-stats-cards"]',
          popover: {
            title: 'Contadores y Estado General',
            description: 'Monitorea las facturas pendientes de remitir y las ya asentadas con éxito en los servidores de la Agencia Tributaria.',
            side: 'bottom' as any,
            align: 'center' as any,
          },
        },
        // ── PASO 4: Barra de Pestañas y Libros ──
        {
          element: '[data-tutorial="sii-tabs-bar"]',
          popover: {
            title: 'Libros de Registro y Operaciones',
            description: 'Navega entre Certificado Digital, Envío masivo a la AEAT, Documentos locales y consulta de facturas Emitidas o Recibidas.',
            side: 'bottom' as any,
            align: 'center' as any,
          },
        },
        // ── PASO 5: Pestaña Enviar Facturas ──
        {
          element: '[data-tutorial="sii-tab-enviar"]',
          popover: {
            title: 'Envío Masivo y Validación Previa',
            description: 'Carga facturas pendientes, revisa o edita NIFs y claves de régimen, y remítelas en lote a la AEAT con validación previa.',
            side: 'bottom' as any,
            align: 'center' as any,
          },
        },
        // ── PASO 6: Consulta y Bajas en AEAT ──
        {
          element: '[data-tutorial="sii-tab-emitidas"]',
          popover: {
            title: 'Consulta Oficial y Bajas',
            description: 'Consulta los libros registrados en la sede de la AEAT en tiempo real y gestiona anulaciones o bajas directas cuando sea necesario.',
            side: 'bottom' as any,
            align: 'center' as any,
          },
        },
        // ── PASO FINAL ──
        {
          element: 'body',
          popover: {
            title: '¡Recorrido SII Completo!',
            description: 'Ya conoces cómo conectar tu certificado y gestionar tus libros del SII. Puedes reiniciar este tutorial desde Configuración cuando quieras.',
          },
        },
      ];

      const validSteps = allPossibleSteps;

      const driverInstance = driver({
        showProgress: true,
        steps: validSteps,
        nextBtnText: 'Siguiente →',
        prevBtnText: '← Anterior',
        doneBtnText: '¡Entendido!',
        allowClose: false,
        showButtons: ['next', 'previous'],
        animate: true,
        overlayOpacity: 0.75,
        waitForElement: 2500,
        onHighlightStarted: (element, step, options) => {
          const currentStep = validSteps[options.state.activeIndex ?? 0];
          const selector = (currentStep?.element as string) || '';
          ensureTab(getTabForSelector(selector));

          injectSkipButton(() => {
            ensureTab('credenciales');
            markAsCompletedRef.current();
            removeSkipButton();
            driverRef.current?.destroy();
          });
        },
        onNextClick: (element, step, options) => {
          const idx = options.state.activeIndex ?? 0;
          const totalSteps = validSteps.length;
          if (idx === totalSteps - 1) {
            ensureTab('credenciales');
            markAsCompletedRef.current();
            removeSkipButton();
            driverInstance.destroy();
          } else {
            const nextStep = validSteps[idx + 1];
            const selector = (nextStep?.element as string) || '';
            ensureTab(getTabForSelector(selector));
            driverInstance.moveNext();
          }
        },
        onPrevClick: (element, step, options) => {
          const idx = options.state.activeIndex ?? 0;
          if (idx > 0) {
            const prevStep = validSteps[idx - 1];
            const selector = (prevStep?.element as string) || '';
            ensureTab(getTabForSelector(selector));
          }
          driverInstance.movePrevious();
        },
      });

      driverRef.current = driverInstance;
      driverInstance.drive();
    }, 250);

    return () => {
      clearTimeout(timer);
    };
  }, [shouldShowTutorial, isLoading, isDataLoading]);

  return null;
}
