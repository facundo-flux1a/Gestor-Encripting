'use client';

import { useEffect, useState, useRef } from 'react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { usePathname } from 'next/navigation';
import { useCompanyContext } from '@/context/CompanyProvider';
import { useTutorial } from '@/context/tutorial-context';
import { injectSkipButton, removeSkipButton } from '@/lib/tutorial-utils';

/**
 * Mobile version of DocumentosTutorial.
 * Same behavior as PC but with Android-specific fixes:
 * - touchstart blocker on overlay
 * - No backdrop-filter
 * - touch-action: manipulation on buttons, min 44px touch targets
 * - Removed setInterval for modal detection (replaced with simpler check)
 */
const MOBILE_UPLOAD_STEP_INDEX = 3;

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
    const driverRef = useRef<ReturnType<typeof driver> | null>(null);
    const { selectedCompanyIds } = useCompanyContext();
    const selectedIdsRef = useRef<number[]>([]);
    const overlayTouchBlockerRef = useRef<((e: TouchEvent) => void) | null>(null);

    useEffect(() => {
        selectedIdsRef.current = selectedCompanyIds;
    }, [selectedCompanyIds]);

    const pathname = usePathname();

    useEffect(() => {
        const checkTutorial = async () => {
            try {
                const response = await fetch('/api/user/tutorial-documentos');
                if (response.ok) {
                    const data = await response.json();
                    let showTutorial = Boolean(data.tutorial);

                    // ✅ FORCE REPLAY CHECK
                    if (typeof window !== 'undefined' && localStorage.getItem('force_tutorial_documentos') === 'true') {
                        console.log('🔄 [DocumentosTutorialMobile] Forzando tutorial por solicitud de usuario (Replay)');
                        showTutorial = true;
                    }

                    if (showTutorial) {
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
    }, [setIsTutorialActive, pathname]);

    useEffect(() => {
        const handleDocumentUpload = () => {
            setDocumentUploaded(true);
            localStorage.setItem('tutorial_document_uploaded', 'true');

            if (lastStepRef.current === MOBILE_UPLOAD_STEP_INDEX && driverRef.current) {
                setTimeout(() => {
                    try {
                        driverRef.current?.moveNext();
                    } catch {
                        /* driver puede haberse destruido */
                    }
                }, 600);
            }
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
            else if (idx === MOBILE_UPLOAD_STEP_INDEX && (
                target.closest('[data-tutorial="upload-button"]') ||
                target.closest('[data-tutorial="upload-modal"]')
            )) isStepWhitelisted = true;
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
                    popover: { title: 'Bienvenido a Documentos', description: 'Te guiaremos por todas las secciones de esta vista.', side: 'bottom', align: 'center' } as any
                },
                {
                    element: '[data-tutorial="company-selector"]',
                    popover: { title: 'Empresa (1/10)', description: 'Selecciona la empresa activa para cargar sus facturas y documentos.', side: 'bottom', align: 'start' }
                },
                {
                    element: '[data-sidebar="trigger"]',
                    popover: { title: 'Menú Lateral (2/10)', description: 'Navega rápidamente entre Dashboard, Centro de Seguridad y Trimestres.', side: 'bottom', align: 'start' }
                },
                {
                    element: '[data-tutorial="upload-button"]',
                    popover: { title: 'Subir (3/10)', description: 'Toca Subir, elige empresa y archivo en el asistente, y confirma. Al encolar el documento avanzaremos solos.', side: 'bottom', align: 'center' }
                },
                {
                    element: 'body',
                    popover: { title: 'Centro de Seguridad (4/10)', description: 'Si un documento tiene inconsistencias, se enviará al Centro de Seguridad.', side: 'bottom', align: 'center' }
                },
                {
                    element: '[data-tutorial="tabs-filters"]',
                    popover: { title: 'Categorías (5/10)', description: 'Filtra entre Facturas Recibidas, Emitidas, Otros y Sin Confirmar.', side: 'bottom', align: 'center' }
                },
                {
                    element: '[data-tutorial="clean-duplicates"]',
                    popover: { title: 'Duplicados (6/10)', description: 'Limpia y resuelve coincidencias de facturas duplicadas en un toque.', side: 'bottom', align: 'center' }
                },
                {
                    element: '[data-tutorial="export-pdf"]',
                    popover: { title: 'Exportar (7/10)', description: 'Genera y descarga reportes resumidos directamente en formato PDF.', side: 'bottom', align: 'center' }
                },
                {
                    element: '[data-tutorial="documents-table"]',
                    popover: { title: 'Tabla (8/10)', description: 'Revisa tus documentos procesados y desplázate horizontalmente para ver todos los importes.', side: 'top', align: 'center' }
                },
                {
                    element: 'body',
                    popover: { title: 'Detalle (9/10)', description: 'Toca cualquier fila para abrir la auditoría completa línea por línea del comprobante.', side: 'bottom', align: 'center' }
                },
                {
                    element: 'body',
                    popover: { title: 'Todo listo (10/10)', description: 'Ya conoces todas las secciones para gestionar tus documentos.', side: 'bottom', align: 'center' }
                }
            ];

            const completeDocumentosTutorial = async (targetDriver: ReturnType<typeof driver>) => {
                removeSkipButton();
                removeGlobalTouchBlocker();
                document.body.classList.remove('tutorial-active');
                document.body.classList.forEach(cls => {
                    if (cls.startsWith('tutorial-step-')) document.body.classList.remove(cls);
                });

                try {
                    const res = await fetch('/api/user/tutorial-documentos', { method: 'POST' });
                    if (!res.ok) throw new Error('No se pudo marcar el tutorial como completado');

                    localStorage.removeItem('force_tutorial_documentos');
                    localStorage.removeItem('tutorial_document_uploaded');
                    setLocalShouldShow(false);
                    setIsTutorialActive(false);
                    targetDriver.destroy();
                    console.log('✅ [DocumentosTutorialMobile] Tutorial completado, recargando página');
                    window.location.reload();
                } catch (error) {
                    console.error('❌ [DocumentosTutorialMobile] Error completando tutorial:', error);
                }
            };

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
                    if (idx === MOBILE_UPLOAD_STEP_INDEX) {
                        const sidebarContent = document.querySelector('[role="dialog"][data-state="open"]:not([data-tutorial="upload-modal"])');
                        const trigger = document.querySelector('[data-sidebar="trigger"]') as HTMLElement | null;
                        if (sidebarContent && trigger) {
                            trigger.click();
                        }
                    }

                    injectSkipButton(() => {
                        void completeDocumentosTutorial(driverObj);
                    });
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
                    } else if (idx === MOBILE_UPLOAD_STEP_INDEX) {
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
                        void completeDocumentosTutorial(driverObj);
                    } else {
                        driverObj.moveNext();
                    }
                },

                onCloseClick: () => {
                    console.log('❌ [DocumentosTutorialMobile] onCloseClick');
                    void completeDocumentosTutorial(driverObj);
                },

                onDestroyStarted: () => {
                    setIsTutorialActive(false);
                    removeSkipButton();
                    removeGlobalTouchBlocker();
                    document.body.classList.remove('tutorial-active', 'tutorial-upload-modal-open');
                    document.body.classList.forEach(cls => {
                        if (cls.startsWith('tutorial-step-')) document.body.classList.remove(cls);
                    });
                    driverRef.current = null;
                    const styleEl = document.getElementById('documentos-tutorial-mobile-styles');
                    if (styleEl) styleEl.remove();
                },
            });

            document.querySelectorAll('.driver-popover, .driver-overlay').forEach(el => el.remove());
            driverRef.current = driverObj;
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
        z-index: 2147483640 !important;
      }

      /* Modal de subida por encima del popover del tutorial */
      [data-radix-portal]:has([data-tutorial="upload-modal"]),
      [data-radix-portal]:has([data-tutorial="upload-modal"]) *,
      body.driver-active [data-tutorial="upload-modal"],
      body.driver-active [data-tutorial="upload-modal"] *,
      body.driver-active [data-radix-portal]:has([data-tutorial="upload-modal"]),
      body.driver-active [data-radix-portal]:has([data-tutorial="upload-modal"]) *,
      [data-tutorial="upload-modal"],
      [data-tutorial="upload-modal"] * {
        pointer-events: auto !important;
        z-index: 2147483647 !important;
      }

      [data-radix-popper-content-wrapper],
      [data-radix-popper-content-wrapper] * {
        pointer-events: auto !important;
        z-index: 2147483648 !important;
      }

      /* Atenuar overlay cuando el modal de subida está abierto */
      body:has([data-tutorial="upload-modal"]) .driver-overlay,
      body.tutorial-upload-modal-open .driver-overlay {
        opacity: 0.1 !important;
      }

      body:has([data-tutorial="upload-modal"]) .driver-popover {
        z-index: 2147483638 !important;
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
