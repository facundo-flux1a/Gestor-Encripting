'use client';

import { useEffect, useState, useRef } from 'react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { useCompanyContext } from '@/context/CompanyProvider';
import { useTutorial } from '@/context/tutorial-context';

/**
 * Mobile version of DocumentosTutorial.
 * Same behavior as PC but with Android-specific fixes:
 * - touchstart blocker on overlay
 * - No backdrop-filter
 * - touch-action: manipulation on buttons, min 44px touch targets
 * - Removed setInterval for modal detection (replaced with simpler check)
 */
export function DocumentosTutorialMobile() {
    const { setIsTutorialActive, setCurrentStep } = useTutorial();
    const [localShouldShow, setLocalShouldShow] = useState(false);
    const [driverInstance, setDriverInstance] = useState<any>(null);

    const [documentUploaded, setDocumentUploaded] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('tutorial_document_uploaded') === 'true';
        }
        return false;
    });

    const hasInitialized = useRef(false);
    const lastStepRef = useRef(0);
    const { selectedCompanyIds } = useCompanyContext();
    const selectedIdsRef = useRef<number[]>([]);
    const overlayTouchBlockerRef = useRef<((e: TouchEvent) => void) | null>(null);

    useEffect(() => {
        selectedIdsRef.current = selectedCompanyIds;
    }, [selectedCompanyIds]);

    useEffect(() => {
        const checkTutorial = async () => {
            try {
                const response = await fetch('/api/user/tutorial-documentos');
                if (response.ok) {
                    const data = await response.json();
                    if (data.tutorial) {
                        setLocalShouldShow(true);
                        setIsTutorialActive(true);
                        localStorage.removeItem('tutorial_document_uploaded');
                        setDocumentUploaded(false);
                    }
                }
            } catch (error) {
                console.error('Error checking tutorial:', error);
            }
        };
        checkTutorial();
    }, [setIsTutorialActive]);

    useEffect(() => {
        const handleDocumentUpload = () => {
            setDocumentUploaded(true);
            localStorage.setItem('tutorial_document_uploaded', 'true');
        };
        window.addEventListener('documentUploaded', handleDocumentUpload);
        return () => window.removeEventListener('documentUploaded', handleDocumentUpload);
    }, []);

    const addTouchBlocker = () => {
        const overlay = document.querySelector('.driver-overlay') as HTMLElement | null;
        if (!overlay || overlayTouchBlockerRef.current) return;
        const handler = (e: TouchEvent) => { e.preventDefault(); e.stopPropagation(); };
        overlay.addEventListener('touchstart', handler, { passive: false });
        overlayTouchBlockerRef.current = handler;
    };

    const removeTouchBlocker = () => {
        const overlay = document.querySelector('.driver-overlay') as HTMLElement | null;
        if (overlay && overlayTouchBlockerRef.current) {
            overlay.removeEventListener('touchstart', overlayTouchBlockerRef.current);
        }
        overlayTouchBlockerRef.current = null;
    };

    const showErrorMessage = (message: string) => {
        const popper = document.querySelector('.driver-popover-description');
        if (popper) {
            const existing = popper.querySelector('.tutorial-error-msg');
            if (existing) existing.remove();
            const errorMsg = document.createElement('p');
            errorMsg.className = 'tutorial-error-msg text-red-500 text-sm mt-3 font-semibold';
            errorMsg.textContent = message;
            popper.appendChild(errorMsg);
            setTimeout(() => errorMsg.remove(), 4000);
        }
    };

    useEffect(() => {
        if (!localShouldShow) return;

        const timer = setTimeout(() => {
            const finalSteps = [
                {
                    element: 'body',
                    popover: { title: '📄 ¡Bienvenido a Documentos!', description: 'Te guiaremos por las funciones principales de esta sección.', side: 'bottom', align: 'center' } as any
                },
                {
                    element: '[data-tutorial="company-selector"]',
                    popover: { title: '🏢 Paso 1: Selecciona una empresa', description: 'Selecciona al menos una empresa para continuar.', side: 'right', align: 'start' }
                },
                {
                    element: '[data-tutorial="upload-button"]',
                    popover: { title: '📤 Paso 2: Sube un documento', description: 'Ahora sube al menos un documento para continuar. Toca para seleccionar archivos. Los documentos con inconsistencias irán a Incidencias.', side: 'bottom', align: 'center' }
                },
                {
                    element: 'body',
                    popover: { title: '⚠️ ¿No ves tu documento?', description: 'Si el documento no aparece aquí, puede tener una incidencia. Encuéntralo en la sección de Incidencias del menú lateral.', side: 'bottom', align: 'center' }
                },
                {
                    element: '[data-tutorial="tabs-filters"]',
                    popover: { title: '🔍 Filtros y Categorías', description: 'Organiza tus documentos. Filtra entre facturas recibidas, emitidas, otros tipos, y documentos sin confirmar.', side: 'bottom', align: 'center' }
                },
                {
                    element: '[data-tutorial="export-pdf"]',
                    popover: { title: '📑 Exportar información', description: '¿Necesitas un reporte? Exporta la información de tus documentos filtrados directamente a PDF.', side: 'bottom', align: 'center' }
                },
                {
                    element: '[data-tutorial="documents-table"]',
                    popover: { title: '📋 Tabla de documentos', description: 'Aquí verás todos los documentos procesados. Ordénalos, búscalos y toca cualquier fila para ver detalles. ¡Exporta en Excel, CSV y más!', side: 'top', align: 'center' }
                },
                {
                    element: 'body',
                    popover: { title: '🔍 Detalle del Documento', description: 'Al tocar cualquier fila, verás el detalle del documento con todos los datos extraídos línea por línea.', side: 'bottom', align: 'center' }
                },
                {
                    element: 'body',
                    popover: { title: '✨ ¡Listo para empezar!', description: 'Ya conoces cómo gestionar tus documentos, facturas y abonos.', side: 'bottom', align: 'center' }
                }
            ].filter(step => {
                if (typeof step.element === 'string' && step.element !== 'body') {
                    return !!document.querySelector(step.element);
                }
                return true;
            });

            const driverObj = driver({
                showProgress: true,
                showButtons: ['next', 'previous'],
                allowClose: false,
                animate: true,
                overlayOpacity: 0.8,
                overlayColor: '#000000',
                disableActiveInteraction: false,
                steps: finalSteps,
                nextBtnText: 'Siguiente →',
                prevBtnText: '← Anterior',
                doneBtnText: '¡Entendido!',

                onHighlightStarted: (element, step, options) => {
                    const idx = options.state.activeIndex ?? 0;
                    lastStepRef.current = idx;
                    setCurrentStep(idx);
                    document.body.classList.forEach(cls => {
                        if (cls.startsWith('tutorial-step-')) document.body.classList.remove(cls);
                    });
                    document.body.classList.add(`tutorial-step-${idx}`);
                    setTimeout(() => addTouchBlocker(), 50);
                },

                onNextClick: (element, step, options) => {
                    const idx = options.state.activeIndex ?? 0;
                    const totalStepsCount = finalSteps.length;

                    if (idx === 1) {
                        if (selectedIdsRef.current.length > 0) setTimeout(() => driverObj.moveNext(), 100);
                        else showErrorMessage('⚠️ Por favor, selecciona al menos una empresa antes de continuar.');
                    } else if (idx === 2) {
                        const documentContainer = document.querySelector('[data-tutorial="documents-table"]');
                        const hasTableRows = !!documentContainer?.querySelector('tbody tr:not(.no-docs)');
                        const hasFolders = !!documentContainer?.querySelector('.space-y-3 button span.font-semibold');
                        const hasUploaded = documentUploaded || localStorage.getItem('tutorial_document_uploaded') === 'true';

                        if (hasTableRows || hasFolders || hasUploaded) {
                            localStorage.setItem('tutorial_document_uploaded', 'true');
                            driverObj.moveNext();
                        } else {
                            showErrorMessage('⚠️ Por favor, sube al menos un documento antes de continuar.');
                        }
                    } else if (idx === totalStepsCount - 1) {
                        fetch('/api/user/tutorial-documentos', { method: 'POST' })
                            .then(res => {
                                if (res.ok) {
                                    setLocalShouldShow(false);
                                    setIsTutorialActive(false);
                                    localStorage.removeItem('tutorial_document_uploaded');
                                }
                            })
                            .catch(console.error);
                        setTimeout(() => driverObj.destroy(), 100);
                    } else {
                        driverObj.moveNext();
                    }
                },

                onCloseClick: () => {
                    const idx = driverObj.getActiveIndex() ?? 0;
                    if (idx >= finalSteps.length - 2) {
                        fetch('/api/user/tutorial-documentos', { method: 'POST' }).catch(console.error);
                    }
                    driverObj.destroy();
                    setIsTutorialActive(false);
                },

                onDestroyStarted: () => {
                    setIsTutorialActive(false);
                    removeTouchBlocker();
                    document.body.classList.forEach(cls => {
                        if (cls.startsWith('tutorial-step-')) document.body.classList.remove(cls);
                    });
                },
            });

            setDriverInstance(driverObj);
            driverObj.drive(lastStepRef.current);

            return () => clearTimeout(timer);
        }, 400);
    }, [localShouldShow, setIsTutorialActive]);

    useEffect(() => {
        const style = document.createElement('style');
        style.id = 'documentos-tutorial-mobile-styles';
        style.textContent = `
      .driver-overlay { z-index: 9997 !important; pointer-events: auto !important; }

      .driver-active-element {
        z-index: 9999 !important; position: relative !important;
        opacity: 1 !important; transition: all 0.3s ease !important;
        outline: none !important;
      }

      /* FIX: Remove backdrop-filter on radix portals/dialogs */
      body[class*="tutorial-step-"] * {
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
      }

      .driver-stage {
        background-color: transparent !important; border-radius: 8px !important;
        box-shadow: none !important; z-index: 9998 !important;
      }

      [role="dialog"], [data-radix-portal], [data-radix-portal] > *, .fixed.inset-0.z-[100] {
        z-index: 2147483647 !important; pointer-events: auto !important; opacity: 1 !important;
      }

      body.tutorial-step-1 [data-sidebar="container"] { pointer-events: none !important; }
      body.tutorial-step-1 [data-tutorial="company-selector"] [role="checkbox"],
      body.tutorial-step-1 [data-tutorial="company-selector"] label {
        pointer-events: auto !important; touch-action: manipulation !important;
      }

      body.tutorial-step-2 [data-sidebar="container"] { pointer-events: none !important; }
      body.tutorial-step-2 [data-tutorial="upload-button"] {
        pointer-events: auto !important; touch-action: manipulation !important; z-index: 100 !important;
      }

      .driver-popover {
        border: 1px solid hsla(var(--primary) / 0.5) !important;
        background-color: rgba(15, 23, 42, 0.95) !important;
        border-radius: 12px !important; color: white !important;
        box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.3) !important;
        z-index: 10000 !important;
      }

      .driver-popover, .driver-popover-wrapper, .driver-popover *, .driver-popover button {
        touch-action: manipulation !important; -webkit-tap-highlight-color: transparent !important;
      }
      .driver-popover button { min-height: 44px !important; }

      .driver-popover-title { color: white !important; font-weight: 700 !important; font-size: 1.1rem !important; }
      .driver-popover-description { color: rgba(255,255,255,0.9) !important; line-height: 1.5 !important; }
      .driver-popover-progress-text { color: rgba(255,255,255,0.5) !important; }
      .driver-popover-next-btn {
        background-color: hsl(var(--primary)) !important; color: white !important;
        border: none !important; font-weight: 600 !important; border-radius: 6px !important;
        touch-action: manipulation !important;
      }
      .driver-popover-prev-btn {
        color: white !important; border: 1px solid rgba(255,255,255,0.2) !important;
        background: transparent !important; border-radius: 6px !important; touch-action: manipulation !important;
      }
      .driver-popover-close-btn {
        color: rgba(255,255,255,0.5) !important; touch-action: manipulation !important;
        min-height: 44px !important; min-width: 44px !important;
      }
    `;
        document.head.appendChild(style);
        return () => { const el = document.getElementById('documentos-tutorial-mobile-styles'); if (el) el.remove(); };
    }, []);

    return null;
}
