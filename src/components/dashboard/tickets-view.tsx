'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Document } from '@/lib/types'
import { Receipt, Download, Trash2, Square, CheckSquare, Minus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { generateAdvancedExport } from '@/lib/export-utils'
import { useToast } from '@/hooks/use-toast'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface TicketsViewProps {
  documents: Document[]
  onDocumentChanged?: () => void
}

// Campos candidatos a mostrar, en orden de prioridad
const CANDIDATE_COLUMNS = [
  { key: 'fecha_emision',    label: 'Fecha',    render: (d: any) => d.fecha_emision ? new Date(d.fecha_emision).toLocaleDateString('es-ES') : '—' },
  { key: 'proveedor',        label: 'Comercio', render: (d: any) => d.proveedor || d.cif || '—' },
  { key: 'cif',              label: 'CIF',      render: (d: any) => d.cif || '—' },
  { key: 'numero_documento', label: 'Nº Doc.',  render: (d: any) => d.numero_documento || '—' },
  { key: 'tipo_documento',   label: 'Tipo',     render: (d: any) => d.tipo_documento || '—' },
  { key: 'base_imponible',   label: 'Base',     render: (d: any) => (d.base_imponible != null || d.importe_sin_impuestos != null) && Number(d.base_imponible ?? d.importe_sin_impuestos) !== 0 ? `${Number(d.base_imponible ?? d.importe_sin_impuestos).toFixed(2)} €` : '—' },
  { key: 'iva',              label: 'IVA',      render: (d: any) => d.iva != null && Number(d.iva) !== 0 ? `${Number(d.iva).toFixed(2)} €` : '—' },
  { key: 'total',            label: 'Total',    render: (d: any) => (d.total != null || d.importe_total != null) ? `${Number(d.total ?? d.importe_total).toFixed(2)} €` : '—' },
];

function isTicketRectificativo(d: any): boolean {
  const tot = Number(d?.total ?? d?.importe_total ?? 0);
  const imp = Number(d?.importe_total ?? d?.total ?? 0);
  if (tot < 0 || imp < 0) return true;

  const de = typeof d?.datos_extra === 'string'
    ? (() => { try { return JSON.parse(d.datos_extra); } catch { return {}; } })()
    : (d?.datos_extra || {});
  if (de.es_abono || de.is_abono) return true;

  const tipo = String(d?.tipo_documento || '').toLowerCase();
  return tipo.includes('rectific') || tipo.includes('abono');
}

function detectActiveColumns(docs: Document[]) {
  return CANDIDATE_COLUMNS.filter(col =>
    docs.some(doc => {
      const v = col.render(doc);
      return v && v !== '—';
    })
  );
}

export function TicketsView({ documents, onDocumentChanged }: TicketsViewProps) {
  const router = useRouter();
  const { toast } = useToast();
  const activeColumns = React.useMemo(() => detectActiveColumns(documents), [documents]);

  // ── Selección múltiple ──
  const [selectedIds, setSelectedIds] = React.useState<Set<number>>(new Set());
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);

  // Resetear selección si cambian los documentos
  React.useEffect(() => {
    setSelectedIds(new Set());
  }, [documents]);

  const allIds = React.useMemo(
    () => documents.map((d: any) => d.id_documento).filter(Boolean) as number[],
    [documents]
  );

  const isAllSelected = allIds.length > 0 && allIds.every(id => selectedIds.has(id));
  const isSomeSelected = allIds.some(id => selectedIds.has(id)) && !isAllSelected;

  const handleToggleAll = () => {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allIds));
    }
  };

  const handleToggleRow = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // ── Eliminación masiva ──
  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    const ids = Array.from(selectedIds);
    try {
      const CONCURRENCY = 5;
      const results: { id: number; success: boolean }[] = [];

      for (let i = 0; i < ids.length; i += CONCURRENCY) {
        const chunk = ids.slice(i, i + CONCURRENCY);
        const chunkResults = await Promise.all(
          chunk.map(id =>
            fetch(`/api/documents/${id}`, { method: 'DELETE' })
              .then(r => ({ id, success: r.ok }))
              .catch(() => ({ id, success: false }))
          )
        );
        results.push(...chunkResults);
      }

      const failed = results.filter(r => !r.success);
      const ok = results.length - failed.length;

      if (failed.length > 0) {
        toast({
          title: 'Eliminación parcial',
          description: `Se eliminaron ${ok} tickets. Fallaron ${failed.length}.`,
          variant: 'destructive',
        });
      } else {
        toast({
          title: '✅ Eliminación completada',
          description: `Se eliminaron ${ok} ticket${ok !== 1 ? 's' : ''} correctamente.`,
        });
      }

      setSelectedIds(new Set());
      window.dispatchEvent(new CustomEvent('documentUploaded'));
      if (onDocumentChanged) onDocumentChanged();
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Error inesperado al eliminar',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
      setIsDeleteDialogOpen(false);
    }
  };

  const handleExportTickets = (format: 'excel' | 'csv') => {
    generateAdvancedExport(
      documents,
      activeColumns.map(c => ({ id: c.key, header: c.label })),
      {
        filename: 'tickets',
        format,
        exportContext: 'documentos_tickets',
        includeFileUrls: true,
      }
    );
  };

  if (documents.length === 0) {
    return (
      <div className="text-center py-12 px-4">
        <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4 transition-all duration-300 hover:bg-orange-500/10 hover:shadow-lg hover:shadow-orange-500/20 hover:scale-110">
          <Receipt className="h-6 w-6 text-muted-foreground transition-all duration-300 hover:text-orange-500 hover:scale-110" />
        </div>
        <h3 className="text-base font-semibold mb-2 transition-colors duration-300 hover:text-orange-600">
          No hay tickets
        </h3>
        <p className="text-sm text-muted-foreground">
          Aún no se han registrado tickets en este período
        </p>
      </div>
    );
  }

  const totalImporte = documents.reduce((acc, d) => acc + Number((d as any).total || 0), 0);
  const totalIva     = documents.reduce((acc, d) => acc + Number((d as any).iva || 0), 0);
  const selectedCount = selectedIds.size;

  return (
    <div className="space-y-3">
      {/* Resumen rápido + acciones */}
      <div className="flex flex-wrap items-center gap-3 pb-1">
        <div className="flex items-center gap-2 bg-orange-500/10 border border-orange-500/20 rounded-lg px-3 py-1.5">
          <Receipt className="h-3.5 w-3.5 text-orange-500" />
          <span className="text-xs font-medium text-orange-600 dark:text-orange-400">
            {documents.length} ticket{documents.length !== 1 ? 's' : ''}
          </span>
        </div>
        {totalImporte !== 0 && (
          <div className="flex items-center gap-1.5 bg-muted/60 border border-border/50 rounded-lg px-3 py-1.5">
            <span className="text-xs text-muted-foreground">Total:</span>
            <span className="text-xs font-mono font-semibold">{totalImporte.toFixed(2)} €</span>
          </div>
        )}
        {totalIva !== 0 && (
          <div className="flex items-center gap-1.5 bg-muted/60 border border-border/50 rounded-lg px-3 py-1.5">
            <span className="text-xs text-muted-foreground">IVA:</span>
            <span className="text-xs font-mono font-semibold">{totalIva.toFixed(2)} €</span>
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleExportTickets('excel')}
            className="h-8 text-xs gap-1.5 hover:border-orange-500/40"
          >
            <Download className="h-3.5 w-3.5 text-orange-500" />
            Exportar Excel
          </Button>
        </div>
      </div>

      {/* Toolbar de selección (visible solo cuando hay seleccionados) */}
      {selectedCount > 0 && (
        <div className="flex items-center gap-3 px-3 py-2 bg-primary/5 border border-primary/20 rounded-lg animate-in fade-in slide-in-from-top-1 duration-200">
          <span className="text-xs text-muted-foreground">
            <span className="font-bold text-primary">{selectedCount}</span> seleccionado{selectedCount !== 1 ? 's' : ''}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedIds(new Set())}
              className="h-7 text-xs"
            >
              Deseleccionar
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setIsDeleteDialogOpen(true)}
              className="h-7 text-xs gap-1.5"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Eliminar {selectedCount > 1 ? `(${selectedCount})` : ''}
            </Button>
          </div>
        </div>
      )}

      {/* Tabla dinámica */}
      <div className="rounded-xl border border-border/50 overflow-hidden bg-card/50 backdrop-blur-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50 bg-muted/30">
                {/* Checkbox select-all */}
                <th className="px-3 py-2.5 w-8">
                  <button
                    onClick={handleToggleAll}
                    className="flex items-center justify-center text-muted-foreground hover:text-primary transition-colors"
                    aria-label="Seleccionar todos"
                  >
                    {isAllSelected ? (
                      <CheckSquare className="h-4 w-4 text-primary" />
                    ) : isSomeSelected ? (
                      <Minus className="h-4 w-4 text-primary" />
                    ) : (
                      <Square className="h-4 w-4" />
                    )}
                  </button>
                </th>
                {activeColumns.map(col => (
                  <th key={col.key} className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                    {col.label}
                  </th>
                ))}
                <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Acc.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {documents.map((doc, idx) => {
                const id = (doc as any).id_documento ?? idx;
                const isSelected = typeof id === 'number' && selectedIds.has(id);
                return (
                  <tr
                    key={id}
                    onClick={() => router.push(`/documento/${(doc as any).id_documento}`)}
                    className={`hover:bg-orange-500/5 cursor-pointer transition-colors duration-150 group ${isSelected ? 'bg-primary/5' : ''}`}
                  >
                    {/* Checkbox por fila */}
                    <td className="px-3 py-2.5" onClick={e => handleToggleRow(id, e)}>
                      <div className="flex items-center justify-center text-muted-foreground hover:text-primary transition-colors">
                        {isSelected ? (
                          <CheckSquare className="h-4 w-4 text-primary" />
                        ) : (
                          <Square className="h-4 w-4 opacity-40 group-hover:opacity-100 transition-opacity" />
                        )}
                      </div>
                    </td>
                    {activeColumns.map(col => {
                      const value = col.render(doc);
                      const isEmpty = value === '—';
                      return (
                        <td key={col.key} className={`px-3 py-2.5 whitespace-nowrap ${col.key === 'total' || col.key === 'base_imponible' || col.key === 'iva' ? 'font-mono font-semibold' : ''} ${isEmpty ? 'text-muted-foreground/40' : ''}`}>
                          {col.key === 'tipo_documento' ? (
                            <span className="flex items-center gap-1.5">
                              <Badge variant="secondary" className="text-[10px] bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20">
                                {value}
                              </Badge>
                              {isTicketRectificativo(doc) && (
                                <Badge variant="secondary" className="text-[10px] bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20">
                                  Rectificativo
                                </Badge>
                              )}
                            </span>
                          ) : value}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2.5 text-right">
                      <span className="text-[10px] text-muted-foreground group-hover:text-orange-500 transition-colors">Ver →</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Dialog confirmación de eliminación */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar {selectedCount} ticket{selectedCount !== 1 ? 's' : ''}?</AlertDialogTitle>
            <AlertDialogDescription>
              Estás a punto de eliminar permanentemente{' '}
              <span className="font-bold text-foreground">{selectedCount} ticket{selectedCount !== 1 ? 's' : ''}</span>.
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Eliminando...' : `Eliminar ${selectedCount} ticket${selectedCount !== 1 ? 's' : ''}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
