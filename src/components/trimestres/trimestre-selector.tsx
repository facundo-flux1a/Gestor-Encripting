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
  // Obtener años únicos ordenados descendentemente
  const años = React.useMemo(() => {
    const añoActual = new Date().getFullYear();
    const años = [añoActual, añoActual - 1, añoActual - 2]; // 2025, 2024, 2023
    return años;
  }, []);

  // Filtrar trimestres del año seleccionado
  const trimestresDelAño = React.useMemo(() => {
    if (!selectedAño) return [];
    const filtered = trimestres.filter(t => t.año === selectedAño);
    // Ordenar descendentemente (T4, T3, T2, T1)
    return filtered.sort((a, b) => b.trimestre - a.trimestre);
  }, [trimestres, selectedAño]);

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-4 bg-card rounded-lg border">
      {/* Selector de Año */}
      <div className="flex items-center gap-2 min-w-[160px]">
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <Select
          value={selectedAño?.toString() || ''}
          onValueChange={(value) => onSelectAño(parseInt(value))}
        >
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="Seleccionar año" />
          </SelectTrigger>
          <SelectContent>
            {años.map(año => (
              <SelectItem key={año} value={año.toString()}>
                {año}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Selector de Trimestre */}
      {selectedAño && trimestresDelAño.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {trimestresDelAño.map(t => (
            <Button
              key={`${t.año}-${t.trimestre}`}
              variant={selectedTrimestre === t.trimestre ? 'default' : 'outline'}
              size="sm"
              onClick={() => onSelectTrimestre(t.año, t.trimestre)}
              className="relative"
            >
              T{t.trimestre} {t.año}
              {t.cerrado && (
                <QuarterBadge cerrado={true} className="ml-2" />
              )}
            </Button>
          ))}
        </div>
      )}

      {/* Toggle para mostrar vacíos */}
      <div className="flex items-center gap-2 ml-auto">
        <Switch
          id="mostrar-vacios"
          checked={mostrarVacios}
          onCheckedChange={onToggleMostrarVacios}
        />
        <Label htmlFor="mostrar-vacios" className="text-sm cursor-pointer">
          Mostrar vacíos
        </Label>
      </div>
    </div>
  );
}