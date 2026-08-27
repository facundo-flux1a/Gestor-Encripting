'use client';

import * as React from 'react';
import { useDemoMode } from '@/context/DemoModeContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Video, Database } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export function DemoModeToggle() {
  const { isDemoMode, toggleDemoMode } = useDemoMode();
  const { toast } = useToast();

  const handleToggle = () => {
    toggleDemoMode();
    const nextState = !isDemoMode;
    toast({
      title: nextState ? '🎬 Modo Presentación Activado' : '🔌 Modo Datos Reales Activado',
      description: nextState
        ? 'Mostrando datos de prueba coherentes y no sensibles para la grabación de video.'
        : 'Conectado a los datos reales de la base de datos.',
      className: nextState
        ? 'bg-gradient-to-r from-emerald-600 to-teal-700 text-white font-medium'
        : 'bg-gradient-to-r from-blue-600 to-indigo-700 text-white font-medium',
    });
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleToggle}
      className={`gap-2 h-9 px-3 font-semibold text-xs transition-all duration-300 shadow-sm border ${
        isDemoMode
          ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-500/60 shadow-emerald-500/10'
          : 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20'
      }`}
      title={isDemoMode ? 'Click para cambiar a datos reales' : 'Click para activar modo presentación con datos de prueba'}
    >
      {isDemoMode ? (
        <>
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <Video className="h-3.5 w-3.5 text-emerald-500" />
          <span className="hidden sm:inline">Modo Presentación</span>
          <Badge variant="secondary" className="bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-0 text-[10px] px-1.5 py-0 h-4">
            Demo
          </Badge>
        </>
      ) : (
        <>
          <Database className="h-3.5 w-3.5 text-amber-500" />
          <span className="hidden sm:inline">Modo Real</span>
        </>
      )}
    </Button>
  );
}
