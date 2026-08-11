'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar, AlertTriangle, CheckCircle2, Clock, Info, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface QuarterOption {
  año: number;
  trimestre: number;
  label?: string;
  cerrado?: boolean;
}

interface QuarterReassignmentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (selectedAño: number, selectedTrimestre: number) => void;
  newDate: string;
  currentQuarter: { año: number; trimestre: number };
  targetQuarter: { año: number; trimestre: number };
  isTargetClosed: boolean;
  availableQuarters: QuarterOption[];
}

export function QuarterReassignmentDialog({
  isOpen,
  onClose,
  onConfirm,
  newDate,
  currentQuarter,
  targetQuarter,
  isTargetClosed,
  availableQuarters,
}: QuarterReassignmentDialogProps) {
  // Option selection: 'target' | 'current' | 'custom'
  const [selectedOption, setSelectedOption] = useState<'target' | 'current' | 'custom'>(
    isTargetClosed ? 'current' : 'target'
  );
  
  const [customQuarterKey, setCustomQuarterKey] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      if (isTargetClosed) {
        setSelectedOption('current');
      } else {
        setSelectedOption('target');
      }
      
      if (availableQuarters.length > 0) {
        const first = availableQuarters[0];
        setCustomQuarterKey(`${first.año}-T${first.trimestre}`);
      }
    }
  }, [isOpen, isTargetClosed, availableQuarters]);

  const handleConfirm = () => {
    if (selectedOption === 'target') {
      onConfirm(targetQuarter.año, targetQuarter.trimestre);
    } else if (selectedOption === 'current') {
      onConfirm(currentQuarter.año, currentQuarter.trimestre);
    } else {
      const [añoStr, trimStr] = customQuarterKey.split('-T');
      const año = parseInt(añoStr, 10);
      const trimestre = parseInt(trimStr, 10);
      if (!isNaN(año) && !isNaN(trimestre)) {
        onConfirm(año, trimestre);
      }
    }
  };

  const formatDateLabel = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
      return dateStr;
    } catch {
      return dateStr;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg bg-card/95 backdrop-blur-md border border-border/60 shadow-2xl animate-in zoom-in-95 duration-200">
        <DialogHeader className="space-y-3">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'h-10 w-10 rounded-full flex items-center justify-center shrink-0',
                isTargetClosed
                  ? 'bg-amber-500/15 text-amber-500 ring-1 ring-amber-500/30'
                  : 'bg-blue-500/15 text-blue-500 ring-1 ring-blue-500/30'
              )}
            >
              {isTargetClosed ? (
                <ShieldAlert className="h-5 w-5 animate-pulse" />
              ) : (
                <Calendar className="h-5 w-5" />
              )}
            </div>
            <div>
              <DialogTitle className="text-lg font-bold">
                {isTargetClosed ? '⚠️ Trimestre Cerrado Detectado' : '📅 Reasignación de Trimestre'}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                La fecha de emisión del documento ha sido modificada a{' '}
                <span className="font-semibold text-foreground">{formatDateLabel(newDate)}</span>.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Diagnostic Banner */}
          {isTargetClosed ? (
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-900 dark:text-amber-200 text-xs space-y-1.5">
              <div className="flex items-center gap-2 font-semibold">
                <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                <span>El trimestre de la nueva fecha está CERRADO</span>
              </div>
              <p className="text-[11px] leading-relaxed text-amber-800 dark:text-amber-300/90">
                Según la regla fiscal y el periodo de cortesía (mercy), esta fecha corresponde al trimestre{' '}
                <span className="font-bold">{targetQuarter.año} - T{targetQuarter.trimestre}</span>, el cual ya fue cerrado contablemente.
              </p>
            </div>
          ) : (
            <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-900 dark:text-blue-200 text-xs space-y-1.5">
              <div className="flex items-center gap-2 font-semibold">
                <Info className="h-4 w-4 text-blue-500 shrink-0" />
                <span>Nuevo trimestre correspondiente: {targetQuarter.año} - T{targetQuarter.trimestre}</span>
              </div>
              <p className="text-[11px] leading-relaxed text-blue-800 dark:text-blue-300/90">
                De acuerdo con la fecha ingresada y el periodo de extensión, el documento corresponde al trimestre{' '}
                <span className="font-bold">{targetQuarter.año} - T{targetQuarter.trimestre}</span> (abierto).
              </p>
            </div>
          )}

          {/* Options List */}
          <div className="space-y-2.5 pt-1">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Seleccioná cómo proceder:
            </label>

            {/* Option 1: Target Quarter (if open) */}
            {!isTargetClosed && (
              <div
                onClick={() => setSelectedOption('target')}
                className={cn(
                  'p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3',
                  selectedOption === 'target'
                    ? 'bg-blue-500/10 border-blue-500/40 ring-1 ring-blue-500/30'
                    : 'bg-muted/30 border-border/40 hover:bg-muted/50'
                )}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      'h-4 w-4 rounded-full border flex items-center justify-center',
                      selectedOption === 'target' ? 'border-blue-500 bg-blue-500' : 'border-muted-foreground/40'
                    )}
                  >
                    {selectedOption === 'target' && <CheckCircle2 className="h-3 w-3 text-white" />}
                  </div>
                  <div>
                    <p className="text-xs font-bold">
                      Reasignar a {targetQuarter.año} - T{targetQuarter.trimestre}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Calculado automáticamente por fecha (con periodo mercy)
                    </p>
                  </div>
                </div>
                <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-500 border-blue-500/20 font-bold">
                  Recomendado
                </Badge>
              </div>
            )}

            {/* Option 2: Keep current quarter */}
            <div
              onClick={() => setSelectedOption('current')}
              className={cn(
                'p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3',
                selectedOption === 'current'
                  ? 'bg-primary/10 border-primary/40 ring-1 ring-primary/30'
                  : 'bg-muted/30 border-border/40 hover:bg-muted/50'
              )}
            >
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    'h-4 w-4 rounded-full border flex items-center justify-center',
                    selectedOption === 'current' ? 'border-primary bg-primary' : 'border-muted-foreground/40'
                  )}
                >
                  {selectedOption === 'current' && <CheckCircle2 className="h-3 w-3 text-primary-foreground" />}
                </div>
                <div>
                  <p className="text-xs font-bold">
                    Mantener trimestre actual: {currentQuarter.año} - T{currentQuarter.trimestre}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Conserva el trimestre asignado previamente al documento
                  </p>
                </div>
              </div>
              <Badge variant="secondary" className="text-[10px] font-semibold">
                Sin Cambios
              </Badge>
            </div>

            {/* Option 3: Choose custom open quarter */}
            <div
              onClick={() => setSelectedOption('custom')}
              className={cn(
                'p-3 rounded-xl border transition-all cursor-pointer space-y-2.5',
                selectedOption === 'custom'
                  ? 'bg-violet-500/10 border-violet-500/40 ring-1 ring-violet-500/30'
                  : 'bg-muted/30 border-border/40 hover:bg-muted/50'
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      'h-4 w-4 rounded-full border flex items-center justify-center',
                      selectedOption === 'custom' ? 'border-violet-500 bg-violet-500' : 'border-muted-foreground/40'
                    )}
                  >
                    {selectedOption === 'custom' && <CheckCircle2 className="h-3 w-3 text-white" />}
                  </div>
                  <div>
                    <p className="text-xs font-bold">Seleccionar un trimestre disponible</p>
                    <p className="text-[11px] text-muted-foreground">
                      Elegí manualmente entre los trimestres abiertos
                    </p>
                  </div>
                </div>
              </div>

              {selectedOption === 'custom' && (
                <div className="pl-7 pt-1 animate-in fade-in duration-200">
                  <Select value={customQuarterKey} onValueChange={setCustomQuarterKey}>
                    <SelectTrigger className="h-9 text-xs bg-background/80">
                      <SelectValue placeholder="Seleccioná un trimestre" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableQuarters.map((q) => {
                        const key = `${q.año}-T${q.trimestre}`;
                        return (
                          <SelectItem key={key} value={key} className="text-xs">
                            {q.label || `${q.año} - T${q.trimestre}`}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t">
          <Button variant="outline" size="sm" onClick={onClose} className="text-xs">
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={handleConfirm}
            className="text-xs bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md shadow-blue-500/20"
          >
            Confirmar y Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
