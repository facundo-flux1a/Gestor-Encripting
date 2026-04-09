'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

const SCREENSHOTS = [
    {
        src: 'http://flux1a-minio-32adec-164-68-127-171.traefik.me:9000/gestor-documental/dashland.png',
        label: 'Dashboard',
        description: 'Analíticas financieras en tiempo real',
    },
    {
        src: 'http://flux1a-minio-32adec-164-68-127-171.traefik.me:9000/gestor-documental/triland.png',
        label: 'Trimestres',
        description: 'Cuadro de mando fiscal interactivo',
    },
    {
        src: 'http://flux1a-minio-32adec-164-68-127-171.traefik.me:9000/gestor-documental/docland.png',
        label: 'Documentos',
        description: 'Gestión completa de facturas y documentos',
    },
    {
        src: 'http://flux1a-minio-32adec-164-68-127-171.traefik.me:9000/gestor-documental/prodland.png',
        label: 'Productos',
        description: 'Tracking de líneas de producto por proveedor',
    },
];

export function AppScreenshotCarousel() {
    const [active, setActive] = useState(0);

    useEffect(() => {
        const timer = setInterval(() => {
            setActive((prev) => (prev + 1) % SCREENSHOTS.length);
        }, 4000);
        return () => clearInterval(timer);
    }, []);

    return (
        <div className="rounded-2xl border border-primary/20 bg-card/50 backdrop-blur-sm shadow-2xl overflow-hidden">
            {/* Browser chrome */}
            <div className="flex items-center gap-2 px-4 py-3 bg-muted/50 border-b border-border/50">
                <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-red-500/40 border border-red-500/60" />
                    <div className="w-3 h-3 rounded-full bg-amber-500/40 border border-amber-500/60" />
                    <div className="w-3 h-3 rounded-full bg-green-500/40 border border-green-500/60" />
                </div>
                {/* Tabs */}
                <div className="flex items-center gap-1 ml-4">
                    {SCREENSHOTS.map((s, i) => (
                        <button
                            key={i}
                            onClick={() => setActive(i)}
                            className={cn(
                                'px-3 py-1 rounded-md text-xs font-medium transition-all duration-200',
                                i === active
                                    ? 'bg-primary/20 text-primary border border-primary/30'
                                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                            )}
                        >
                            {s.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Screenshot */}
            <div className="relative aspect-[16/9] overflow-hidden bg-black/20">
                {SCREENSHOTS.map((s, i) => (
                    <img
                        key={i}
                        src={s.src}
                        alt={s.label}
                        className={cn(
                            'absolute inset-0 w-full h-full object-cover transition-opacity duration-700',
                            i === active ? 'opacity-100' : 'opacity-0'
                        )}
                    />
                ))}

                {/* Label overlay */}
                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent p-4">
                    <p className="text-white text-sm font-semibold">{SCREENSHOTS[active].description}</p>
                </div>
            </div>

            {/* Dot indicators */}
            <div className="flex items-center justify-center gap-2 py-3 bg-muted/30 border-t border-border/30">
                {SCREENSHOTS.map((_, i) => (
                    <button
                        key={i}
                        onClick={() => setActive(i)}
                        className={cn(
                            'rounded-full transition-all duration-300',
                            i === active ? 'w-6 h-2 bg-primary' : 'w-2 h-2 bg-muted-foreground/40 hover:bg-muted-foreground/70'
                        )}
                    />
                ))}
            </div>
        </div>
    );
}
