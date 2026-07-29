'use client';

import * as React from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useDataRefresh } from '@/context/DataRefreshProvider';
import { cn } from '@/lib/utils';

function textoUltimoRefresco(fecha: Date | null): string {
  if (!fecha) return 'Actualizar datos';

  const segundos = Math.floor((Date.now() - fecha.getTime()) / 1000);
  if (segundos < 10) return 'Actualizado recién';
  if (segundos < 60) return `Actualizado hace ${segundos} s`;

  const minutos = Math.floor(segundos / 60);
  if (minutos < 60) return `Actualizado hace ${minutos} min`;

  const horas = Math.floor(minutos / 60);
  return `Actualizado hace ${horas} h`;
}

export function RefreshButton() {
  const { refresh, isRefreshing, lastRefreshedAt } = useDataRefresh();

  // Recalcula el texto del tooltip mientras pasa el tiempo.
  const [, forzarRender] = React.useState(0);
  React.useEffect(() => {
    if (!lastRefreshedAt) return;
    const id = window.setInterval(() => forzarRender((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, [lastRefreshedAt]);

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => refresh('manual')}
            disabled={isRefreshing}
            aria-label="Actualizar datos"
          >
            <RefreshCw className={cn('h-[1.2rem] w-[1.2rem]', isRefreshing && 'animate-spin')} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{textoUltimoRefresco(lastRefreshedAt)}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
