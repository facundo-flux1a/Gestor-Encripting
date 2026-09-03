'use client';

import * as React from 'react';
import { Calendar, ChevronDown, Check, X, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { QuarterBadge } from './quarter-badge';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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

  // Auxiliar para determinar el valor activo en el Select móvil de cada año
  const getMobileSelectValue = (año: number) => {
    const has1 = selectedPeriodos.has(`${año}-1`);
    const has2 = selectedPeriodos.has(`${año}-2`);
    const has3 = selectedPeriodos.has(`${año}-3`);
    const has4 = selectedPeriodos.has(`${año}-4`);

    if (has1 && has2 && has3 && has4) return 'todo';
    if (has1 && has2 && !has3 && !has4) return 'semestre1';
    if (has3 && has4 && !has1 && !has2) return 'semestre2';
    if (has4 && !has1 && !has2 && !has3) return 't4';
    if (has3 && !has1 && !has2 && !has4) return 't3';
    if (has2 && !has1 && !has3 && !has4) return 't2';
    if (has1 && !has2 && !has3 && !has4) return 't1';

    if (has4) return 't4';
    if (has3) return 't3';
    if (has2) return 't2';
    if (has1) return 't1';
    return 't1';
  };

  const handleMobileSelectChange = (año: number, val: string) => {
    if (val === 'todo' || val === 'semestre1' || val === 'semestre2') {
      onSelectAñoPreset?.(año, val);
    } else if (val.startsWith('t')) {
      const qNum = parseInt(val.replace('t', ''), 10);
      if (!isNaN(qNum)) {
        onSelectAñoPreset?.(año, 'limpiar');
        onTogglePeriodo(año, qNum);
      }
    }
  };

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

      {/* 📱 FILAS DE TRIMESTRES (Móvil: Desplegable Select / Desktop: Fila de Botones) */}
      <div className="space-y-3 sm:space-y-4" data-tutorial="trimestres-periods">
        {añosOrdenados.map((año, yearIndex) => {
          // Filtrar trimestres del año
          const trimestresAño = trimestres
            .filter(t => t.año === año)
            .sort((a, b) => b.trimestre - a.trimestre);

          const mobileVal = getMobileSelectValue(año);

          return (
            <div
              key={año}
              className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 p-2.5 sm:p-3 bg-accent/30 rounded-md border border-border/50"
            >
              {/* Etiqueta del Año */}
              <div className="flex items-center justify-between w-full sm:w-auto gap-2">
                <span className="text-xs sm:text-sm font-semibold text-foreground tracking-tight shrink-0">
                  Ejercicio {año}
                </span>

                {/* 📱 MÓVIL: Select Desplegable de Trimestre / Periodo (Solo móvil) */}
                <div className="sm:hidden w-full max-w-[200px]">
                  <Select
                    value={mobileVal}
                    onValueChange={(val) => handleMobileSelectChange(año, val)}
                  >
                    <SelectTrigger className="h-8 text-xs font-medium bg-background border-border shadow-sm">
                      <SelectValue placeholder="Seleccionar período" />
                    </SelectTrigger>
                    <SelectContent align="end" className="z-[100]">
                      <SelectItem value="todo" className="text-xs font-semibold py-2">
                        Año completo ({año})
                      </SelectItem>
                      <SelectItem value="semestre1" className="text-xs py-2">
                        1º Semestre (T1 - T2)
                      </SelectItem>
                      <SelectItem value="semestre2" className="text-xs py-2">
                        2º Semestre (T3 - T4)
                      </SelectItem>

                      {trimestresAño.map(t => {
                        return (
                          <SelectItem key={t.trimestre} value={`t${t.trimestre}`} className="text-xs py-2">
                            <div className="flex items-center justify-between gap-3 w-full">
                              <span>T{t.trimestre} {t.año}</span>
                              {t.cerrado && (
                                <QuarterBadge cerrado={t.cerrado_estado ?? t.cerrado} className="ml-1" />
                              )}
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* 💻 DESKTOP: Presets + Botones Horizontales (Sin cambios en Desktop) */}
              <div className="hidden sm:flex flex-row items-center justify-between w-full sm:w-auto gap-3">
                {/* Presets del Año en Desktop */}
                {onSelectAñoPreset && (
                  <div
                    className="flex items-center gap-1 shrink-0"
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

                {/* Botones de Trimestres en Desktop (T4, T3, T2, T1) */}
                <div
                  className="flex gap-2 flex-nowrap shrink-0"
                  data-tutorial={yearIndex === 0 ? 'trimestres-quarter-buttons' : undefined}
                >
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
              </div>
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