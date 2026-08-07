'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Loader2, PauseCircle, Play, Lock, FileText, CheckCircle2, ArrowRight, SlidersHorizontal } from 'lucide-react';
import type { Trimestre } from '@/lib/types';

interface PauseQuartersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCompanyIds: number[];
  onSuccess: () => void;
}

interface QuarterToggleState {
  key: string; // `${año}-${trimestre}`
  año: number;
  trimestre: number;
  empresa_id: number | null;
  empresa_nombre: string | null;
  originalEstado: number; // 0=Activo, 1=Cerrado, 2=Pausado
  newEstado: number;      // 0=Activo, 1=Cerrado, 2=Pausado
  total_documentos: number;
  changed: boolean;
}

function getQuarterLabel(trimestre: number, año: number): string {
  return `T${trimestre} ${año}`;
}

// Badge sobrio sin emojis
function EstadoBadge({ estado }: { estado: number }) {
  if (estado === 1) {
    return (
      <Badge variant="outline" className="text-[11px] px-2 py-0.5 border-red-500/40 bg-red-500/10 text-red-400 font-medium gap-1">
        <Lock className="h-3 w-3 shrink-0" />
        Cerrado
      </Badge>
    );
  }
  if (estado === 2) {
    return (
      <Badge variant="outline" className="text-[11px] px-2 py-0.5 border-amber-500/40 bg-amber-500/10 text-amber-400 font-medium gap-1">
        <PauseCircle className="h-3 w-3 shrink-0" />
        Pausado
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[11px] px-2 py-0.5 border-emerald-500/40 bg-emerald-500/10 text-emerald-400 font-medium gap-1">
      <CheckCircle2 className="h-3 w-3 shrink-0" />
      Activo
    </Badge>
  );
}

export function PauseQuartersDialog({
  open,
  onOpenChange,
  selectedCompanyIds,
  onSuccess,
}: PauseQuartersDialogProps) {
  const [isLoading, setIsLoading] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [showEmpty, setShowEmpty] = React.useState(false);
  const [allQuarters, setAllQuarters] = React.useState<QuarterToggleState[]>([]);
  const [quarterStates, setQuarterStates] = React.useState<QuarterToggleState[]>([]);

  // 🔄 Cargar trimestres e integrar datos reales del backend
  React.useEffect(() => {
    if (!open) return;

    let isMounted = true;
    const fetchAllQuarters = async () => {
      try {
        setIsLoading(true);
        const params = new URLSearchParams({
          mostrar_vacios: 'true',
        });
        if (selectedCompanyIds && selectedCompanyIds.length > 0) {
          selectedCompanyIds.forEach(id => params.append('empresa_id', id.toString()));
        }

        const res = await fetch(`/api/trimestres?${params.toString()}`);
        if (!res.ok) throw new Error('Error al cargar trimestres');
        const trimestres: Trimestre[] = await res.json();

        if (!isMounted) return;

        const uniqueMap = new Map<string, QuarterToggleState>();

        // Determinar rango de años: desde 2024 hasta el máximo año presente
        const currentYear = new Date().getFullYear();
        let maxYear = currentYear;
        trimestres.forEach(t => {
          if (t.año > maxYear) maxYear = t.año;
        });

        // 1. Inicializar estructura base de trimestres T1-T4 desde 2024 en adelante
        for (let y = maxYear; y >= 2024; y--) {
          for (let q = 4; q >= 1; q--) {
            const key = `${y}-${q}`;
            uniqueMap.set(key, {
              key,
              año: y,
              trimestre: q,
              empresa_id: selectedCompanyIds.length === 1 ? selectedCompanyIds[0] : null,
              empresa_nombre: null,
              originalEstado: 0,
              newEstado: 0,
              total_documentos: 0,
              changed: false,
            });
          }
        }

        // 2. Mapear y sobreescribir con datos reales provenientes de la BD
        trimestres.forEach(t => {
          const key = `${t.año}-${t.trimestre}`;
          // Determinar estado real exacto
          const realEstado = typeof t.cerrado_estado === 'number'
            ? t.cerrado_estado
            : (t.cerrado ? 1 : 0);

          const existing = uniqueMap.get(key);

          if (existing) {
            existing.total_documentos += (t.total_documentos ?? 0);
            if (t.empresa_nombre && !existing.empresa_nombre) {
              existing.empresa_nombre = t.empresa_nombre;
            }

            // Asignar el estado real de la BD con máxima prioridad (1: Cerrado > 2: Pausado > 0: Activo)
            if (realEstado === 1) {
              existing.originalEstado = 1;
              existing.newEstado = 1;
            } else if (realEstado === 2 && existing.originalEstado !== 1) {
              existing.originalEstado = 2;
              existing.newEstado = 2;
            } else if (realEstado === 0 && existing.originalEstado === 0) {
              existing.originalEstado = 0;
              existing.newEstado = 0;
            }
          } else {
            uniqueMap.set(key, {
              key,
              año: t.año,
              trimestre: t.trimestre,
              empresa_id: t.empresa_id ?? (selectedCompanyIds.length === 1 ? selectedCompanyIds[0] : null),
              empresa_nombre: t.empresa_nombre,
              originalEstado: realEstado,
              newEstado: realEstado,
              total_documentos: t.total_documentos ?? 0,
              changed: false,
            });
          }
        });

        // Ordenar por año desc, trimestre desc
        const sorted = Array.from(uniqueMap.values()).sort((a, b) => {
          if (b.año !== a.año) return b.año - a.año;
          return b.trimestre - a.trimestre;
        });

        setAllQuarters(sorted);
      } catch (err) {
        console.error('❌ Error fetching trimestres for dialog:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchAllQuarters();

    return () => {
      isMounted = false;
    };
  }, [open, selectedCompanyIds]);

  // 🎯 Filtrado exacto:
  // - Por defecto: Trimestres que tengan documentos (>0) O que estén Pausados/Cerrados (originalEstado > 0)
  // - Con "Mostrar vacíos": Todos los trimestres históricos desde 2024
  React.useEffect(() => {
    if (showEmpty) {
      setQuarterStates(allQuarters);
    } else {
      setQuarterStates(
        allQuarters.filter(q => q.total_documentos > 0 || q.originalEstado > 0)
      );
    }
  }, [allQuarters, showEmpty]);

  const handleStateChange = (key: string, targetEstado: number) => {
    const updater = (prev: QuarterToggleState[]) =>
      prev.map(q =>
        q.key === key
          ? { ...q, newEstado: targetEstado, changed: targetEstado !== q.originalEstado }
          : q
      );
    setQuarterStates(updater);
    setAllQuarters(updater);
  };

  const changedCount = allQuarters.filter(q => q.changed).length;
  const allPaused = quarterStates.length > 0 && quarterStates.every(q => q.newEstado === 2);
  const allActive = quarterStates.length > 0 && quarterStates.every(q => q.newEstado === 0);

  const handlePauseAll = () => {
    const updater = (prev: QuarterToggleState[]) =>
      prev.map(q => ({ ...q, newEstado: 2, changed: 2 !== q.originalEstado }));
    setQuarterStates(updater);
    setAllQuarters(updater);
  };

  const handleResumeAll = () => {
    const updater = (prev: QuarterToggleState[]) =>
      prev.map(q => ({ ...q, newEstado: 0, changed: 0 !== q.originalEstado }));
    setQuarterStates(updater);
    setAllQuarters(updater);
  };

  const handleConfirm = async () => {
    const toChange = allQuarters.filter(q => q.changed);
    if (toChange.length === 0) {
      onOpenChange(false);
      return;
    }

    setIsSaving(true);
    try {
      const empresaId = selectedCompanyIds.length === 1 ? selectedCompanyIds[0] : null;

      await Promise.all(
        toChange.map(q =>
          fetch('/api/trimestres/pausar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              año: q.año,
              trimestre: q.trimestre,
              empresa_id: q.empresa_id ?? empresaId,
              estado: q.newEstado,
              pausado: q.newEstado === 2,
            }),
          })
        )
      );

      onSuccess();
      onOpenChange(false);
    } catch (err) {
      console.error('[PauseQuartersDialog] Error al guardar:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const emptyCount = allQuarters.filter(q => q.total_documentos === 0 && q.originalEstado === 0).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SlidersHorizontal className="h-5 w-5 text-amber-400" />
            Gestionar Estado de Trimestres
          </DialogTitle>
          <DialogDescription>
            Cambiá el estado de los períodos a Activo, Pausado o Cerrado, o reabrí trimestres pasados.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="text-xs text-muted-foreground">Cargando trimestres desde 2024...</span>
          </div>
        ) : (
          <>
            {/* Controles superiores */}
            <div className="flex items-center justify-between pb-1">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={allPaused || isSaving}
                  onClick={handlePauseAll}
                  className="text-xs gap-1 h-7 text-amber-500 hover:text-amber-400"
                >
                  <PauseCircle className="h-3.5 w-3.5" />
                  Pausar todos
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={allActive || isSaving}
                  onClick={handleResumeAll}
                  className="text-xs gap-1 h-7 text-emerald-500 hover:text-emerald-400"
                >
                  <Play className="h-3.5 w-3.5" />
                  Reanudar todos
                </Button>
              </div>

              {/* Toggle: mostrar vacíos */}
              {emptyCount > 0 && (
                <div className="flex items-center gap-1.5">
                  <Switch
                    id="show-empty"
                    checked={showEmpty}
                    onCheckedChange={setShowEmpty}
                    className="scale-75"
                  />
                  <Label htmlFor="show-empty" className="text-xs text-muted-foreground cursor-pointer whitespace-nowrap">
                    Mostrar vacíos ({emptyCount})
                  </Label>
                </div>
              )}
            </div>

            {/* Lista de trimestres */}
            {quarterStates.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-sm text-muted-foreground border rounded-md">
                <FileText className="h-8 w-8 opacity-30" />
                <p className="text-center text-xs">
                  No hay trimestres con facturas o estados especiales. Activá &quot;Mostrar vacíos&quot; para desplegar todos desde 2024.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border rounded-md border max-h-80 overflow-y-auto">
                {quarterStates.map(q => (
                  <div
                    key={q.key}
                    className={`flex items-center justify-between px-4 py-3 transition-colors ${
                      q.changed ? 'bg-amber-500/10' : ''
                    }`}
                  >
                    {/* Información del trimestre y estado actual */}
                    <div className="flex flex-col gap-1 min-w-0 pr-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-foreground">
                          {getQuarterLabel(q.trimestre, q.año)}
                        </span>
                        
                        {/* Status badge sobrio */}
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-muted-foreground">Actual:</span>
                          <EstadoBadge estado={q.originalEstado} />
                        </div>

                        {q.changed && (
                          <div className="flex items-center gap-1 text-[10px] font-semibold text-amber-400 bg-amber-500/20 px-1.5 py-0.5 rounded border border-amber-500/30">
                            <span>Pasará a:</span>
                            <ArrowRight className="h-2.5 w-2.5" />
                            <span>
                              {q.newEstado === 0 ? 'Activo' : q.newEstado === 2 ? 'Pausado' : 'Cerrado'}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <FileText className="h-3 w-3 shrink-0" />
                        <span>
                          {q.total_documentos === 0
                            ? 'Sin documentos'
                            : `${q.total_documentos} documento${q.total_documentos !== 1 ? 's' : ''}`}
                        </span>
                        {q.empresa_nombre && (
                          <>
                            <span className="opacity-40">·</span>
                            <span className="truncate">{q.empresa_nombre}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Selector de Estado Trimodual */}
                    <div className="flex items-center rounded-lg bg-background p-1 border border-border/80 shrink-0 shadow-inner">
                      {/* Estado 0: ACTIVO */}
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={() => handleStateChange(q.key, 0)}
                        className={`flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                          q.newEstado === 0
                            ? 'bg-emerald-600 text-white shadow-md shadow-emerald-900/50 scale-[1.02]'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                        }`}
                        title="Activar o reabrir el período para ingesta y modificaciones"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Activo
                      </button>

                      {/* Estado 2: PAUSADO */}
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={() => handleStateChange(q.key, 2)}
                        className={`flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                          q.newEstado === 2
                            ? 'bg-amber-600 text-white shadow-md shadow-amber-900/50 scale-[1.02]'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                        }`}
                        title="Pausar ingesta de facturas en este trimestre"
                      >
                        <PauseCircle className="h-3.5 w-3.5" />
                        Pausado
                      </button>

                      {/* Estado 1: CERRADO */}
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={() => handleStateChange(q.key, 1)}
                        className={`flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                          q.newEstado === 1
                            ? 'bg-red-600 text-white shadow-md shadow-red-900/50 scale-[1.02]'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                        }`}
                        title="Cierre fiscal del trimestre"
                      >
                        <Lock className="h-3.5 w-3.5" />
                        Cerrado
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isSaving || changedCount === 0}
            className="gap-2"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Guardando...
              </>
            ) : changedCount > 0 ? (
              `Aplicar ${changedCount} cambio${changedCount > 1 ? 's' : ''}`
            ) : (
              'Sin cambios'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
