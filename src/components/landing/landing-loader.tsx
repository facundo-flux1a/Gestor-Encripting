'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';


// Lista de imágenes que deben cargarse antes de mostrar la landing
const CRITICAL_IMAGES = [
    '/api/images/gestor-documental/dashland.png',
    '/api/images/gestor-documental/triland.png',
    '/api/images/gestor-documental/docland.png',
    '/api/images/gestor-documental/prodland.png',
];

interface LandingLoaderProps {
    onReady: () => void;
}

export function LandingLoader({ onReady }: LandingLoaderProps) {
    const [progress, setProgress] = useState(0);
    const [isVisible, setIsVisible] = useState(true);

    useEffect(() => {
        let imagesReady = false;

        // Animación temporal: avanza de 0 a 90% en ~1 segundo
        const DURATION_MS = 1000;
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

        // Safety timeout total
        const fallbackTimer = setTimeout(() => triggerExit(), 5000);

        function onImageLoad() {
            imagesReady = true;
            // Las imágenes están listas — esperamos a que la animación complete naturalmente
        }

        function triggerExit() {
            clearInterval(progressTimer);
            clearTimeout(fallbackTimer);
            setProgress(100);
            setTimeout(() => {
                setIsVisible(false);
                setTimeout(onReady, 600);
            }, 400);
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
                'fixed inset-0 z-[9999] flex flex-col items-center justify-center transition-opacity duration-700 ease-in-out',
                'bg-background',
                isVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
            )}
        >
            {/* Glow background */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/10 rounded-full blur-[120px]" />
                <div className="absolute top-1/4 right-1/4 w-80 h-80 bg-violet-500/5 rounded-full blur-[100px]" />
            </div>

            <div className="relative z-10 flex flex-col items-center gap-8">
                {/* Logo / Brand */}
                <div className="flex flex-col items-center gap-3 animate-in fade-in duration-500">
                    <div className="h-20 w-20 rounded-2xl overflow-hidden bg-white dark:bg-zinc-800 flex items-center justify-center shadow-xl shadow-primary/20 p-1.5 ring-1 ring-primary/20">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src="/gm.png"
                            alt="Muvail Logo"
                            width={64}
                            height={64}
                            className="object-contain w-full h-full"
                            onLoad={() => console.log('✅ Logo gm.png CARGADO correctamente')}
                            onError={(e) => console.error('❌ Logo gm.png ERROR al cargar', e)}
                        />
                    </div>
                    <div className="text-center">
                        <h1 className="text-2xl font-bold tracking-tight">
                            <span className="text-foreground">Gestor Documental </span>
                            <span className="bg-gradient-to-r from-primary to-violet-500 bg-clip-text text-transparent">Muvail</span>
                        </h1>
                        <p className="text-xs text-muted-foreground mt-1 tracking-widest uppercase font-medium">La plataforma inteligente de gestión fiscal</p>
                    </div>
                </div>

                {/* Progress bar */}
                <div className="w-64 space-y-2">
                    <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-primary to-violet-500 rounded-full transition-all duration-500 ease-out"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                    <p className="text-center text-xs text-muted-foreground tabular-nums">
                        {progress < 100 ? 'Preparando tu experiencia...' : '¡Todo listo!'}
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
