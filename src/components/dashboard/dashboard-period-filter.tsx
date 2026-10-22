'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar, ChevronDown, Check, X, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DashboardPeriodFilterProps {
  selectedAños: number[];
  selectedTrimestres: number[];
  onYearsChange: (years: number[]) => void;
  onQuartersChange: (quarters: number[]) => void;
  availableYears?: number[];
  className?: string;
}

const DEFAULT_YEARS = [2026, 2025, 2024, 2023, 2022];

const QUARTERS_CONFIG = [
  { id: 1, label: 'T1', months: 'Ene - Mar' },
  { id: 2, label: 'T2', months: 'Abr - Jun' },
  { id: 3, label: 'T3', months: 'Jul - Sep' },
  { id: 4, label: 'T4', months: 'Oct - Dic' },
];

export function DashboardPeriodFilter({
  selectedAños,
  selectedTrimestres,
  onYearsChange,
  onQuartersChange,
  availableYears = DEFAULT_YEARS,
  className,
}: DashboardPeriodFilterProps) {
  const [yearsOpen, setYearsOpen] = useState(false);
  const [quartersOpen, setQuartersOpen] = useState(false);

  // Manejo de Años
  const toggleYear = (year: number) => {
    if (selectedAños.includes(year)) {
      onYearsChange(selectedAños.filter((y) => y !== year));
    } else {
      onYearsChange([...selectedAños, year].sort((a, b) => b - a));
    }
  };

  const selectAllYears = () => onYearsChange([]);
  const selectSingleYear = (year: number) => onYearsChange([year]);

  // Manejo de Trimestres
  const toggleQuarter = (q: number) => {
    if (selectedTrimestres.includes(q)) {
      onQuartersChange(selectedTrimestres.filter((item) => item !== q));
    } else {
      onQuartersChange([...selectedTrimestres, q].sort((a, b) => a - b));
    }
  };

  const selectAllQuarters = () => onQuartersChange([]);
  const selectSemestre1 = () => onQuartersChange([1, 2]);
  const selectSemestre2 = () => onQuartersChange([3, 4]);

  // Labels calculados
  const yearsLabel = React.useMemo(() => {
    if (selectedAños.length === 0) return 'Todos los años';
    if (selectedAños.length === 1) return `${selectedAños[0]}`;
    return `Años: ${selectedAños.join(', ')}`;
  }, [selectedAños]);

  const quartersLabel = React.useMemo(() => {
    if (selectedTrimestres.length === 0 || selectedTrimestres.length === 4) {
      return 'Todos';
    }
    if (selectedTrimestres.length === 1) {
      return `T${selectedTrimestres[0]}`;
    }
    return `T${selectedTrimestres.join(' + T')}`;
  }, [selectedTrimestres]);

  const hasActiveQuarterFilter =
    selectedTrimestres.length > 0 && selectedTrimestres.length < 4;
  const hasActiveYearFilter = selectedAños.length > 0;

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {/* ─── POPOVER DE AÑOS CON CHECKBOXES ───────────────────────────── */}
      <Popover open={yearsOpen} onOpenChange={setYearsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              'h-9 justify-between min-w-[130px] font-medium text-xs sm:text-sm border-border/70 hover:bg-muted/60 transition-all',
              hasActiveYearFilter &&
                'border-primary/60 bg-primary/10 text-primary font-semibold'
            )}
          >
            <span className="flex items-center gap-1.5 truncate">
              <Calendar className={cn('h-3.5 w-3.5 shrink-0', hasActiveYearFilter ? 'text-primary' : 'text-muted-foreground')} />
              <span className="truncate">{yearsLabel}</span>
            </span>
            <ChevronDown className={cn('h-3.5 w-3.5 ml-1.5 shrink-0 opacity-70', hasActiveYearFilter ? 'text-primary' : 'text-muted-foreground')} />
          </Button>
        </PopoverTrigger>

        <PopoverContent
          align="start"
          className="w-56 p-3 shadow-xl border-border/80 bg-card/95 backdrop-blur-md rounded-xl space-y-2.5 z-50"
        >
          <div className="flex items-center justify-between border-b border-border/60 pb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-foreground">
              Años Fiscales
            </span>
            {hasActiveYearFilter && (
              <button
                type="button"
                onClick={selectAllYears}
                className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                Ver todos
              </button>
            )}
          </div>

          {/* Opción 'Todos los años' */}
          <div
            onClick={selectAllYears}
            className={cn(
              'flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition-colors',
              selectedAños.length === 0
                ? 'bg-primary/20 text-foreground font-semibold'
                : 'hover:bg-muted/50 text-muted-foreground hover:text-foreground'
            )}
          >
            <span>Todos los años (Auto)</span>
            {selectedAños.length === 0 && (
              <Check className="h-3.5 w-3.5 text-emerald-400" />
            )}
          </div>

          {/* Lista de Checkboxes por año */}
          <div className="space-y-1 pt-1 border-t border-border/40">
            {availableYears.map((year) => {
              const isChecked = selectedAños.includes(year);
              return (
                <div
                  key={year}
                  onClick={() => toggleYear(year)}
                  className="flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs hover:bg-muted/50 cursor-pointer transition-colors"
                >
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <Checkbox
                      checked={isChecked}
                      onCheckedChange={() => toggleYear(year)}
                      className="border-border/80 data-[state=checked]:bg-emerald-500 data-[state=checked]:border-emerald-500"
                    />
                    <span className={cn('text-foreground', isChecked && 'font-bold')}>
                      {year}
                    </span>
                  </label>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      selectSingleYear(year);
                    }}
                    className="text-[10px] text-muted-foreground/60 hover:text-foreground px-1 py-0.5 rounded hover:bg-muted/80 transition-colors"
                    title="Filtrar solo este año"
                  >
                    Solo este
                  </button>
                </div>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>

      {/* ─── POPOVER DE TRIMESTRES CON CHECKBOXES ─────────────────────── */}
      <Popover open={quartersOpen} onOpenChange={setQuartersOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              'h-9 justify-between min-w-[130px] font-medium text-xs sm:text-sm border-border/70 hover:bg-muted/60 transition-all',
              hasActiveQuarterFilter &&
                'border-emerald-500/60 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold'
            )}
          >
            <span className="flex items-center gap-1.5 truncate">
              {hasActiveQuarterFilter && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse shrink-0" />
              )}
              <span className="truncate">{quartersLabel}</span>
            </span>
            <ChevronDown className={cn('h-3.5 w-3.5 ml-1.5 shrink-0 opacity-70', hasActiveQuarterFilter ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground')} />
          </Button>
        </PopoverTrigger>

        <PopoverContent
          align="start"
          className="w-64 p-3 shadow-xl border-border/80 bg-card/95 backdrop-blur-md rounded-xl space-y-2.5 z-50"
        >
          <div className="flex items-center justify-between border-b border-border/60 pb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-foreground">
              Trimestres
            </span>
            {hasActiveQuarterFilter && (
              <button
                type="button"
                onClick={selectAllQuarters}
                className="text-[11px] text-emerald-400 hover:text-emerald-300 transition-colors flex items-center gap-1"
              >
                <RotateCcw className="h-2.5 w-2.5" />
                <span>Todos</span>
              </button>
            )}
          </div>

          {/* Accesos rápidos */}
          <div className="flex items-center justify-between text-[11px] text-muted-foreground px-1 py-0.5">
            <button
              type="button"
              onClick={selectAllQuarters}
              className="hover:text-foreground underline decoration-border hover:decoration-foreground transition-colors"
            >
              Todos (T1-T4)
            </button>
            <span>·</span>
            <button
              type="button"
              onClick={selectSemestre1}
              className="hover:text-foreground underline decoration-border hover:decoration-foreground transition-colors"
            >
              1er Sem (T1+T2)
            </button>
            <span>·</span>
            <button
              type="button"
              onClick={selectSemestre2}
              className="hover:text-foreground underline decoration-border hover:decoration-foreground transition-colors"
            >
              2do Sem (T3+T4)
            </button>
          </div>

          {/* Checkboxes de Trimestres */}
          <div className="space-y-1 pt-1 border-t border-border/40">
            {QUARTERS_CONFIG.map((q) => {
              // Si selectedTrimestres está vacío, significa "todos" activos visualmente
              const isChecked =
                selectedTrimestres.length === 0 ||
                selectedTrimestres.includes(q.id);

              return (
                <div
                  key={q.id}
                  onClick={() => toggleQuarter(q.id)}
                  className="flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs hover:bg-muted/50 cursor-pointer transition-colors"
                >
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <Checkbox
                      checked={isChecked}
                      onCheckedChange={() => toggleQuarter(q.id)}
                      className="border-border/80 data-[state=checked]:bg-emerald-500 data-[state=checked]:border-emerald-500"
                    />
                    <span className={cn('text-foreground', isChecked && 'font-bold')}>
                      {q.label}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      ({q.months})
                    </span>
                  </label>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onQuartersChange([q.id]);
                    }}
                    className="text-[10px] text-muted-foreground/60 hover:text-foreground px-1 py-0.5 rounded hover:bg-muted/80 transition-colors"
                    title={`Filtrar solo ${q.label}`}
                  >
                    Solo este
                  </button>
                </div>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>

      {/* Botón rápido de reset si hay algún filtro de período activo */}
      {(hasActiveYearFilter || hasActiveQuarterFilter) && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            onYearsChange([]);
            onQuartersChange([]);
          }}
          className="h-9 px-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
          title="Restablecer filtros de período"
        >
          <X className="h-3.5 w-3.5 mr-1" />
          <span>Restablecer</span>
        </Button>
      )}
    </div>
  );
}
