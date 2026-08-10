'use client';

import * as React from 'react';
import { Calendar, ChevronDown, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { QuarterBadge } from './quarter-badge';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import type { Trimestre } from '@/lib/types';
import { cn } from '@/lib/utils';

interface TrimestreSelectorProps {
  trimestres: Trimestre[];
  selectedAños: number[];
  selectedPeriodos: Set<string>; // Claves compuestas "2026-1", "2025-4", etc.
  onToggleAño: (año: number) => void;
  onTogglePeriodo: (año: number, trimestre: number) => void;
  onSelectAñoPreset?: (año: number, preset: 'todo' | 'semestre1' | 'semestre2' | 'limpiar') => void;
  mostrarVacios: boolean;
  onToggleMostrarVacios: (checked: boolean) => void;
}

export function TrimestreSelector({
  trimestres,
  selectedAños,
  selectedPeriodos,
  onToggleAño,
  onTogglePeriodo,
  onSelectAñoPreset,
  mostrarVacios,
  onToggleMostrarVacios,
}: TrimestreSelectorProps) {
  // Años disponibles en el sistema
  const añosDisponibles = React.useMemo(() => {
    const añosBase = [2030, 2029, 2028, 2027, 2026, 2025, 2024, 2023, 2022];
    const añosConDatos = Array.from(
      new Set(
        trimestres
          .map(t => t.año)
          .filter((año): año is number => año !== null && año !== undefined)
      )
    );
    const todos = new Set([...añosBase, ...añosConDatos]);
    return Array.from(todos).sort((a, b) => b - a);
  }, [trimestres]);

  // Años ordenados para mostrar sus filas
  const añosOrdenados = React.useMemo(() => {
    return [...selectedAños].sort((a, b) => b - a);
  }, [selectedAños]);

  // Texto para la etiqueta del desplegable de años
  const textoAños = React.useMemo(() => {
    if (selectedAños.length === 0) return 'Seleccionar año';
    if (selectedAños.length === 1) return selectedAños[0].toString();
    if (selectedAños.length === 2) return `${selectedAños[0]}, ${selectedAños[1]}`;
    return `${selectedAños.length} años seleccionados`;
  }, [selectedAños]);

  return (
    <div className="flex flex-col gap-3 sm:gap-4 p-3 sm:p-4 bg-card rounded-lg border shadow-sm">
      {/* 📱 CABECERA: Desplegable Multi-año de Checkboxes */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 border-b pb-3" data-tutorial="trimestres-years">
        <div className="flex items-center gap-2 min-w-0 w-full sm:w-auto">
          <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="w-full sm:w-[220px] justify-between h-9 text-xs sm:text-sm font-medium"
              >
                <span className="truncate">{textoAños}</span>
                <ChevronDown className="h-4 w-4 shrink-0 opacity-50 ml-2" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-2 z-[100]" align="start">
              <div className="text-xs font-semibold text-muted-foreground px-2 py-1.5 border-b mb-1">
                Años Contables
              </div>
              <ScrollArea className="h-56 pr-1">
                <div className="space-y-1">
                  {añosDisponibles.map(año => {
                    const isChecked = selectedAños.includes(año);
                    return (
                      <div
                        key={año}
                        onClick={() => onToggleAño(año)}
                        className={cn(
                          'flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-xs sm:text-sm cursor-pointer transition-colors',
                          isChecked ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-accent hover:text-accent-foreground'
                        )}
                      >
                        <Checkbox
                          checked={isChecked}
                          onCheckedChange={() => onToggleAño(año)}
                          className="pointer-events-none"
                        />
                        <span>{año}</span>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </PopoverContent>
          </Popover>

          {selectedPeriodos.size > 1 && (
            <span className="text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-1 rounded border border-amber-500/20 whitespace-nowrap">
              {selectedPeriodos.size} períodos seleccionados
            </span>
          )}
        </div>
      </div>

      {/* 📱 FILAS DE TRIMESTRES (Una fila por cada Año seleccionado) */}
      <div className="space-y-3 sm:space-y-4" data-tutorial="trimestres-periods">
        {añosOrdenados.map((año, yearIndex) => {
          // Filtrar trimestres del año
          const trimestresAño = trimestres
            .filter(t => t.año === año)
            .sort((a, b) => b.trimestre - a.trimestre);

          return (
            <div
              key={año}
              className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 p-2.5 sm:p-3 bg-accent/30 rounded-md border border-border/50"
            >
              {/* Etiqueta del Año + Presets del Año */}
              <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-between sm:justify-start">
                <span className="text-xs sm:text-sm font-semibold text-foreground tracking-tight">
                  Ejercicio {año}
                </span>

                {onSelectAñoPreset && (
                  <div
                    className="flex items-center gap-1"
                    data-tutorial={yearIndex === 0 ? 'trimestres-presets' : undefined}
                  >
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onSelectAñoPreset(año, 'todo')}
                      className="h-6 text-[11px] px-1.5 text-muted-foreground hover:text-foreground"
                    >
                      Año completo
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onSelectAñoPreset(año, 'semestre1')}
                      className="h-6 text-[11px] px-1.5 text-muted-foreground hover:text-foreground"
                    >
                      1º Semestre
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onSelectAñoPreset(año, 'semestre2')}
                      className="h-6 text-[11px] px-1.5 text-muted-foreground hover:text-foreground"
                    >
                      2º Semestre
                    </Button>
                  </div>
                )}
              </div>

              {/* Botones de Trimestres (T4, T3, T2, T1) */}
              <ScrollArea className="w-full sm:w-auto" data-tutorial={yearIndex === 0 ? 'trimestres-quarter-buttons' : undefined}>
                <div className="flex gap-2 pb-1 sm:pb-0 flex-nowrap">
                  {trimestresAño.map(t => {
                    const key = `${t.año}-${t.trimestre}`;
                    const isSelected = selectedPeriodos.has(key);

                    return (
                      <Button
                        key={key}
                        variant={isSelected ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => onTogglePeriodo(t.año, t.trimestre)}
                        className={cn(
                          'relative shrink-0 h-8 sm:h-9 text-xs sm:text-sm gap-1.5 transition-all duration-200 hover:scale-105',
                          isSelected && 'shadow-sm font-semibold ring-1 ring-primary/40'
                        )}
                      >
                        <span className="whitespace-nowrap">
                          T{t.trimestre} {t.año}
                        </span>
                        {t.cerrado && (
                          <QuarterBadge cerrado={t.cerrado_estado ?? t.cerrado} className="ml-1" />
                        )}
                      </Button>
                    );
                  })}
                </div>
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
            </div>
          );
        })}
      </div>

      {/* 📱 EMPTY STATE */}
      {selectedAños.length === 0 && (
        <div className="text-center py-6 text-xs sm:text-sm text-muted-foreground">
          Selecciona al menos un año en el desplegable para ver sus trimestres.
        </div>
      )}
    </div>
  );
}