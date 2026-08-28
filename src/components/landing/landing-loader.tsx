'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { MuvailLogo } from '@/components/brand/muvail-logo';


// Sólo se precargan los recursos que realmente aparecen en el primer recorrido.
const CRITICAL_IMAGES = [
    '/landing/dashboard-real.png',
    '/landing/trimestres-real.png',
];

interface LandingLoaderProps {
    onReady: () => void;
}

export function LandingLoader({ onReady }: LandingLoaderProps) {
    const [progress, setProgress] = useState(0);
    const [isVisible, setIsVisible] = useState(true);

    useEffect(() => {
        let imagesReady = false;
        let hasExited = false;

        // Es una entrada breve, no una pantalla de espera.
        const DURATION_MS = 500;
        const TICK_MS = 50;
        const steps = DURATION_MS / TICK_MS;
        let currentStep = 0;

        const progressTimer = setInterval(() => {
            currentStep++;
            const pct = Math.min(90, Math.round((currentStep / steps) * 90));
            setProgress(pct);

            if (currentStep >= steps) {
                clearInterval(progressTimer);
                // Si las imágenes ya están listas, salir
                if (imagesReady) triggerExit();
            }
        }, TICK_MS);

        // Nunca bloquea la landing si falla un recurso secundario.
        const fallbackTimer = setTimeout(() => triggerExit(), 1300);

        function onImageLoad() {
            imagesReady = true;
            // Las imágenes están listas — esperamos a que la animación complete naturalmente
        }

        function triggerExit() {
            if (hasExited) return;
            hasExited = true;
            clearInterval(progressTimer);
            clearTimeout(fallbackTimer);
            setProgress(100);
            setTimeout(() => {
                setIsVisible(false);
                setTimeout(onReady, 180);
            }, 120);
        }

        // Precargar todas las imágenes
        let loaded = 0;
        const total = CRITICAL_IMAGES.length;
        CRITICAL_IMAGES.forEach(src => {
            const img = new Image();
            img.src = src;
            img.onload = () => { loaded++; if (loaded >= total) onImageLoad(); };
            img.onerror = () => { loaded++; if (loaded >= total) onImageLoad(); };
        });

        return () => {
            clearInterval(progressTimer);
            clearTimeout(fallbackTimer);
        };
    }, [onReady]);

    return (
        <div
            className={cn(
                'fixed inset-0 z-[9999] flex flex-col items-center justify-center transition-opacity duration-300 ease-in-out',
                'bg-background',
                isVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
            )}
        >
            {/* Glow background */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/10 rounded-full blur-[120px]" />
                <div className="absolute top-1/4 right-1/4 h-80 w-80 rounded-full bg-[#b5de57]/10 blur-[100px]" />
            </div>

            <div className="relative z-10 flex flex-col items-center gap-8">
                <div className="flex flex-col items-center gap-3 animate-in fade-in duration-500">
                    <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-card shadow-xl shadow-primary/15 ring-1 ring-primary/15">
                        <MuvailLogo compact className="[&_img]:h-14 [&_img]:w-14" />
                    </div>
                    <div className="text-center">
                        <MuvailLogo wordmarkOnly className="justify-center" />
                        <p className="mt-2 text-sm text-muted-foreground">Documentos, períodos y pendientes</p>
                    </div>
                </div>

                {/* Progress bar */}
                <div className="w-64 space-y-2">
                    <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
                        <div
                            className="h-full rounded-full bg-gradient-to-r from-primary to-[#b5de57] transition-all duration-500 ease-out"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                    <p className="text-center text-xs text-muted-foreground tabular-nums">
                        {progress < 100 ? 'Cargando tu espacio...' : '¡Todo listo!'}
                    </p>
                </div>

                {/* Pulsing dots */}
                <div className="flex gap-2">
                    {[0, 1, 2].map((i) => (
                        <div
                            key={i}
                            className="h-1.5 w-1.5 rounded-full bg-primary/40"
                            style={{ animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite` }}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}
