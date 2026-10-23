'use client';

import * as React from 'react';
import { useCompanyContext } from '@/context/CompanyProvider';
import { Document } from '@/lib/types';
import { PageHeader } from '@/components/layout/page-header';
import { ComprobantesTutorialRouter } from '@/components/tutorials/ComprobantesTutorialRouter';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  Archive,
  Search,
  Filter,
  X,
  Mail,
  FileText,
  FileImage,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  CheckSquare,
  Square,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ComprobantesFilters {
  fechaDesde: string;
  fechaHasta: string;
  proveedor: string;
  trimestre: string; // '' | '1' | '2' | '3' | '4'
  año: string;
  tipo: string; // 'todas' | 'recibidas' | 'emitidas' | 'extranjeras' | 'tickets'
  soloConArchivo: boolean;
}

const TIPO_OPTIONS = [
  { value: 'todas', label: 'Todos los tipos' },
  { value: 'recibidas', label: 'Recibidas' },
  { value: 'emitidas', label: 'Emitidas' },
  { value: 'extranjeras', label: 'Extranjeras' },
  { value: 'tickets', label: 'Tickets' },
];

const TRIMESTRE_OPTIONS = [
  { value: '', label: 'Todos los trimestres' },
  { value: '1', label: 'T1' },
  { value: '2', label: 'T2' },
  { value: '3', label: 'T3' },
  { value: '4', label: 'T4' },
];

const currentYear = new Date().getFullYear();
const AÑO_OPTIONS = Array.from({ length: 5 }, (_, i) => String(currentYear - i));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function docHasFile(doc: Document): boolean {
  return Array.isArray(doc.archivos) && doc.archivos.length > 0 && !!doc.archivos[0]?.ruta_archivo;
}

function getTipoDoc(doc: Document): 'emitidas' | 'recibidas' | 'extranjeras' | 'tickets' {
  const tipo = (doc.tipo_documento || '').toLowerCase();
  if (tipo.includes('ticket')) return 'tickets';
  if (doc.is_issued) return 'emitidas';
  // Extranjero: si tiene importe en moneda distinta a EUR o el proveedor es extranjero
  const extra = (doc as any).datos_extra;
  if (extra?.pais_emisor && extra.pais_emisor !== 'ES') return 'extranjeras';
  return 'recibidas';
}

function formatDate(d: string | null): string {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('es-ES'); } catch { return d; }
}

function formatImporte(val: number | string | null | undefined, moneda = 'EUR'): string {
  const n = Number(val ?? 0);
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: moneda || 'EUR' }).format(n);
}

// ─── Export ZIP Dialog ────────────────────────────────────────────────────────

interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  selectedCount: number;
  selectedIds: number[];
  empresaId: number;
  defaultEmail: string;
}

