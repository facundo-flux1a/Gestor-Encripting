'use client';

import * as React from 'react';
import { Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { QuarterBadge } from './quarter-badge';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import type { Trimestre } from '@/lib/types';

interface TrimestreSelectorProps {
  trimestres: Trimestre[];
  selectedAño: number | null;
  selectedTrimestre: number | null;
  onSelectTrimestre: (año: number, trimestre: number) => void;
  onSelectAño: (año: number) => void;
  mostrarVacios: boolean;
  onToggleMostrarVacios: (checked: boolean) => void;
}

export function TrimestreSelector({
  trimestres,
  selectedAño,
  selectedTrimestre,
  onSelectTrimestre,
  onSelectAño,
  mostrarVacios,
  onToggleMostrarVacios,
}: TrimestreSelectorProps) {
  // Calcular años disponibles
  const años = React.useMemo(() => {
    const añosBase = [
      2030, 2029, 2028, 2027, 2026, 2025, 2024, 2023, 2022
    ];
    
    const añosConDatos = Array.from(
      new Set(
        trimestres
          .map(t => t.año)
          .filter((año): año is number => año !== null && año !== undefined)
      )
    );
    
    const todosLosAños = new Set([...añosBase, ...añosConDatos]);
    
    return Array.from(todosLosAños).sort((a, b) => b - a);
  }, [trimestres]);

  // Filtrar trimestres del año seleccionado
  const trimestresDelAño = React.useMemo(() => {
    if (!selectedAño) return [];
    const filtered = trimestres.filter(t => t.año === selectedAño);
    return filtered.sort((a, b) => b.trimestre - a.trimestre);
  }, [trimestres, selectedAño]);

  // 🎯 CALCULAR JUSTIFY SEGÚN CANTIDAD DE TRIMESTRES
  const justifyClass = React.useMemo(() => {
    const count = trimestresDelAño.length;
    if (count === 1) return 'justify-start';
    if (count === 4) return 'justify-between';
    return 'justify-around'; // 2 o 3 trimestres
  }, [trimestresDelAño.length]);

  return (
    <div className="flex flex-col gap-3 sm:gap-4 p-3 sm:p-4 bg-card rounded-lg border">
      {/* 📱 FILA SUPERIOR: Selector de Año + Toggle (Mobile Stack, Desktop Row) */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
        {/* Selector de Año */}
        <div className="flex items-center gap-2 min-w-0 w-full sm:w-auto">
          <Calendar className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground shrink-0" />
          <Select
            value={selectedAño ? selectedAño.toString() : ''}
            onValueChange={(value) => onSelectAño(parseInt(value))}
          >
            <SelectTrigger className="w-full sm:w-[130px] h-9 text-xs sm:text-sm">
              <SelectValue placeholder="Seleccionar año" />
            </SelectTrigger>
            <SelectContent>
              {años.map(año => (
                <SelectItem key={año} value={año.toString()} className="text-xs sm:text-sm">
                  {año}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Toggle para mostrar vacíos - Solo desktop, en mobile está en el header */}
        
      </div>

      {/* 📱 FILA INFERIOR: Botones de Trimestres con Justify Dinámico */}
      {selectedAño && trimestresDelAño.length > 0 && (
        <ScrollArea className="w-full">
          <div className={`flex gap-2 pb-2 ${justifyClass}`}>
            {trimestresDelAño.map(t => (
              <Button
                key={`${t.año}-${t.trimestre}`}
                variant={selectedTrimestre === t.trimestre ? 'default' : 'outline'}
                size="sm"
                onClick={() => onSelectTrimestre(t.año, t.trimestre)}
                className="relative shrink-0 h-8 sm:h-9 text-xs sm:text-sm gap-1.5 sm:gap-2 transition-all duration-200 hover:scale-105"
              >
                <span className="whitespace-nowrap">
                  T{t.trimestre} {t.año}
                </span>
                {t.cerrado && (
                  <QuarterBadge cerrado={t.cerrado_estado ?? t.cerrado} className="ml-1" />
                )}
              </Button>
            ))}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      )}

      {/* 📱 EMPTY STATE: Cuando no hay trimestres para el año seleccionado */}
      {selectedAño && trimestresDelAño.length === 0 && (
        <div className="text-center py-4 sm:py-6 text-xs sm:text-sm text-muted-foreground">
          No hay trimestres disponibles para {selectedAño}
          {!mostrarVacios && (
            <div className="mt-2">
              <Button
                variant="link"
                size="sm"
                onClick={() => onToggleMostrarVacios(true)}
                className="text-xs sm:text-sm h-auto p-0"
              >
                Activar "Mostrar vacíos" para verlos
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}