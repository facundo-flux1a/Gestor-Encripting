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
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Loader2, Download, FileText, Calendar, CheckSquare, Square, Filter } from 'lucide-react';
import type { Trimestre } from '@/lib/types';
import { generateAdvancedExport } from '@/lib/export-utils';
import { useToast } from '@/hooks/use-toast';

interface ExportQuartersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCompanyIds: number[];
  selectedPeriodosCurrent: Set<string>; // 'YYYY-Q' de la pantalla principal
  currentAño: number;
  currentTrimestre: number;
}

interface QuarterExportItem {
  key: string; // 'YYYY-Q'
  año: number;
  trimestre: number;
  total_documentos: number;
  cerrado_estado: number; // 0=Activo, 1=Cerrado, 2=Pausado
  selected: boolean;
}

export function ExportQuartersDialog({
  open,
  onOpenChange,
  selectedCompanyIds,
  selectedPeriodosCurrent,
  currentAño,
  currentTrimestre,
}: ExportQuartersDialogProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = React.useState(false);
  const [isExporting, setIsExporting] = React.useState(false);
  const [showEmpty, setShowEmpty] = React.useState(false);
  const [items, setItems] = React.useState<QuarterExportItem[]>([]);
  const [filterState, setFilterState] = React.useState<'all' | 'activo' | 'pausado' | 'cerrado'>('all');

  // 🔄 Cargar todos los trimestres desde la BD
  React.useEffect(() => {
    if (!open) return;

    let isMounted = true;
    const fetchTrimestres = async () => {
      try {
        setIsLoading(true);
        const params = new URLSearchParams({ mostrar_vacios: 'true' });
        if (selectedCompanyIds && selectedCompanyIds.length > 0) {
          selectedCompanyIds.forEach(id => params.append('empresa_id', id.toString()));
        }

        const res = await fetch(`/api/trimestres?${params.toString()}`);
        if (!res.ok) throw new Error('Error al consultar trimestres');
        const trimestresList: Trimestre[] = await res.json();

        if (!isMounted) return;

        const currentYear = new Date().getFullYear();
        let maxYear = currentYear;
        trimestresList.forEach(t => {
          if (t.año > maxYear) maxYear = t.año;
        });

        const map = new Map<string, QuarterExportItem>();

        // 1. Inicializar desde 2024 hasta maxYear
        for (let y = maxYear; y >= 2024; y--) {
          for (let q = 4; q >= 1; q--) {
            const key = `${y}-${q}`;
            // Por defecto, pre-seleccionar los periodos que estaban seleccionados en la pantalla principal
            const isCurrentlySelected = selectedPeriodosCurrent.has(key) ||
              (selectedPeriodosCurrent.size === 0 && y === currentAño && q === currentTrimestre);

            map.set(key, {
              key,
              año: y,
              trimestre: q,
              total_documentos: 0,
              cerrado_estado: 0,
              selected: isCurrentlySelected,
            });
          }
        }

        // 2. Sobre-escribir con datos de BD
        trimestresList.forEach(t => {
          const key = `${t.año}-${t.trimestre}`;
          const existing = map.get(key);
          const realEstado = typeof t.cerrado_estado === 'number'
            ? t.cerrado_estado
            : (t.cerrado ? 1 : 0);

          if (existing) {
            existing.total_documentos += (t.total_documentos ?? 0);
            if (realEstado > 0) existing.cerrado_estado = realEstado;
          } else {
            map.set(key, {
              key,
              año: t.año,
              trimestre: t.trimestre,
              total_documentos: t.total_documentos ?? 0,
              cerrado_estado: realEstado,
              selected: selectedPeriodosCurrent.has(key),
            });
          }
        });

        // Ordenar desc por año y trimestre
        const sorted = Array.from(map.values()).sort((a, b) => {
          if (b.año !== a.año) return b.año - a.año;
          return b.trimestre - a.trimestre;
        });

        // Quitar pre-selección de los que resultaron sin documentos
        // (pueden estar cerrados/pausados pero vacíos)
        sorted.forEach(item => {
          if (item.selected && item.total_documentos === 0) {
            item.selected = false;
          }
        });

        setItems(sorted);
      } catch (err) {
        console.error('❌ Error fetching trimestres for export dialog:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchTrimestres();

    return () => {
      isMounted = false;
    };
  }, [open, selectedCompanyIds, selectedPeriodosCurrent, currentAño, currentTrimestre]);

  // Agrupar items por año
  const availableYears = React.useMemo(() => {
    return Array.from(new Set(items.map(i => i.año))).sort((a, b) => b - a);
  }, [items]);

  // Filtrar items: por defecto solo los que tienen documentos.
  // El switch "Vacíos" agrega los que no tienen ningún documento.
  const visibleItems = React.useMemo(() => {
    return items.filter(item => {
      if (!showEmpty && item.total_documentos === 0) return false;
      if (filterState === 'activo' && item.cerrado_estado !== 0) return false;
      if (filterState === 'cerrado' && item.cerrado_estado !== 1) return false;
      if (filterState === 'pausado' && item.cerrado_estado !== 2) return false;
      return true;
    });
  }, [items, showEmpty, filterState]);

  const selectedCount = items.filter(i => i.selected).length;

  const toggleSelect = (key: string) => {
    setItems(prev => prev.map(i => i.key === key ? { ...i, selected: !i.selected } : i));
  };

  const selectAllWithDocs = () => {
    setItems(prev => prev.map(i => ({
      ...i,
      selected: i.total_documentos > 0,
    })));
  };

  const selectNone = () => {
    setItems(prev => prev.map(i => ({ ...i, selected: false })));
  };

  const selectYear = (año: number) => {
    setItems(prev => prev.map(i => i.año === año ? { ...i, selected: true } : i));
  };

  const selectSemester = (año: number, sem: 1 | 2) => {
    const targetQ = sem === 1 ? [1, 2] : [3, 4];
    setItems(prev => prev.map(i => i.año === año && targetQ.includes(i.trimestre) ? { ...i, selected: true } : i));
  };

  // 🚀 Lanza la exportación reuniendo documentos de los trimestres seleccionados
  const handleExport = async () => {
    const selectedItems = items.filter(i => i.selected);
    if (selectedItems.length === 0) {
      toast({
        title: 'Sin selección',
        description: 'Por favor selecciona al menos un trimestre para exportar.',
        variant: 'destructive',
      });
      return;
    }

    setIsExporting(true);
    toast({
      title: 'Generando exportación...',
      description: `Recopilando documentos de ${selectedItems.length} período(s)...`,
    });

    try {
      // Peticiones paralelas por trimestre — construimos la URL manualmente para
      // evitar problemas con el caracter ñ en URLSearchParams constructor
      const fetchPromises = selectedItems
        .filter(item => item.trimestre > 0 && item.año > 0 && item.total_documentos > 0)
        .map(async (item) => {
          const params = new URLSearchParams();
          params.set('año', String(item.año));
          params.set('trimestre', String(item.trimestre));
          selectedCompanyIds.forEach(id => params.append('empresa_id', String(id)));

          const res = await fetch(`/api/trimestres/documentos?${params.toString()}`);
          if (!res.ok) return [];
          const data = await res.json();
          return Array.isArray(data) ? data : [];
        });

      const resultsArray = await Promise.all(fetchPromises);
      const flatDocs: any[] = resultsArray.flat();

      // Deduplicar por id (si existe) o por numero_documento como fallback
      const seen = new Set<string>();
      const allDocs = flatDocs.filter((doc: any) => {
        const dedupeKey = String(doc?.id ?? doc?.numero_documento ?? Math.random());
        if (seen.has(dedupeKey)) return false;
        seen.add(dedupeKey);
        return true;
      });

      if (allDocs.length === 0) {
        toast({
          title: 'Sin datos',
          description: 'No hay documentos para los trimestres seleccionados.',
          variant: 'destructive',
        });
        setIsExporting(false);
        return;
      }

      // Preprocesamiento estándar de presentación
      const processedData = allDocs.map((doc: any) => {
        const tipo = (doc.tipo_documento || '').toLowerCase();
        let emisorNombre = '';
        let emisorCif = '';
        let receptorNombre = '';

        if (doc.entidades && Array.isArray(doc.entidades)) {
          doc.entidades.forEach((e: any) => {
            if (e.rol === 'emisor' || e.rol === 'proveedor') {
              emisorNombre = e.nombre;
              emisorCif = e.identificador_fiscal;
            }
            if (e.rol === 'receptor' || e.rol === 'cliente') {
              receptorNombre = e.nombre;
            }
          });
        }

        if (!emisorNombre && !receptorNombre) {
          const datosExtra = typeof doc.datos_extra === 'string'
            ? JSON.parse(doc.datos_extra)
            : (doc.datos_extra || {});

          emisorNombre = doc.proveedor || datosExtra?.EMPRESA_EMISORA?.NOMBRE || '';
          emisorCif = doc.cif || datosExtra?.EMPRESA_EMISORA?.CIF || '';
          receptorNombre = datosExtra?.CLIENTE?.NOMBRE || '';
        }

        const isIssued = !!(
          doc.empresa_cif &&
          emisorCif &&
          emisorCif.trim().toLowerCase() === doc.empresa_cif.trim().toLowerCase()
        );

        const isAbono = tipo.includes('abono') || tipo.includes('crédito') || tipo.includes('credito') || doc.total < 0;
        const sign = isAbono ? -1 : 1;

        const baseDoc = Math.abs(Number(doc.base_imponible) || 0) * sign;
        const totalDoc = Math.abs(Number(doc.total) || 0) * sign;

        const correctedIvaDetails = (doc.iva_details || []).map((detail: any) => ({
          ...detail,
          base_imponible: Math.abs(Number(detail.base_imponible) || 0) * sign,
          cuota: Math.abs(Number(detail.cuota) || 0) * sign,
        }));

        return {
          ...doc,
          proveedor: isIssued ? receptorNombre : emisorNombre,
          cif: isIssued ? '' : emisorCif,
          total: totalDoc,
          base_imponible: baseDoc,
          iva_details: correctedIvaDetails,
          is_issued: isIssued,
        };
      });

      const exportColumns = [
        { id: 'numero_documento', header: 'Número' },
        { id: 'fecha_emision', header: 'Fecha Emisión' },
        { id: 'proveedor', header: 'Emisor/Receptor' },
        { id: 'cif', header: 'CIF' },
        { id: 'base_imponible', header: 'Base Imponible' },
        { id: 'total', header: 'Total' },
        { id: 'base_21', header: 'Base 21%' },
        { id: 'iva_21', header: 'IVA 21%' },
        { id: 'base_10', header: 'Base 10%' },
        { id: 'iva_10', header: 'IVA 10%' },
        { id: 'retencion', header: 'Retención' },
      ];

      // Nombre dinámico descriptivo
      const yearsSet = Array.from(new Set(selectedItems.map(i => i.año)));
      const filename = yearsSet.length === 1
        ? `Exportacion_Trimestres_${yearsSet[0]}`
        : `Exportacion_Trimestres_${yearsSet.join('_')}`;

      generateAdvancedExport(processedData, exportColumns, {
        filename,
        format: 'excel',
        includeSummary: true,
        exportContext: 'trimestres',
      });

      toast({
        title: '✅ Exportación completada',
        description: `Se han exportado ${allDocs.length} documento(s) correctamente en formato Excel.`,
      });

      onOpenChange(false);
    } catch (err) {
      console.error('❌ Error al exportar:', err);
      toast({
        title: 'Error',
        description: 'No se pudo generar el archivo de exportación.',
        variant: 'destructive',
      });
    } finally {
      setIsExporting(false);
    }
  };

  const emptyCount = items.filter(i => i.total_documentos === 0).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[620px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5 text-blue-500" />
            Exportación Personalizada de Trimestres
          </DialogTitle>
          <DialogDescription>
            Elige exactamente qué trimestres y ejercicios quieres incluir en el archivo Excel.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="text-xs text-muted-foreground">Cargando trimestres...</span>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Barra de atajos y filtro superior */}
            <div className="flex flex-wrap items-center justify-between gap-2 bg-muted/40 p-2.5 rounded-lg border text-xs">
              <div className="flex items-center gap-1.5">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={selectAllWithDocs}
                  className="h-7 text-[11px] gap-1 px-2"
                >
                  <CheckSquare className="h-3.5 w-3.5 text-emerald-500" />
                  Con documentos
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={selectNone}
                  className="h-7 text-[11px] gap-1 px-2 text-muted-foreground"
                >
                  <Square className="h-3.5 w-3.5" />
                  Desmarcar todos
                </Button>
              </div>

              {/* Filtro por estado y switch vacíos */}
              <div className="flex items-center gap-3">
                {emptyCount > 0 && (
                  <div className="flex items-center gap-1.5">
                    <Switch
                      id="export-show-empty"
                      checked={showEmpty}
                      onCheckedChange={setShowEmpty}
                      className="scale-75"
                    />
                    <Label htmlFor="export-show-empty" className="text-[11px] text-muted-foreground cursor-pointer">
                      Vacíos ({emptyCount})
                    </Label>
                  </div>
                )}
              </div>
            </div>

            {/* Lista por Años */}
            <div className="max-h-80 overflow-y-auto space-y-4 pr-1">
              {availableYears.map(año => {
                const yearItems = visibleItems.filter(i => i.año === año);
                if (yearItems.length === 0) return null;

                const allYearSelected = yearItems.every(i => i.selected);

                return (
                  <div key={año} className="border rounded-lg p-3 bg-card space-y-2">
                    {/* Header del año con atajos */}
                    <div className="flex items-center justify-between border-b pb-2">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-blue-400" />
                        <span className="font-bold text-sm">Ejercicio {año}</span>
                      </div>

                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => selectYear(año)}
                          className="h-6 text-[10px] px-2"
                        >
                          Año completo
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => selectSemester(año, 1)}
                          className="h-6 text-[10px] px-1.5 text-muted-foreground"
                        >
                          1º Sem (T1-T2)
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => selectSemester(año, 2)}
                          className="h-6 text-[10px] px-1.5 text-muted-foreground"
                        >
                          2º Sem (T3-T4)
                        </Button>
                      </div>
                    </div>

                    {/* Trimestres del año */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                      {yearItems.map(item => (
                        <div
                          key={item.key}
                          onClick={() => toggleSelect(item.key)}
                          className={`flex flex-col gap-1 p-2 rounded-md border cursor-pointer transition-all select-none ${
                            item.selected
                              ? 'bg-blue-500/10 border-blue-500/50 shadow-sm'
                              : 'bg-background hover:bg-muted/40 border-border/80'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-xs">T{item.trimestre} {item.año}</span>
                            <Checkbox
                              checked={item.selected}
                              onCheckedChange={() => toggleSelect(item.key)}
                              onClick={e => e.stopPropagation()}
                              className="h-3.5 w-3.5"
                            />
                          </div>

                          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                            <span>
                              {item.total_documentos === 0
                                ? 'Sin docs'
                                : `${item.total_documentos} doc${item.total_documentos !== 1 ? 's' : ''}`}
                            </span>
                            {item.cerrado_estado === 1 && (
                              <Badge variant="outline" className="px-1 py-0 text-[9px] border-red-500/30 text-red-400 bg-red-500/10">
                                Cerrado
                              </Badge>
                            )}
                            {item.cerrado_estado === 2 && (
                              <Badge variant="outline" className="px-1 py-0 text-[9px] border-amber-500/30 text-amber-400 bg-amber-500/10">
                                Pausado
                              </Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <DialogFooter className="flex items-center justify-between sm:justify-between pt-2 border-t">
          <span className="text-xs text-muted-foreground font-medium">
            {selectedCount} período(s) seleccionado(s)
          </span>

          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isExporting}>
              Cancelar
            </Button>
            <Button
              onClick={handleExport}
              disabled={isExporting || selectedCount === 0}
              className="gap-2 bg-blue-600 hover:bg-blue-700"
            >
              {isExporting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Exportando...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  Exportar {selectedCount} período(s)
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