function ExportZipDialog({ open, onClose, onSuccess, selectedCount, selectedIds, empresaId, defaultEmail }: ExportDialogProps) {
  const [email, setEmail] = React.useState(defaultEmail);
  const [loading, setLoading] = React.useState(false);
  const { toast } = useToast();

  React.useEffect(() => {
    if (open) setEmail(defaultEmail);
  }, [open, defaultEmail]);

  async function handleSubmit() {
    if (!email.trim()) return;
    setLoading(true);
    try {
      // Reservar key en MinIO
      const ts = Date.now();
      const rand = Math.random().toString(36).slice(2, 10);
      const s3ZipKey = `exports/${empresaId}/export_${ts}_${rand}.zip`;

      const res = await fetch('/api/export/zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentIds: selectedIds,
          empresaId,
          s3ZipKey,
          expiresInSec: 604800, // 7 días
          notifyEmail: email.trim(),
          source: 'dashboard',
        }),
      });

      if (!res.ok) throw new Error('Error al iniciar la exportación');

      toast({
        title: '📦 ZIP en preparación',
        description: `Recibirás el enlace en ${email} cuando esté listo.`,
      });
      onSuccess?.();
      onClose();
    } catch (err) {
      toast({ title: 'Error', description: String(err), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Archive className="h-5 w-5 text-violet-500" />
            Exportar comprobantes
          </DialogTitle>
          <DialogDescription>
            Se generará un ZIP con <strong>{selectedCount} comprobante{selectedCount !== 1 ? 's' : ''}</strong> y se enviará al correo indicado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="export-email">Correo destino</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="export-email"
                type="email"
                placeholder="nombre@dominio.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="pl-9"
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            El enlace de descarga estará disponible durante 7 días. Los documentos sin archivo original se incluirán como PDF de reconstrucción.
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={loading}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={loading || !email.trim()}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Archive className="h-4 w-4 mr-2" />}
            Generar ZIP
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main View ────────────────────────────────────────────────────────────────

export function ComprobantesView() {
  const { selectedCompanyIds, companies } = useCompanyContext();

  const [docs, setDocs] = React.useState<Document[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [filters, setFilters] = React.useState<ComprobantesFilters>({
    fechaDesde: '',
    fechaHasta: '',
    proveedor: '',
    trimestre: '',
    año: String(currentYear),
    tipo: 'todas',
    soloConArchivo: false,
  });
  const [showFilters, setShowFilters] = React.useState(true);
  const [selected, setSelected] = React.useState<Set<number>>(new Set());
  const [exportOpen, setExportOpen] = React.useState(false);

  const empresa = companies.find(c => selectedCompanyIds.includes(c.id));
  const empresaId = empresa?.id ?? selectedCompanyIds[0];
  const defaultEmail = (empresa as any)?.mail ?? '';

  // ─── Fetch docs ──────────────────────────────────────────────────────────
  React.useEffect(() => {
    if (!selectedCompanyIds.length) return;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    selectedCompanyIds.forEach(id => params.append('companyId', String(id)));

    fetch(`/api/documents?${params}`)
      .then(r => r.json())
      .then(data => {
        setDocs(Array.isArray(data) ? data : (data.documents ?? []));
        setSelected(new Set());
      })
      .catch(() => setError('Error cargando documentos'))
      .finally(() => setLoading(false));
  }, [selectedCompanyIds]);

  // ─── Filter logic ─────────────────────────────────────────────────────────
  const filtered = React.useMemo(() => {
    return docs.filter(doc => {
      const tipoDoc = getTipoDoc(doc);

      if (filters.tipo !== 'todas' && tipoDoc !== filters.tipo) return false;

      if (filters.año && doc.año_trimestre && String(doc.año_trimestre) !== filters.año) return false;
      if (filters.trimestre && doc.num_trimestre && String(doc.num_trimestre) !== filters.trimestre) return false;

      if (filters.proveedor) {
        const q = filters.proveedor.toLowerCase();
        const prov = (doc.proveedor || '').toLowerCase();
        const cif = (doc.cif || '').toLowerCase();
        if (!prov.includes(q) && !cif.includes(q)) return false;
      }

      if (filters.fechaDesde && doc.fecha_emision) {
        if (new Date(doc.fecha_emision) < new Date(filters.fechaDesde)) return false;
      }
      if (filters.fechaHasta && doc.fecha_emision) {
        if (new Date(doc.fecha_emision) > new Date(filters.fechaHasta)) return false;
      }

      if (filters.soloConArchivo && !docHasFile(doc)) return false;

      return true;
    });
  }, [docs, filters]);

  // ─── Selection ────────────────────────────────────────────────────────────
  const allFilteredIds = filtered.map(d => d.id_documento);
  const allSelected = allFilteredIds.length > 0 && allFilteredIds.every(id => selected.has(id));
  const someSelected = allFilteredIds.some(id => selected.has(id));

  function toggleAll() {
    if (allSelected) {
      setSelected(prev => {
        const next = new Set(prev);
        allFilteredIds.forEach(id => next.delete(id));
        return next;
      });
    } else {
      setSelected(prev => {
        const next = new Set(prev);
        allFilteredIds.forEach(id => next.add(id));
        return next;
      });
    }
  }

  function toggleDoc(id: number) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const selectedInFiltered = filtered.filter(d => selected.has(d.id_documento));
  const selectedCount = selectedInFiltered.length;
  const selectedIds = selectedInFiltered.map(d => d.id_documento);

  function clearFilters() {
    setFilters({
      fechaDesde: '', fechaHasta: '', proveedor: '',
      trimestre: '', año: String(currentYear),
      tipo: 'todas', soloConArchivo: false,
    });
  }

  const hasActiveFilters = filters.proveedor || filters.fechaDesde || filters.fechaHasta ||
    filters.trimestre || filters.tipo !== 'todas' || filters.soloConArchivo ||
    filters.año !== String(currentYear);

  return (
    <div className="flex flex-col h-full">
      <ComprobantesTutorialRouter isDataLoading={loading} />
      <PageHeader
        title="Comprobantes"
        description="Seleccioná los documentos que querés exportar y envialos por correo"
        icon={Archive}
        data-tutorial="comprobantes-header"
      />

      <div className="flex-1 overflow-auto px-4 pb-24 space-y-4 pt-2">

        {/* ── Filtros ─────────────────────────────────────────────── */}
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden" data-tutorial="comprobantes-filters">
          <button
            onClick={() => setShowFilters(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/50 transition-colors"
          >
            <span className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              Filtros
              {hasActiveFilters && (
                <Badge variant="secondary" className="text-xs">Activos</Badge>
              )}
            </span>
            {showFilters ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </button>

          {showFilters && (
            <div className="px-4 pb-4 border-t">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 pt-3">

                {/* Tipo */}
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Tipo</Label>
                  <Select value={filters.tipo} onValueChange={v => setFilters(f => ({ ...f, tipo: v }))}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIPO_OPTIONS.map(o => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {/* Año */}
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Año</Label>
                  <Select value={filters.año} onValueChange={v => setFilters(f => ({ ...f, año: v }))}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="" className="text-xs">Todos</SelectItem>
                      {AÑO_OPTIONS.map(y => <SelectItem key={y} value={y} className="text-xs">{y}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {/* Trimestre */}
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Trimestre</Label>
                  <Select value={filters.trimestre} onValueChange={v => setFilters(f => ({ ...f, trimestre: v }))}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      {TRIMESTRE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {/* Proveedor */}
                <div className="space-y-1 col-span-2">
                  <Label className="text-xs text-muted-foreground">Proveedor / CIF</Label>
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      value={filters.proveedor}
                      onChange={e => setFilters(f => ({ ...f, proveedor: e.target.value }))}
                      placeholder="Buscar..."
                      className="h-8 text-xs pl-7"
                    />
                  </div>
                </div>

                {/* Fecha desde */}
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Fecha desde</Label>
                  <Input
                    type="date"
                    value={filters.fechaDesde}
                    onChange={e => setFilters(f => ({ ...f, fechaDesde: e.target.value }))}
                    className="h-8 text-xs"
                  />
                </div>

                {/* Fecha hasta */}
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Fecha hasta</Label>
                  <Input
                    type="date"
                    value={filters.fechaHasta}
                    onChange={e => setFilters(f => ({ ...f, fechaHasta: e.target.value }))}
                    className="h-8 text-xs"
                  />
                </div>

                {/* Solo con archivo */}
                <div className="space-y-1 flex flex-col justify-end">
                  <label className="flex items-center gap-2 cursor-pointer h-8">
                    <Checkbox
                      checked={filters.soloConArchivo}
                      onCheckedChange={v => setFilters(f => ({ ...f, soloConArchivo: !!v }))}
                    />
                    <span className="text-xs">Solo con archivo</span>
                  </label>
                </div>

              </div>

              {hasActiveFilters && (
                <div className="mt-3 flex justify-end">
                  <Button variant="ghost" size="sm" onClick={clearFilters} className="h-7 text-xs gap-1">
                    <X className="h-3 w-3" /> Limpiar filtros
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Tabla ───────────────────────────────────────────────── */}
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden" data-tutorial="comprobantes-table">
          {/* Header de tabla */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b bg-muted/30" data-tutorial="comprobantes-selection-bar">
            <div className="flex items-center gap-3">
              <button
                onClick={toggleAll}
                className="text-muted-foreground hover:text-foreground transition-colors"
                title={allSelected ? 'Deseleccionar todo' : 'Seleccionar todo'}
              >
                {allSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
              </button>
              <span className="text-xs text-muted-foreground">
                {filtered.length} documento{filtered.length !== 1 ? 's' : ''}
                {someSelected && ` · ${selectedCount} seleccionado${selectedCount !== 1 ? 's' : ''}`}
              </span>
            </div>
          </div>

          {/* Estado carga/error/vacío */}
          {loading && (
            <div className="flex items-center justify-center h-40 text-muted-foreground text-sm gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando documentos...
            </div>
          )}
          {!loading && error && (
            <div className="flex items-center justify-center h-40 text-destructive text-sm gap-2">
              <AlertCircle className="h-4 w-4" /> {error}
            </div>
          )}
          {!loading && !error && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground text-sm gap-2">
              <Archive className="h-8 w-8 opacity-30" />
              <span>No hay documentos con los filtros aplicados</span>
            </div>
          )}

          {/* Filas */}
          {!loading && !error && filtered.length > 0 && (
            <div className="divide-y divide-border/50">
              {/* Header columnas */}
              <div className="grid grid-cols-[2rem_1fr_1fr_7rem_7rem_5rem_3rem] gap-2 px-4 py-2 text-xs font-medium text-muted-foreground bg-muted/20">
                <div />
                <div>Proveedor / Emisor</div>
                <div>Tipo</div>
                <div>Fecha</div>
                <div className="text-right">Importe</div>
                <div className="text-center">Trimestre</div>
                <div className="text-center">Arch.</div>
              </div>

              {filtered.map(doc => {
                const isSelected = selected.has(doc.id_documento);
                const hasFile = docHasFile(doc);
                return (
                  <div
                    key={doc.id_documento}
                    onClick={() => toggleDoc(doc.id_documento)}
                    className={cn(
                      'grid grid-cols-[2rem_1fr_1fr_7rem_7rem_5rem_3rem] gap-2 px-4 py-2.5 items-center cursor-pointer transition-colors text-sm',
                      isSelected
                        ? 'bg-violet-500/8 hover:bg-violet-500/12'
                        : 'hover:bg-muted/40'
                    )}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleDoc(doc.id_documento)}
                      onClick={e => e.stopPropagation()}
                    />
                    <div className="truncate">
                      <span className="font-medium">{doc.proveedor || '—'}</span>
                      {doc.cif && <span className="ml-1.5 text-xs text-muted-foreground">{doc.cif}</span>}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {doc.tipo_documento || '—'}
                      {doc.numero_documento && <span className="ml-1 opacity-60">#{doc.numero_documento}</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">{formatDate(doc.fecha_emision)}</div>
                    <div className="text-xs text-right font-medium tabular-nums">
                      {formatImporte(doc.total, doc.moneda)}
                    </div>
                    <div className="text-center text-xs text-muted-foreground">
                      {doc.num_trimestre ? `T${doc.num_trimestre} ${doc.año_trimestre ?? ''}` : '—'}
                    </div>
                    <div className="flex justify-center">
                      {hasFile
                        ? <FileImage className="h-3.5 w-3.5 text-emerald-500" aria-label="Tiene archivo" />
                        : <FileText className="h-3.5 w-3.5 text-muted-foreground/40" aria-label="Sin archivo" />
                      }
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Barra flotante de selección ─────────────────────────── */}
      {selectedCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center pb-6 pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border bg-background/95 backdrop-blur-md shadow-2xl px-5 py-3">
            <span className="text-sm font-medium">
              {selectedCount} comprobante{selectedCount !== 1 ? 's' : ''} seleccionado{selectedCount !== 1 ? 's' : ''}
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelected(new Set())}
              className="h-7 text-xs gap-1 text-muted-foreground"
            >
              <X className="h-3 w-3" /> Limpiar
            </Button>
            <Button
              size="sm"
              onClick={() => setExportOpen(true)}
              className="h-8 gap-2 bg-violet-600 hover:bg-violet-700 text-white"
            >
              <Archive className="h-4 w-4" />
              Exportar ZIP
            </Button>
          </div>
        </div>
      )}

      {/* ── Dialog de exportación ────────────────────────────────── */}
      <ExportZipDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        onSuccess={() => setSelected(new Set())}
        selectedCount={selectedCount}
        selectedIds={selectedIds}
        empresaId={empresaId}
        defaultEmail={defaultEmail}
      />
    </div>
  );
}
