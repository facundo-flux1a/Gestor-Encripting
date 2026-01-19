'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface CustomScrollbarProps {
  containerRef: React.RefObject<HTMLDivElement>;
  className?: string;
}

export function CustomScrollbar({ containerRef, className }: CustomScrollbarProps) {
  const [scrollLeft, setScrollLeft] = React.useState(0);
  const [scrollWidth, setScrollWidth] = React.useState(0);
  const [clientWidth, setClientWidth] = React.useState(0);
  const [isDragging, setIsDragging] = React.useState(false);
  const thumbRef = React.useRef<HTMLDivElement>(null);
  const trackRef = React.useRef<HTMLDivElement>(null);

  console.log('🎨 [CustomScrollbar] Renderizado');

  // Calcular dimensiones del scroll
  const updateScrollMetrics = React.useCallback(() => {
    if (!containerRef.current) {
      console.log('❌ [CustomScrollbar] containerRef.current es null');
      return;
    }
    
    const { scrollLeft, scrollWidth, clientWidth } = containerRef.current;
    console.log('📏 [CustomScrollbar] Métricas:', { scrollLeft, scrollWidth, clientWidth, hasScroll: scrollWidth > clientWidth });
    setScrollLeft(scrollLeft);
    setScrollWidth(scrollWidth);
    setClientWidth(clientWidth);
  }, [containerRef]);

  // Escuchar cambios en el scroll
  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      console.log('❌ [CustomScrollbar useEffect] No hay container');
      return;
    }

    console.log('✅ [CustomScrollbar useEffect] Container encontrado:', container);

    // 🆕 FORZAR ocultación del scrollbar nativo con JavaScript
    const style = document.createElement('style');
    style.textContent = `
      [data-hide-scrollbar="true"]::-webkit-scrollbar {
        display: none !important;
        width: 0 !important;
        height: 0 !important;
      }
    `;
    document.head.appendChild(style);

    const handleScroll = () => {
      updateScrollMetrics();
    };

    container.addEventListener('scroll', handleScroll);
    
    // Observer para cambios de tamaño
    const resizeObserver = new ResizeObserver(updateScrollMetrics);
    resizeObserver.observe(container);

    updateScrollMetrics();

    return () => {
      container.removeEventListener('scroll', handleScroll);
      resizeObserver.disconnect();
      document.head.removeChild(style);
    };
  }, [containerRef, updateScrollMetrics]);

  // Calcular si hay scroll
  const hasScroll = scrollWidth > clientWidth;
  const scrollPercentage = hasScroll ? (scrollLeft / (scrollWidth - clientWidth)) : 0;
  const thumbWidth = hasScroll ? (clientWidth / scrollWidth) * 100 : 100;
  const thumbLeft = scrollPercentage * (100 - thumbWidth);

  // Navegación con flechas
  const scrollAmount = 200; // píxeles por clic

  const handleScrollLeft = () => {
    if (!containerRef.current) return;
    containerRef.current.scrollBy({
      left: -scrollAmount,
      behavior: 'smooth'
    });
  };

  const handleScrollRight = () => {
    if (!containerRef.current) return;
    containerRef.current.scrollBy({
      left: scrollAmount,
      behavior: 'smooth'
    });
  };

  // Drag del thumb
  const handleThumbMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  React.useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!trackRef.current || !containerRef.current) return;

      const trackRect = trackRef.current.getBoundingClientRect();
      const trackWidth = trackRect.width;
      const mouseX = e.clientX - trackRect.left;
      const percentage = Math.max(0, Math.min(1, mouseX / trackWidth));
      
      const maxScroll = scrollWidth - clientWidth;
      containerRef.current.scrollLeft = percentage * maxScroll;
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, scrollWidth, clientWidth, containerRef]);

  // Click en el track
  const handleTrackClick = (e: React.MouseEvent) => {
    if (e.target === thumbRef.current) return;
    if (!trackRef.current || !containerRef.current) return;

    const trackRect = trackRef.current.getBoundingClientRect();
    const mouseX = e.clientX - trackRect.left;
    const percentage = mouseX / trackRect.width;
    
    const maxScroll = scrollWidth - clientWidth;
    containerRef.current.scrollTo({
      left: percentage * maxScroll,
      behavior: 'smooth'
    });
  };

  const canScrollLeft = scrollLeft > 0;
  const canScrollRight = scrollLeft < scrollWidth - clientWidth - 1;

  console.log('🔍 [CustomScrollbar] Estado final:', { 
    hasScroll, 
    canScrollLeft, 
    canScrollRight, 
    thumbWidth, 
    thumbLeft,
    scrollLeft,
    scrollWidth,
    clientWidth
  });

  return (
    <div className={cn(
      "flex items-center gap-2 py-2 px-1 transition-opacity duration-300",
      !hasScroll && "opacity-50", // Más tenue cuando no hay scroll
      className
    )}>
      {/* Flecha Izquierda */}
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          "h-7 w-7 rounded-md shrink-0 transition-all duration-200",
          canScrollLeft
            ? "hover:bg-accent text-foreground"
            : "text-muted-foreground/40 cursor-not-allowed"
        )}
        onClick={handleScrollLeft}
        disabled={!canScrollLeft}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      {/* Track del scrollbar */}
      <div
        ref={trackRef}
        className={cn(
          "relative flex-1 h-2 bg-muted/30 rounded-full transition-colors",
          hasScroll && "cursor-pointer group hover:bg-muted/50"
        )}
        onClick={hasScroll ? handleTrackClick : undefined}
      >
        {/* Thumb (la parte arrastrable) */}
        <div
          ref={thumbRef}
          className={cn(
            "absolute h-full bg-muted-foreground/60 rounded-full transition-all duration-150",
            hasScroll && "cursor-grab active:cursor-grabbing group-hover:bg-muted-foreground/80",
            isDragging && "bg-muted-foreground/90"
          )}
          style={{
            width: `${thumbWidth}%`,
            left: `${thumbLeft}%`
          }}
          onMouseDown={hasScroll ? handleThumbMouseDown : undefined}
        />
      </div>

      {/* Flecha Derecha */}
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          "h-7 w-7 rounded-md shrink-0 transition-all duration-200",
          canScrollRight
            ? "hover:bg-accent text-foreground"
            : "text-muted-foreground/40 cursor-not-allowed"
        )}
        onClick={handleScrollRight}
        disabled={!canScrollRight}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}