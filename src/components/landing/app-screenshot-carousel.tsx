'use client';

import { useRef, useState } from 'react';
import { CalendarRange, LayoutDashboard, PlayCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

const PRODUCT_VIEWS = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    description: 'Indicadores, evolución y entidades en una misma vista.',
    image: '/landing/dashboard-real.png',
    alt: 'Dashboard de Muvail con indicadores financieros y distribución de documentos',
    icon: LayoutDashboard,
  },
  {
    id: 'trimestres',
    label: 'Trimestres',
    description: 'El cierre fiscal con sus importes y el consolidado del período.',
    image: '/landing/trimestres-real.png',
    alt: 'Gestión de trimestres de Muvail con resumen fiscal y consolidado',
    icon: CalendarRange,
  },
] as const;

export function AppScreenshotCarousel() {
  const [activeId, setActiveId] = useState<'tour' | (typeof PRODUCT_VIEWS)[number]['id']>('tour');
  const videoRef = useRef<HTMLVideoElement>(null);
  const active = PRODUCT_VIEWS.find((view) => view.id === activeId) ?? PRODUCT_VIEWS[0];
  const isTour = activeId === 'tour';
  const heading = isTour ? 'Demo guiada' : active.label;
  const description = isTour
    ? 'Dos facturas entran juntas. Una cuadra y sigue sola; la otra no, y Muvail la aparta antes del cierre.'
    : active.description;

  const selectView = (id: 'tour' | (typeof PRODUCT_VIEWS)[number]['id']) => {
    if (id !== 'tour') videoRef.current?.pause();
    setActiveId(id);
  };

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex h-10 items-center gap-2 border-b border-border/80 bg-muted/40 px-3 sm:px-4">
        <div className="flex gap-1.5" aria-hidden="true">
          <span className="h-2 w-2 rounded-full bg-[#d97471]" />
          <span className="h-2 w-2 rounded-full bg-[#dfba5c]" />
          <span className="h-2 w-2 rounded-full bg-[#61ae87]" />
        </div>
        <span className="ml-2 min-w-0 truncate text-[10px] font-medium text-muted-foreground">app.muvail.com</span>
        <span className="ml-auto hidden text-[10px] font-semibold text-primary sm:block">Producto en uso</span>
      </div>

      <div className="border-b border-border/70 bg-background px-4 py-3 sm:flex sm:items-center sm:justify-between sm:gap-6 sm:px-5">
        <div className="mb-3 min-w-0 sm:mb-0">
          <p className="text-sm font-semibold text-foreground">{heading}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
        <div className="flex shrink-0 gap-1.5" role="tablist" aria-label="Vistas del producto">
          <button
            type="button"
            role="tab"
            aria-selected={isTour}
            onClick={() => selectView('tour')}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-bold transition-colors',
              isTour ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <PlayCircle className="h-3.5 w-3.5" />
            Demo guiada
          </button>
          {PRODUCT_VIEWS.map((view) => {
            const Icon = view.icon;
            const isActive = activeId === view.id;

            return (
              <button
                key={view.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => selectView(view.id)}
                className={cn(
                  'inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-bold transition-colors',
                  isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {view.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="bg-[#051f1c] p-1.5 sm:p-2">
        {isTour ? (
          <div className="relative aspect-video overflow-hidden rounded-lg border border-white/5 bg-[#061f1c] animate-in fade-in duration-300">
            {/*
              Antes era un loop mudo de 18 s que hacía de portada animada. Este dura minuto
              y medio y lo que explica el producto lo explica la VOZ: en bucle y en silencio
              se perdería justo eso. Lo arranca el visitante, con sonido y con controles.
            */}
            <video
              ref={videoRef}
              className="absolute inset-0 block h-full w-full"
              controls
              playsInline
              preload="metadata"
              poster="/product-tour/muvail-tutorial.jpg"
              aria-label="Demo guiada de Muvail: dos facturas entran juntas, una cuadra y sigue sola, la otra queda retenida antes del cierre"
            >
              <source src="/product-tour/muvail-tutorial.mp4" type="video/mp4" />
              Tu navegador no puede reproducir este video.
            </video>
          </div>
        ) : (
          <img
            key={active.id}
            src={active.image}
            alt={active.alt}
            className="block aspect-video w-full rounded-lg border border-white/5 object-cover object-top animate-in fade-in duration-300"
            loading="lazy"
          />
        )}
      </div>
    </div>
  );
}
