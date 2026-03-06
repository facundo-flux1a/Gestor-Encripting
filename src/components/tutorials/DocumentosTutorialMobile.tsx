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

    const blockedEvents = ['touchstart', 'touchmove', 'touchend', 'mousedown', 'mouseup', 'click', 'pointerdown', 'pointerup', 'pointercancel'];

    const logToTerminal = (msg: string) => {
        if (process.env.NODE_ENV === 'development') {
            fetch('/api/mobile-log', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: msg })
            }).catch(() => { });
        }
    };

    const addGlobalTouchBlocker = () => {
        if (overlayTouchBlockerRef.current) return;
        const handler = (e: Event) => {
            const target = e.target as HTMLElement;
            const idx = lastStepRef.current;

            // 1. Popover is ALWAYS allowed
            const isPopover = target.closest('.driver-popover') || target.closest('.driver-popover-wrapper');

            if (isPopover) {
                if (e.type === 'touchstart' || e.type === 'click') logToTerminal(`✅ PERMITIDO [Paso ${idx}]: Click en Popover (${target.tagName} - ${target.className})`);
                return;
            }

            // 2. Upload Modal and its internal portals (Radix) are allowed ONLY when the modal is open
            // This prevents the Sidebar (which is also a portal/dialog) from being fully clickable
            const isUploadModalOpen = !!document.body.querySelector('[data-tutorial="upload-modal"]');

            if (target.closest('[data-tutorial="upload-modal"]') ||
                (isUploadModalOpen && (target.closest('[data-radix-portal]') || target.closest('[data-radix-popper-content-wrapper]')))) {
                if (e.type === 'touchstart' || e.type === 'click') logToTerminal(`✅ PERMITIDO [Paso ${idx}]: Elemento dentro de Upload Modal/Portal (${target.tagName})`);
                return;
            }

            // 3. Step-Specific Surgical Whitelists: Block everything else
            let isStepWhitelisted = false;
            if (idx === 1 && target.closest('[data-tutorial="company-selector"]')) isStepWhitelisted = true;
            else if (idx === 2 && target.closest('[data-sidebar="trigger"]')) isStepWhitelisted = true;
            else if (idx === 3 && target.closest('[data-tutorial="upload-button"]')) isStepWhitelisted = true;
            else if (idx === 5 && target.closest('[data-tutorial="tabs-filters"]')) isStepWhitelisted = true;

            if (!isStepWhitelisted) {
                if (e.type === 'touchstart' || e.type === 'click') logToTerminal(`🛑 BLOQUEADO [Paso ${idx}]: ${target.tagName} (${target.className})`);
                if (e.cancelable) e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
            } else {
                if (e.type === 'touchstart' || e.type === 'click') logToTerminal(`✅ PERMITIDO [Paso ${idx}]: Pasó por Whitelist Específica (${target.tagName})`);
            }
        };
        // Use capture: true to intercept before other handlers
        blockedEvents.forEach(evt => {
            document.addEventListener(evt, handler, { passive: false, capture: true });
        });
        overlayTouchBlockerRef.current = handler as any;
    };

    const removeGlobalTouchBlocker = () => {
        if (overlayTouchBlockerRef.current) {
            blockedEvents.forEach(evt => {
                document.removeEventListener(evt, overlayTouchBlockerRef.current as any, { capture: true });
            });
        }
        overlayTouchBlockerRef.current = null;
    };

    const addTouchBlocker = () => { };
    const removeTouchBlocker = () => { };

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
                    popover: { title: '📄 ¡Bienvenido! (1/10)', description: 'Te guiaremos por las funciones principales de esta sección.', side: 'bottom', align: 'center' } as any
                },
                {
                    element: '[data-tutorial="company-selector"]',
                    popover: { title: '🏢 Empresa (2/10)', description: 'Selecciona al menos una empresa para continuar.', side: 'bottom', align: 'start' }
                },
                {
                    element: '[data-sidebar="trigger"]',
                    popover: { title: '📱 Menú (3/10)', description: 'Utiliza el menú lateral para navegar entre las distintas secciones.', side: 'bottom', align: 'start' }
                },
                {
                    element: '[data-tutorial="upload-button"]',
                    popover: { title: '📤 Subir (4/10)', description: 'Toca aquí para seleccionar archivos. Los documentos con inconsistencias irán a Incidencias.', side: 'bottom', align: 'center' }
                },
                {
                    element: 'body',
                    popover: { title: '⚠️ ¿No ves tu documento? (5/10)', description: 'Si el documento no aparece aquí, puede tener una incidencia. Encuéntralo en la sección de Incidencias.', side: 'bottom', align: 'center' }
                },
                {
                    element: '[data-tutorial="tabs-filters"]',
                    popover: { title: '🔍 Filtros (6/10)', description: 'Organiza tus documentos. Filtra entre facturas recibidas, emitidas y otros tipos.', side: 'bottom', align: 'center' }
                },
                {
                    element: '[data-tutorial="export-pdf"]',
                    popover: { title: '📑 Exportar (7/10)', description: '¿Necesitas un reporte? Exporta la información directamente a PDF.', side: 'bottom', align: 'center' }
                },
                {
                    element: '[data-tutorial="documents-table"]',
                    popover: { title: '📋 Tabla (8/10)', description: 'Aquí verás todos los documentos procesados. Toca cualquier fila para ver detalles.', side: 'top', align: 'center' }
                },
                {
                    element: '[data-tutorial="documents-table"]',
                    popover: { title: '🔍 Detalle (9/10)', description: 'Al tocar una fila, verás el detalle del documento con todos los datos extraídos.', side: 'bottom', align: 'center' }
                },
                {
                    element: 'body',
                    popover: { title: '✨ ¡Listo! (10/10)', description: 'Ya conoces cómo gestionar tus documentos en mobile.', side: 'bottom', align: 'center' }
                }
            ];

            const driverObj = driver({
                showProgress: true,
                showButtons: ['next', 'previous'],
                allowClose: false,
                animate: true,
                overlayOpacity: 0.75,
                overlayColor: '#000000',
                stagePadding: 4,
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
                    document.body.classList.add(`tutorial-step-${idx}`, 'tutorial-active');

                    addGlobalTouchBlocker();

                    // Cerrar sidebar si llegamos al paso del botón de subida y sigue abierta
                    if (idx === 3) {
                        const sidebarContent = document.querySelector('[role="dialog"][data-state="open"]');
                        const trigger = document.querySelector('[data-sidebar="trigger"]') as HTMLElement | null;
                        if (sidebarContent && trigger) {
                            trigger.click();
                        }
                    }
                },

                onNextClick: (element, step, options) => {
                    const idx = options.state.activeIndex ?? 0;
                    const totalStepsCount = finalSteps.length;

                    if (idx === 1) {
                        if (selectedIdsRef.current.length > 0) setTimeout(() => driverObj.moveNext(), 100);
                        else showErrorMessage('⚠️ Por favor, selecciona al menos una empresa antes de continuar.');
                    } else if (idx === 2) {
                        const sidebarContent = document.querySelector('[role="dialog"][data-state="open"]');
                        const trigger = document.querySelector('[data-sidebar="trigger"]') as HTMLElement | null;
                        if (sidebarContent && trigger) {
                            trigger.click();
                            setTimeout(() => driverObj.moveNext(), 300);
                        } else {
                            driverObj.moveNext();
                        }
                    } else if (idx === 3) {
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
                        // Clean up blocker before destroying driver
                        removeGlobalTouchBlocker();
                        setTimeout(() => driverObj.destroy(), 100);
                    } else {
                        driverObj.moveNext();
                    }
                },

                onCloseClick: () => {
                    // Ensure all blockers and classes are cleaned up if user closes tutorial manually
                    removeGlobalTouchBlocker();
                    document.body.classList.remove('tutorial-active');
                    document.body.classList.forEach(cls => {
                        if (cls.startsWith('tutorial-step-')) document.body.classList.remove(cls);
                    });
                    const idx = driverObj.getActiveIndex() ?? 0;
                    if (idx >= finalSteps.length - 2) {
                        fetch('/api/user/tutorial-documentos', { method: 'POST' }).catch(console.error);
                    }
                    driverObj.destroy();
                    setIsTutorialActive(false);
                },

                onDestroyStarted: () => {
                    setIsTutorialActive(false);
                    removeGlobalTouchBlocker();
                    document.body.classList.remove('tutorial-active');
                    document.body.classList.forEach(cls => {
                        if (cls.startsWith('tutorial-step-')) document.body.classList.remove(cls);
                    });
                    // Remove injected style element to clean up CSS overrides
                    const styleEl = document.getElementById('documentos-tutorial-mobile-styles');
                    if (styleEl) styleEl.remove();
                },
            });

            setDriverInstance(driverObj);
            addGlobalTouchBlocker();
            driverObj.drive(lastStepRef.current);

            return () => clearTimeout(timer);
        }, 400);
    }, [localShouldShow, setIsTutorialActive]);

    useEffect(() => {
        const style = document.createElement('style');
        style.id = 'documentos-tutorial-mobile-styles';
        style.textContent = `
      /* Native Driver.js SVG Overlay - Elevate z-index but DO NOT override pointer-events */
      .driver-overlay { 
        z-index: 2147483630 !important; 
        transition: opacity 0.3s ease !important;
      }

      /* Visual & Functional Priority for Tutorial Popover */
      .driver-popover, .driver-popover-wrapper, .driver-popover * {
        pointer-events: auto !important; 
        z-index: 2147483647 !important;
      }

      /* Modal Exceptions: Ensure Modals and Portals render above the blocking logic */
      [data-tutorial="upload-modal"],
      [data-tutorial="upload-modal"] *,
      [data-radix-portal], 
      [data-radix-portal] *,
      [role="dialog"]:not(.driver-popover),
      [role="dialog"] *,
      [data-radix-popper-content-wrapper],
      [data-radix-popper-content-wrapper] * {
        pointer-events: auto !important;
        z-index: 2147483645 !important;
      }

      /* Safety Valve for Modals: Soften overlay visually when the Upload Modal is active */
      body:has([data-tutorial="upload-modal"]) .driver-overlay {
        opacity: 0.1 !important;
      }

      /* Highlighted active element */
      .driver-active-element { 
        z-index: 2147483640 !important; 
        border: 2px solid white !important;
        pointer-events: auto !important;
      }

      /* FIX: Remove backdrop-filter only during tutorial */
      body.tutorial-active * {
        backdrop-filter: none !important; -webkit-backdrop-filter: none !important;
      }

      /* Highlight visibility for the upload button in Step 4 (Index 3) */
      body.tutorial-step-3 [data-tutorial="upload-button"] {
        outline: 4px solid hsl(var(--primary)) !important;
        outline-offset: 4px !important;
        z-index: 2147483642 !important;
      }
      .driver-popover {
        border: 1px solid hsla(var(--primary) / 0.5) !important;
        background-color: rgba(15, 23, 42, 0.95) !important;
        border-radius: 12px !important; color: white !important;
        box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.3) !important;
      }
      
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
