'use client';

import * as React from 'react';
import { useCompanyContext } from '@/context/CompanyProvider';
import { MainLayout } from '@/components/layout/main-layout';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Search,
  RefreshCw,
  CheckCircle2,
  Scale,
  Layers,
  Check,
  BookOpen,
  Building2,
  FolderTree,
  FileText,
  ChevronDown,
  ChevronUp,
  Receipt,
  ExternalLink,
  Sparkles,
  AlertTriangle,
  Info
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { DocumentAccountingDebug, AccountingAccountItem } from '@/services/cuentas-contables-debug-service';
import { AsientoModal } from '@/components/debug/cuentas-contables/asiento-modal';
import { EditAccountDialog } from '@/components/debug/cuentas-contables/edit-account-dialog';
import { BulkActionBar } from '@/components/debug/cuentas-contables/bulk-action-bar';

export default function CuentasContablesDebugPage() {
  const { selectedCompanyIds } = useCompanyContext();
  const { toast } = useToast();

  const [documents, setDocuments] = React.useState<DocumentAccountingDebug[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshKey, setRefreshKey] = React.useState(0);

  // Pestaña activa: Por documentos vs Sumas y Saldos vs Libro Mayor
  const [viewTab, setViewTab] = React.useState<'documentos' | 'cuentas' | 'mayor'>('documentos');

  // Filtros
  const [searchTerm, setSearchTerm] = React.useState('');
  const [typeFilter, setTypeFilter] = React.useState<string>('all');
  const [statusFilter, setStatusFilter] = React.useState<string>('all');
  const [cuentasSearch, setCuentasSearch] = React.useState('');
  const [mayorTypeFilter, setMayorTypeFilter] = React.useState<'all' | 'gasto' | 'tercero' | 'impuesto'>('all');

  // Selección múltiple (Checkboxes)
  const [selectedIds, setSelectedIds] = React.useState<number[]>([]);
  const [isProcessingBulk, setIsProcessingBulk] = React.useState(false);

  // Fila expandida en Vista 1 (Accordion para ver Asiento inline)
  const [expandedDocIds, setExpandedDocIds] = React.useState<number[]>([]);
  const toggleExpandDoc = (id: number) => {
    setExpandedDocIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  // Cuentas expandidas en Vista 3 (Libro Mayor)
  const [expandedAccountKeys, setExpandedAccountKeys] = React.useState<string[]>([]);
  const toggleExpandAccount = (key: string) => {
    setExpandedAccountKeys(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  // Modales
  const [activeAsientoDoc, setActiveAsientoDoc] = React.useState<DocumentAccountingDebug | null>(null);
  const [editingItem, setEditingItem] = React.useState<{ doc: DocumentAccountingDebug; item: AccountingAccountItem } | null>(null);

  // Cargar datos desde la API
  React.useEffect(() => {
    async function loadData() {
      if (!selectedCompanyIds || selectedCompanyIds.length === 0) {
        setDocuments([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const params = selectedCompanyIds.map(id => `companyId=${id}`).join('&');
        const res = await fetch(`/api/debug/cuentas-contables?${params}`);
        if (!res.ok) throw new Error('Error al consultar cuentas contables');

        const json = await res.json();
        setDocuments(json.documents || []);
      } catch (err: any) {
        console.error('Error cargando cuentas contables:', err);
        toast({
          title: 'Error de carga',
          description: err.message || 'No se pudieron obtener los documentos',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [selectedCompanyIds, refreshKey, toast]);

  // Documentos filtrados
  const filteredDocs = React.useMemo(() => {
    return documents.filter(doc => {
      const term = searchTerm.toLowerCase();
      const matchSearch =
        !term ||
        doc.proveedor.toLowerCase().includes(term) ||
        doc.cif.toLowerCase().includes(term) ||
        doc.numero_documento.toLowerCase().includes(term) ||
        doc.asiento.some(a => a.codigo.toLowerCase().includes(term) || a.nombre.toLowerCase().includes(term));

      if (!matchSearch) return false;

      if (typeFilter === 'recibidas' && doc.is_issued) return false;
      if (typeFilter === 'emitidas' && !doc.is_issued) return false;
      if (typeFilter === 'tickets' && !doc.tipo_documento.toLowerCase().includes('ticket')) return false;

      if (statusFilter === 'revision' && doc.estado_contable !== 'revision') return false;
      if (statusFilter === 'aprobado' && doc.estado_contable !== 'aprobado') return false;
      if (statusFilter === 'descuadre' && doc.cuadrado) return false;

      return true;
    });
  }, [documents, searchTerm, typeFilter, statusFilter]);

  // Agrupación por Cuentas y Proveedores (Segunda Vista)
  const cuentasGrouped = React.useMemo(() => {
    const getCanonicalName = (codigo: string, tipo: string, fallback: string): string => {
      if (codigo.startsWith('400')) return 'Proveedores (Compras corrientes)';
      if (codigo.startsWith('410')) return 'Acreedores por prestaciones de servicios';
      if (codigo.startsWith('430')) return 'Clientes (Ventas y facturación)';
      if (codigo.startsWith('572')) return 'Bancos e instituciones de crédito c/c (Pago directo)';
      if (codigo.startsWith('570')) return 'Caja, euros (Pago en efectivo)';
      if (codigo.startsWith('472')) return 'H.P. IVA soportado (Impuesto deducible)';
      if (codigo.startsWith('477')) return 'H.P. IVA repercutido (Impuesto devengado)';
      if (codigo.startsWith('4751')) return 'H.P. Acreedora por retenciones practicadas (IRPF)';
      if (codigo.startsWith('628')) return 'Suministros (Luz, agua, telecomunicaciones)';
      if (codigo.startsWith('629')) return 'Otros servicios (Software, SaaS, material oficina)';
      if (codigo.startsWith('623')) return 'Servicios de profesionales independientes';
      if (codigo.startsWith('627')) return 'Publicidad, propaganda y relaciones públicas / Dietas';
      if (codigo.startsWith('624')) return 'Transportes y mensajería';
      if (codigo.startsWith('600')) return 'Compras de mercaderías';
      if (codigo.startsWith('700')) return 'Ventas de mercaderías';
      return fallback;
    };

    const map = new Map<string, {
      codigo: string;
      nombre: string;
      tipo: 'tercero' | 'gasto' | 'impuesto';
      debe: number;
      haber: number;
      docsCount: number;
      proveedores: Set<string>;
      sugerenciasCount: number;
      movimientos: Array<{
        documentoId: number;
        numeroDocumento: string;
        tipoDocumento: string;
        fechaEmision: string | null;
        proveedor: string;
        cif: string;
        debe: number;
        haber: number;
        concepto: string;
        isSuggested: boolean;
        origen: string;
        rawDoc: DocumentAccountingDebug;
        rawItem: AccountingAccountItem;
      }>;
    }>();

    documents.forEach(doc => {
      doc.asiento.forEach(item => {
        const key = `${item.tipo}_${item.codigo}`;
        if (!map.has(key)) {
          map.set(key, {
            codigo: item.codigo,
            nombre: getCanonicalName(item.codigo, item.tipo, item.nombre),
            tipo: item.tipo,
            debe: 0,
            haber: 0,
            docsCount: 0,
            proveedores: new Set(),
            sugerenciasCount: 0,
            movimientos: []
          });
        }
        const entry = map.get(key)!;
        entry.debe += (item.debe || 0);
        entry.haber += (item.haber || 0);
        entry.docsCount += 1;
        if (item.is_suggested) {
          entry.sugerenciasCount += 1;
        }
        if (doc.proveedor && doc.proveedor !== 'N/A') {
          entry.proveedores.add(doc.proveedor);
        }
        entry.movimientos.push({
          documentoId: doc.id_documento,
          numeroDocumento: doc.numero_documento,
          tipoDocumento: doc.tipo_documento,
          fechaEmision: doc.fecha_emision,
          proveedor: doc.proveedor,
          cif: doc.cif,
          debe: item.debe || 0,
          haber: item.haber || 0,
          concepto: item.nombre,
          isSuggested: item.is_suggested,
          origen: item.origen,
          rawDoc: doc,
          rawItem: item
        });
      });
    });

    return Array.from(map.values()).sort((a, b) => a.codigo.localeCompare(b.codigo));
  }, [documents]);

  // Cuentas filtradas por búsqueda (vista Por Cuentas y Libro Mayor)
  const cuentasFiltered = React.useMemo(() => {
    let list = cuentasGrouped;
    if (viewTab === 'mayor' && mayorTypeFilter !== 'all') {
      list = list.filter(c => c.tipo === mayorTypeFilter);
    }
    if (!cuentasSearch.trim()) return list;
    const term = cuentasSearch.toLowerCase();
    return list.filter(c =>
      c.codigo.toLowerCase().includes(term) ||
      c.nombre.toLowerCase().includes(term) ||
      c.movimientos.some(m =>
        m.proveedor.toLowerCase().includes(term) ||
        m.numeroDocumento.toLowerCase().includes(term) ||
        m.cif.toLowerCase().includes(term)
      )
    );
  }, [cuentasGrouped, cuentasSearch, viewTab, mayorTypeFilter]);

  // Conteo de sugerencias en documentos seleccionados
  const selectedSuggestionsCount = React.useMemo(() => {
    return documents
      .filter(d => selectedIds.includes(d.id_documento))
      .reduce((sum, d) => sum + d.sugerencias_pendientes, 0);
  }, [documents, selectedIds]);

  // Selección individual y masiva
  const handleToggleSelectDoc = (id: number) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleToggleSelectAll = () => {
    if (selectedIds.length === filteredDocs.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredDocs.map(d => d.id_documento));
    }
  };

  // Aprobar sugerencias en lote
  const handleApproveBatch = async () => {
    if (selectedIds.length === 0) return;

    try {
      setIsProcessingBulk(true);
      const res = await fetch('/api/debug/cuentas-contables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'approve_batch',
          documentIds: selectedIds,
        }),
      });

      if (!res.ok) throw new Error('Error al confirmar las cuentas');
      const data = await res.json();

      toast({
        title: 'Cuentas confirmadas',
        description: `Se confirmaron ${data.approvedCount || selectedSuggestionsCount} cuentas exitosamente.`,
      });

      setSelectedIds([]);
      setRefreshKey(k => k + 1);
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setIsProcessingBulk(false);
    }
  };

  // Aprobar documento individual
  const handleApproveSingleDoc = async (docId: number) => {
    try {
      const res = await fetch('/api/debug/cuentas-contables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'approve_batch',
          documentIds: [docId],
        }),
      });

      if (!res.ok) throw new Error('Error al confirmar cuentas');

      toast({
        title: 'Asiento confirmado',
        description: 'Las cuentas contables han quedado fijadas.',
      });

      setRefreshKey(k => k + 1);
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message,
        variant: 'destructive',
      });
    }
  };

  // Guardar cuenta editada individualmente
  const handleSaveAccountItem = async (params: any) => {
    try {
      const res = await fetch('/api/debug/cuentas-contables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_item',
          ...params,
        }),
      });

      if (!res.ok) throw new Error('Error al guardar la cuenta');

      toast({
        title: 'Cuenta guardada',
        description: `Subcuenta ${params.cuentaContable} asignada.`,
      });

      setRefreshKey(k => k + 1);
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message,
        variant: 'destructive',
      });
      throw err;
    }
  };

  // Exportar asientos a CSV
  const handleExportCsv = () => {
    const docsToExport = documents.filter(d => selectedIds.includes(d.id_documento));
    if (docsToExport.length === 0) return;

    const headers = ['Doc_Numero', 'Fecha', 'Proveedor_Cliente', 'CIF', 'Tipo_Cuenta', 'Codigo_Cuenta', 'Concepto', 'Debe_EUR', 'Haber_EUR', 'Estado'];
    const rows: string[] = [headers.join(';')];

    docsToExport.forEach(doc => {
      doc.asiento.forEach(item => {
        rows.push([
          `"${doc.numero_documento}"`,
          `"${doc.fecha_emision || ''}"`,
          `"${doc.proveedor}"`,
          `"${doc.cif}"`,
          `"${item.tipo}"`,
          `"${item.codigo}"`,
          `"${item.nombre.replace(/"/g, '""')}"`,
          `"${item.debe.toFixed(2).replace('.', ',')}"`,
          `"${item.haber.toFixed(2).replace('.', ',')}"`,
          `"${item.is_suggested ? 'SUGERIDA' : 'CONFIRMADA'}"`,
        ].join(';'));
      });
    });

    const blob = new Blob(['\uFEFF' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cuentas_contables_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    toast({
      title: 'Exportación completada',
      description: `Se exportaron ${docsToExport.length} documentos.`,
    });
  };

  // Métricas de resumen
  const stats = React.useMemo(() => {
    const total = documents.length;
    const confirmados = documents.filter(d => d.estado_contable === 'aprobado').length;
    const enRevision = documents.filter(d => d.estado_contable === 'revision').length;
    const descuadrados = documents.filter(d => !d.cuadrado && Math.abs(d.diferencia) > 0.05).length;
    const totalSugerencias = documents.reduce((acc, d) => acc + d.sugerencias_pendientes, 0);
    const totalSuma = documents.reduce((acc, d) => acc + d.total, 0);
    const progreso = total > 0 ? Math.round((confirmados / total) * 100) : 100;

    return { total, confirmados, enRevision, descuadrados, totalSugerencias, totalSuma, progreso };
  }, [documents]);

  return (
    <MainLayout>
      <div className="flex-1 space-y-4 p-4 sm:p-6 lg:p-8">
        {/* Encabezado estándar de Muvail */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <PageHeader
            title="Cuentas Contables"
            icon={Layers}
            description="Mapeo contable del PGC: Terceros (Grupo 4), Gastos (Grupo 6) e Impuestos (Grupo 47)"
          >
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRefreshKey(k => k + 1)}
              disabled={loading}
              className="h-8 text-xs gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Actualizar
            </Button>
          </PageHeader>
        </div>

        {/* Selector de Vista: Pestañas */}
        <div className="flex items-center justify-between flex-wrap gap-3 pt-1">
          <div className="flex items-center gap-1 p-1 bg-muted/60 border border-border/60 rounded-lg">
            <button
              onClick={() => setViewTab('documentos')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                viewTab === 'documentos'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              Por Documentos
            </button>
            <button
              onClick={() => setViewTab('cuentas')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                viewTab === 'cuentas'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <FolderTree className="w-3.5 h-3.5" />
              Sumas y Saldos
            </button>
            <button
              onClick={() => setViewTab('mayor')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                viewTab === 'mayor'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              Libro Mayor (Extractos)
            </button>
          </div>

          {/* Resumen y Progreso de Conciliación (Estilo Inbox Pro) */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-lg px-2.5 py-1">
              <span className="text-xs font-medium text-primary">
                {stats.total} docs
              </span>
              <span className="text-primary/40">·</span>
              <span className="text-xs font-mono font-semibold text-foreground">
                {stats.totalSuma.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
              </span>
            </div>

            {/* Barra de progreso de validación */}
            <div className="flex items-center gap-2 bg-muted/60 border border-border/50 rounded-lg px-2.5 py-1 text-xs">
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center justify-between gap-2 text-[10px]">
                  <span className="text-muted-foreground font-medium">Progreso PGC:</span>
                  <span className="font-bold text-foreground">{stats.progreso}%</span>
                </div>
                <div className="w-20 h-1.5 bg-background rounded-full overflow-hidden border border-border/40">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-500 rounded-full"
                    style={{ width: `${stats.progreso}%` }}
                  />
                </div>
              </div>
              <span className="text-[11px] font-mono text-muted-foreground">
                ({stats.confirmados}/{stats.total})
              </span>
            </div>

            {/* Badge de sugerencias pendientes */}
            {stats.totalSugerencias > 0 ? (
              <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2.5 py-1">
                <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                  Por revisar
                </span>
                <span className="inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold">
                  {stats.totalSugerencias}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-2.5 py-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Todo revisado</span>
              </div>
            )}

            {/* Salud / Cuadre */}
            {stats.descuadrados > 0 ? (
              <div className="flex items-center gap-1 bg-rose-500/10 border border-rose-500/20 rounded-lg px-2.5 py-1 text-xs text-rose-600 dark:text-rose-400 font-medium">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>{stats.descuadrados} descuadre(s)</span>
              </div>
            ) : (
              <div className="flex items-center gap-1 bg-muted/40 border border-border/50 rounded-lg px-2 py-1 text-xs text-muted-foreground" title="Todos los asientos cargados están balanceados (Debe = Haber)">
                <Scale className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-[11px] font-medium text-foreground/80">Cuadrado</span>
              </div>
            )}
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════════ */}
        {/* VISTA 1: POR DOCUMENTOS (Con diferenciación explícita de los 3 tipos) */}
        {/* ══════════════════════════════════════════════════════════════════════ */}
        {viewTab === 'documentos' && (
          <div className="space-y-3">
            {/* Barra de Filtros y Guía de Asiento */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Buscar proveedor, CIF, doc o subcuenta..."
                  className="pl-8 bg-background border-border text-xs h-8"
                />
              </div>

              {/* Leyenda concisa del Asiento Contable */}
              <div className="hidden xl:flex items-center gap-2.5 text-[11px] bg-muted/40 border border-border/50 px-2.5 py-1 rounded-md text-muted-foreground">
                <span className="font-semibold text-foreground/80">Asiento:</span>
                <span className="inline-flex items-center gap-1 font-medium text-purple-600 dark:text-purple-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                  Debe (Gasto + IVA)
                </span>
                <span>↔</span>
                <span className="inline-flex items-center gap-1 font-medium text-sky-600 dark:text-sky-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
                  Haber (Tercero)
                </span>
              </div>

              <div className="flex items-center gap-2">
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-36 bg-background border-border text-xs h-8">
                    <SelectValue placeholder="Tipo de doc." />
                  </SelectTrigger>
                  <SelectContent className="text-xs">
                    <SelectItem value="all">Todos los tipos</SelectItem>
                    <SelectItem value="recibidas">Recibidas</SelectItem>
                    <SelectItem value="emitidas">Emitidas</SelectItem>
                    <SelectItem value="tickets">Tickets</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-36 bg-background border-border text-xs h-8">
                    <SelectValue placeholder="Estado" />
                  </SelectTrigger>
                  <SelectContent className="text-xs">
                    <SelectItem value="all">Todos los estados</SelectItem>
                    <SelectItem value="revision">Por revisar</SelectItem>
                    <SelectItem value="aprobado">Confirmados</SelectItem>
                    <SelectItem value="descuadre">Con descuadre</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Tabla de Cuentas Contables */}
            <div className="rounded-lg border border-border bg-card overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse min-w-[760px]">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-muted-foreground font-medium text-[11px]">
                      <th className="py-2.5 px-3 w-10 text-center">
                        <Checkbox
                          checked={
                            filteredDocs.length > 0 && selectedIds.length === filteredDocs.length
                              ? true
                              : selectedIds.length > 0
                              ? 'indeterminate'
                              : false
                          }
                          onCheckedChange={handleToggleSelectAll}
                        />
                      </th>
                      <th className="py-2.5 px-3 w-40">Documento</th>
                      <th className="py-2.5 px-3 w-48">Tercero / Emisor</th>
                      <th className="py-2.5 px-3 text-right w-28">Total</th>
                      <th className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          <span>Subcuentas PGC</span>
                          <span className="text-[10px] text-muted-foreground font-normal">
                            (Debe: Gasto + IVA • Haber: Tercero)
                          </span>
                        </div>
                      </th>
                      <th className="py-2.5 px-3 text-center w-28">Estado</th>
                      <th className="py-2.5 px-3 text-right w-36">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {loading ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-muted-foreground">
                          <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-primary" />
                          Cargando documentos contables...
                        </td>
                      </tr>
                    ) : filteredDocs.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-muted-foreground">
                          No hay documentos para los filtros seleccionados.
                        </td>
                      </tr>
                    ) : (
                      filteredDocs.map(doc => {
                        const isSelected = selectedIds.includes(doc.id_documento);
                        const isExpanded = expandedDocIds.includes(doc.id_documento);
                        const isDescuadrado = !doc.cuadrado;
                        const isCentimos = isDescuadrado && Math.abs(doc.diferencia) <= 0.05;
                        const isTicket = (doc.tipo_documento || '').toLowerCase().includes('ticket');
                        const isAbono = (doc.tipo_documento || '').toLowerCase().includes('abono') || doc.total < 0;
                        const isMissingProvider = !doc.proveedor || doc.proveedor.trim() === '' || doc.proveedor.toUpperCase() === 'N/A';

                        return (
                          <React.Fragment key={doc.id_documento}>
                            <tr
                              className={`hover:bg-muted/30 transition-colors ${
                                isSelected ? 'bg-primary/5' : ''
                              } ${
                                isExpanded ? 'bg-muted/20' : ''
                              } ${
                                isDescuadrado && !isCentimos
                                  ? 'border-l-2 border-l-destructive'
                                  : isCentimos
                                  ? 'border-l-2 border-l-amber-400'
                                  : 'border-l-2 border-l-transparent'
                              }`}
                            >
                              {/* Checkbox */}
                              <td className="py-2.5 px-3 text-center">
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={() => handleToggleSelectDoc(doc.id_documento)}
                                />
                              </td>

                              {/* Documento */}
                              <td className="py-2.5 px-3">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-mono font-semibold text-foreground text-xs">
                                    {doc.numero_documento}
                                  </span>
                                  {isTicket ? (
                                    <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25 font-sans gap-0.5">
                                      <Receipt className="w-2.5 h-2.5" />
                                      Ticket
                                    </Badge>
                                  ) : isAbono ? (
                                    <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/25 font-sans">
                                      Abono
                                    </Badge>
                                  ) : doc.is_issued ? (
                                    <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/25 font-sans">
                                      Emitida
                                    </Badge>
                                  ) : null}
                                </div>
                                <div className="text-[11px] text-muted-foreground mt-0.5">
                                  {doc.fecha_emision ? new Date(doc.fecha_emision).toLocaleDateString('es-ES') : '—'}
                                </div>
                              </td>

                              {/* Tercero */}
                              <td className="py-2.5 px-3">
                                {isMissingProvider ? (
                                  isTicket ? (
                                    <div>
                                      <div className="font-medium text-foreground text-xs flex items-center gap-1">
                                        <Receipt className="w-3 h-3 text-amber-500 shrink-0" />
                                        <span className="truncate">Ticket / Simplificado</span>
                                      </div>
                                      <div className="text-[10px] text-muted-foreground/70 font-mono mt-0.5">
                                        Sin CIF registrado
                                      </div>
                                    </div>
                                  ) : (
                                    <div>
                                      <div className="font-medium text-muted-foreground text-xs italic">
                                        Sin emisor fiscal
                                      </div>
                                      <div className="text-[10px] text-muted-foreground/70 font-mono mt-0.5">
                                        —
                                      </div>
                                    </div>
                                  )
                                ) : (
                                  <div>
                                    <div className="font-medium text-foreground truncate max-w-[190px]" title={doc.proveedor}>
                                      {doc.proveedor}
                                    </div>
                                    <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
                                      {doc.cif}
                                    </div>
                                  </div>
                                )}
                              </td>

                              {/* Total */}
                              <td className="py-2.5 px-3 text-right">
                                <div className={`font-mono font-semibold ${
                                  isAbono ? 'text-rose-600 dark:text-rose-400 font-bold' : 'text-foreground'
                                }`}>
                                  {doc.total.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                                </div>
                                <div className="text-[10px] text-muted-foreground font-mono">
                                  Base: {doc.base_imponible.toFixed(2)} €
                                </div>
                                {doc.total === 0 && (
                                  <span className="inline-block text-[9px] px-1 py-0.2 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 font-sans">
                                    Revisar importe
                                  </span>
                                )}
                              </td>

                              {/* Cuentas Contables con Estructura Clara (Debe y Haber) */}
                              <td className="py-2.5 px-3">
                                <div className="space-y-1.5 py-0.5">
                                  {/* 1. PARTE DEBE (Gasto + IVA) */}
                                  <div className="flex flex-wrap items-center gap-1">
                                    <span className="text-[9px] font-mono font-bold uppercase px-1 py-0.5 rounded bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/25">
                                      DEBE
                                    </span>

                                    {doc.cuentas_gasto.map((gasto, gIdx) => (
                                      <button
                                        key={gIdx}
                                        onClick={(e) => { e.stopPropagation(); setEditingItem({ doc, item: gasto }); }}
                                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-mono border transition-all hover:scale-105 cursor-pointer ${
                                          gasto.is_suggested
                                            ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30 hover:bg-amber-500/20'
                                            : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20'
                                        }`}
                                        title={`${gasto.codigo} - ${gasto.nombre} (Clic para cambiar cuenta)`}
                                      >
                                        <span className="font-bold">{gasto.codigo}</span>
                                        <span className="font-sans text-[10px] text-foreground/80 max-w-[130px] truncate hidden sm:inline">
                                          {gasto.nombre}
                                        </span>
                                        {gasto.is_suggested ? (
                                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                                        ) : (
                                          <Check className="w-2.5 h-2.5 text-emerald-500" />
                                        )}
                                      </button>
                                    ))}

                                    {doc.cuentas_impuesto.length > 0 ? (
                                      doc.cuentas_impuesto.map((imp, iIdx) => (
                                        <button
                                          key={iIdx}
                                          onClick={(e) => { e.stopPropagation(); setEditingItem({ doc, item: imp }); }}
                                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-mono border transition-all hover:scale-105 cursor-pointer ${
                                            imp.is_suggested
                                              ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30 hover:bg-amber-500/20'
                                              : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20'
                                          }`}
                                          title={`IVA: ${imp.codigo} - ${imp.nombre} (Clic para cambiar cuenta)`}
                                        >
                                          <span className="text-[9px] uppercase font-sans font-semibold text-teal-600 dark:text-teal-400">IVA</span>
                                          <span className="font-bold">{imp.codigo}</span>
                                          {imp.is_suggested ? (
                                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                          ) : (
                                            <Check className="w-2.5 h-2.5 text-emerald-500" />
                                          )}
                                        </button>
                                      ))
                                    ) : (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted/40 text-muted-foreground font-mono border border-border/40">
                                        Sin IVA
                                      </span>
                                    )}
                                  </div>

                                  {/* 2. PARTE HABER (Tercero / Banco) */}
                                  {doc.cuenta_tercero && (
                                    <div className="flex items-center gap-1">
                                      <span className="text-[9px] font-mono font-bold uppercase px-1 py-0.5 rounded bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/25">
                                        HABER
                                      </span>
                                      <button
                                        onClick={(e) => { e.stopPropagation(); setEditingItem({ doc, item: doc.cuenta_tercero }); }}
                                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-mono border transition-all hover:scale-105 cursor-pointer ${
                                          doc.cuenta_tercero.is_suggested
                                            ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30 hover:bg-amber-500/20'
                                            : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20'
                                        }`}
                                        title={`${doc.cuenta_tercero.codigo} - ${doc.cuenta_tercero.nombre} (Clic para cambiar cuenta)`}
                                      >
                                        <span className="font-bold">{doc.cuenta_tercero.codigo}</span>
                                        <span className="font-sans text-[10px] text-foreground/80 max-w-[150px] truncate hidden sm:inline">
                                          {doc.cuenta_tercero.codigo.startsWith('400') ? 'Proveedores'
                                            : doc.cuenta_tercero.codigo.startsWith('410') ? 'Acreedores'
                                            : doc.cuenta_tercero.codigo.startsWith('430') ? 'Clientes'
                                            : doc.cuenta_tercero.codigo.startsWith('572') ? 'Bancos c/c'
                                            : doc.cuenta_tercero.codigo.startsWith('570') ? 'Caja efectivo'
                                            : doc.cuenta_tercero.nombre}
                                        </span>
                                        {doc.cuenta_tercero.is_suggested ? (
                                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                                        ) : (
                                          <Check className="w-2.5 h-2.5 text-emerald-500" />
                                        )}
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </td>

                              {/* Estado */}
                              <td className="py-2.5 px-3 text-center w-28">
                                {doc.estado_contable === 'aprobado' ? (
                                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[11px] gap-1">
                                    <Check className="w-3 h-3" />
                                    Confirmado
                                  </Badge>
                                ) : !doc.cuadrado && Math.abs(doc.diferencia) > 0.05 ? (
                                  <Badge variant="outline" className="bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20 text-[11px] gap-1">
                                    <AlertTriangle className="w-3 h-3" /> Descuadre
                                  </Badge>
                                ) : (
                                  <div className="relative inline-flex items-center justify-center">
                                    <Badge variant="outline" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25 text-[11px] font-medium">
                                      Por revisar
                                    </Badge>
                                    {doc.sugerencias_pendientes > 0 && (
                                      <span
                                        className="absolute -top-1.5 -right-1.5 flex h-4 min-w-[16px] px-1 items-center justify-center rounded-full bg-amber-500 text-white text-[9px] font-bold shadow-xs border-2 border-background leading-none"
                                        title={`${doc.sugerencias_pendientes} cuentas sugeridas por revisar`}
                                      >
                                        {doc.sugerencias_pendientes}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </td>

                              {/* Acciones */}
                              <td className="py-2.5 px-3 text-right w-36">
                                <div className="flex items-center justify-end gap-1.5">
                                  {doc.sugerencias_pendientes > 0 && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={(e) => { e.stopPropagation(); handleApproveSingleDoc(doc.id_documento); }}
                                      className="h-7 px-2 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400 font-medium"
                                      title="Aprobar cuentas sugeridas de este documento"
                                    >
                                      <Check className="w-3.5 h-3.5 mr-1" />
                                      Confirmar
                                    </Button>
                                  )}

                                  <Button
                                    size="sm"
                                    variant={isExpanded ? 'secondary' : 'outline'}
                                    onClick={() => toggleExpandDoc(doc.id_documento)}
                                    className={`h-7 px-2 text-xs border-border transition-colors ${
                                      isExpanded ? 'bg-primary/10 text-primary border-primary/30' : 'text-foreground hover:bg-accent'
                                    }`}
                                    title={isExpanded ? 'Ocultar asiento detallado' : 'Ver asiento contable completo'}
                                  >
                                    <BookOpen className="w-3.5 h-3.5 mr-1 text-muted-foreground" />
                                    Asiento
                                    {isExpanded ? (
                                      <ChevronUp className="w-3 h-3 ml-1 text-muted-foreground" />
                                    ) : (
                                      <ChevronDown className="w-3 h-3 ml-1 text-muted-foreground" />
                                    )}
                                  </Button>
                                </div>
                              </td>
                            </tr>

                            {/* Subpanel Expandible con el Asiento Diario Formal */}
                            {isExpanded && (
                              <tr className="bg-muted/15 border-b border-border/80">
                                <td colSpan={7} className="p-3 sm:p-4">
                                  <div className="rounded-lg border border-border bg-card p-3 shadow-xs space-y-3">
                                    <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-border/60">
                                      <div className="flex items-center gap-2">
                                        <BookOpen className="w-4 h-4 text-primary" />
                                        <span className="font-semibold text-xs text-foreground">
                                          Asiento Contable Detallado — {doc.numero_documento}
                                        </span>
                                        <span className="text-[11px] text-muted-foreground font-mono">
                                          ({doc.proveedor})
                                        </span>
                                      </div>

                                      <div className="flex items-center gap-2">
                                        <a
                                          href={`/documento/${doc.id_documento}`}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline px-2.5 py-1 rounded bg-primary/10 border border-primary/20"
                                        >
                                          <ExternalLink className="w-3 h-3" />
                                          Ver factura original
                                        </a>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() => setActiveAsientoDoc(doc)}
                                          className="h-7 text-xs"
                                        >
                                          Abrir en ventana
                                        </Button>
                                      </div>
                                    </div>

                                    {/* Tabla Diario Formal del Asiento */}
                                    <div className="overflow-x-auto rounded border border-border/60 bg-background">
                                      <table className="w-full text-left text-xs border-collapse">
                                        <thead>
                                          <tr className="border-b border-border bg-muted/40 text-[10px] text-muted-foreground uppercase font-semibold">
                                            <th className="py-2 px-3 w-28">Subcuenta</th>
                                            <th className="py-2 px-3">Concepto / Nombre PGC</th>
                                            <th className="py-2 px-3 text-right w-28 text-purple-600 dark:text-purple-400">Debe (€)</th>
                                            <th className="py-2 px-3 text-right w-28 text-sky-600 dark:text-sky-400">Haber (€)</th>
                                            <th className="py-2 px-3 text-center w-28">Origen / Estado</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border/40">
                                          {doc.asiento.map((item, aIdx) => (
                                            <tr key={aIdx} className="hover:bg-muted/30">
                                              <td className="py-2 px-3 font-mono font-bold text-foreground">
                                                <span className="px-1.5 py-0.5 rounded bg-muted border border-border/60">
                                                  {item.codigo}
                                                </span>
                                              </td>
                                              <td className="py-2 px-3 text-foreground/90">
                                                <div className="font-medium">{item.nombre}</div>
                                                {item.justificacion && (
                                                  <div className="text-[10px] text-muted-foreground italic mt-0.5">
                                                    {item.justificacion}
                                                  </div>
                                                )}
                                              </td>
                                              <td className="py-2 px-3 text-right font-mono font-semibold">
                                                {item.debe > 0
                                                  ? <span className="text-purple-600 dark:text-purple-400">{item.debe.toFixed(2)} €</span>
                                                  : <span className="text-muted-foreground/50">—</span>}
                                              </td>
                                              <td className="py-2 px-3 text-right font-mono font-semibold">
                                                {item.haber > 0
                                                  ? <span className="text-sky-600 dark:text-sky-400">{item.haber.toFixed(2)} €</span>
                                                  : <span className="text-muted-foreground/50">—</span>}
                                              </td>
                                              <td className="py-2 px-3 text-center">
                                                {item.is_suggested ? (
                                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-amber-500/10 text-amber-600 border border-amber-500/25">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                                    Sugerida
                                                  </span>
                                                ) : (
                                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                                                    <Check className="w-2.5 h-2.5" />
                                                    Confirmada
                                                  </span>
                                                )}
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                        <tfoot>
                                          <tr className="border-t-2 border-border bg-muted/30 font-semibold text-xs">
                                            <td colSpan={2} className="py-2 px-3 text-right text-muted-foreground">
                                              Sumas del Asiento:
                                            </td>
                                            <td className="py-2 px-3 text-right font-mono text-purple-600 dark:text-purple-400">
                                              {doc.total_debe.toFixed(2)} €
                                            </td>
                                            <td className="py-2 px-3 text-right font-mono text-sky-600 dark:text-sky-400">
                                              {doc.total_haber.toFixed(2)} €
                                            </td>
                                            <td className="py-2 px-3 text-center">
                                              {doc.cuadrado ? (
                                                <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
                                                  <Scale className="w-3 h-3" /> Cuadrado
                                                </span>
                                              ) : (
                                                <span className="inline-flex items-center gap-1 text-[11px] text-rose-600 font-medium">
                                                  <AlertTriangle className="w-3 h-3" /> Descuadre {doc.diferencia.toFixed(2)} €
                                                </span>
                                              )}
                                            </td>
                                          </tr>
                                        </tfoot>
                                      </table>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════ */}
        {/* VISTA 2: POR CUENTAS Y PROVEEDORES (Catálogo agrupado) */}
        {/* ══════════════════════════════════════════════════════════════════════ */}
        {viewTab === 'cuentas' && (
          <div className="space-y-3">
            <div className="p-3 rounded-lg bg-muted/30 border border-border text-xs text-muted-foreground flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <span>
                Agrupa todas las <strong>subcuentas contables activas</strong> en tus documentos, con sus saldos y proveedores vinculados.
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                  <input
                    value={cuentasSearch}
                    onChange={e => setCuentasSearch(e.target.value)}
                    placeholder="Buscar cuenta..."
                    className="pl-6 pr-2 py-1 text-xs bg-background border border-border rounded-md w-36 focus:outline-none focus:ring-1 focus:ring-primary/50 text-foreground"
                  />
                </div>
                <span className="font-semibold text-foreground whitespace-nowrap">
                  {cuentasFiltered.length} / {cuentasGrouped.length} cuentas
                </span>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse min-w-[720px]">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-muted-foreground font-medium text-[11px]">
                      <th className="py-2.5 px-4 w-36">Subcuenta (Código PGC)</th>
                      <th className="py-2.5 px-4 w-36">Parte Contable (Debe / Haber)</th>
                      <th className="py-2.5 px-4">Concepto / Nombre PGC</th>
                      <th className="py-2.5 px-4">Proveedores / Terceros Vinculados</th>
                      <th className="py-2.5 px-4 text-center">Docs</th>
                      <th className="py-2.5 px-4 text-right text-purple-400">Debe (€)</th>
                      <th className="py-2.5 px-4 text-right text-sky-400">Haber (€)</th>
                      <th className="py-2.5 px-4 text-center">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {cuentasFiltered.map((cta, idx) => {
                      const badgeTipo =
                        cta.tipo === 'tercero'
                          ? { label: 'Tercero', pos: '(Haber)', class: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/25' }
                          : cta.tipo === 'gasto'
                          ? { label: 'Gasto', pos: '(Debe)', class: 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/25' }
                          : { label: 'IVA', pos: '(Debe)', class: 'bg-teal-500/15 text-teal-700 dark:text-teal-300 border border-teal-500/25' };

                      const provList = Array.from(cta.proveedores);

                      return (
                        <tr key={idx} className="hover:bg-muted/30 transition-colors">
                          <td className="py-3 px-4 font-mono font-bold text-foreground">
                            <span className="px-2 py-0.5 rounded bg-muted border border-border font-mono text-xs">
                              {cta.codigo}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <span className={`inline-flex items-center gap-1 text-[10px] font-sans font-bold uppercase tracking-wider px-2 py-0.5 rounded ${badgeTipo.class}`}>
                              <span>{badgeTipo.label}</span>
                              <span className="opacity-80 font-normal text-[9px]">{badgeTipo.pos}</span>
                            </span>
                          </td>
                          <td className="py-3 px-4 font-medium text-foreground">
                            {cta.nombre}
                          </td>
                          <td className="py-3 px-4">
                            {provList.length > 0 ? (
                              <div className="flex flex-wrap items-center gap-1 max-w-md">
                                {provList.slice(0, 4).map((p, pIdx) => (
                                  <span key={pIdx} className="px-1.5 py-0.5 rounded text-[11px] bg-muted/60 text-foreground border border-border/50">
                                    {p}
                                  </span>
                                ))}
                                {provList.length > 4 && (
                                  <span className="text-[10px] text-muted-foreground">
                                    +{provList.length - 4} más
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center font-mono">
                            {cta.docsCount}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-semibold">
                            {cta.debe > 0
                              ? <span className="text-purple-600 dark:text-purple-400">{cta.debe.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</span>
                              : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-semibold">
                            {cta.haber > 0
                              ? <span className="text-sky-600 dark:text-sky-400">{cta.haber.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</span>
                              : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {cta.sugerenciasCount === 0 ? (
                              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[10px]">
                                Confirmada
                              </Badge>
                            ) : (
                              <div className="relative inline-flex items-center justify-center">
                                <Badge variant="outline" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25 text-[10px] font-medium">
                                  Por revisar
                                </Badge>
                                {cta.sugerenciasCount > 0 && (
                                  <span
                                    className="absolute -top-1.5 -right-1.5 flex h-4 min-w-[16px] px-1 items-center justify-center rounded-full bg-amber-500 text-white text-[9px] font-bold shadow-xs border-2 border-background leading-none"
                                    title={`${cta.sugerenciasCount} sugerencias pendientes`}
                                  >
                                    {cta.sugerenciasCount}
                                  </span>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {/* ── TFOOT: Balance de Sumas y Saldos ── */}
                  {(() => {
                    const totalDebe = cuentasGrouped.reduce((s, c) => s + c.debe, 0);
                    const totalHaber = cuentasGrouped.reduce((s, c) => s + c.haber, 0);
                    const diff = Math.abs(totalDebe - totalHaber);
                    const cuadrado = diff < 0.01;
                    return (
                      <tfoot>
                        <tr className="border-t-2 border-border bg-muted/50 font-semibold text-xs">
                          <td colSpan={4} className="py-3 px-4 text-right text-muted-foreground">
                            <span className="flex items-center justify-end gap-2">
                              <Scale className="w-3.5 h-3.5" />
                              Balance de Sumas y Saldos
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center font-mono text-muted-foreground">
                            {cuentasGrouped.reduce((s, c) => s + c.docsCount, 0)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-purple-600 dark:text-purple-400">
                            {totalDebe.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-sky-600 dark:text-sky-400">
                            {totalHaber.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {cuadrado ? (
                              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[10px]">
                                ⚖️ Cuadrado
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20 text-[10px]">
                                ⚠ Descuadre {diff.toFixed(2)} €
                              </Badge>
                            )}
                          </td>
                        </tr>
                      </tfoot>
                    );
                  })()}
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════ */}
        {/* VISTA 3: LIBRO MAYOR (Extracto de movimientos por subcuenta PGC)      */}
        {/* ══════════════════════════════════════════════════════════════════════ */}
        {viewTab === 'mayor' && (
          <div className="space-y-4">
            {/* Barra de Filtros y Herramientas del Libro Mayor */}
            <div className="p-3 rounded-lg bg-card border border-border shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-1">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    value={cuentasSearch}
                    onChange={e => setCuentasSearch(e.target.value)}
                    placeholder="Buscar subcuenta, proveedor, CIF o factura..."
                    className="pl-8 bg-background border-border text-xs h-8"
                  />
                </div>

                {/* Filtro rápido por tipo de cuenta */}
                <div className="flex items-center gap-1 p-0.5 bg-muted/60 border border-border/50 rounded-lg">
                  <button
                    onClick={() => setMayorTypeFilter('all')}
                    className={`px-2 py-1 rounded text-[11px] font-medium transition-all ${
                      mayorTypeFilter === 'all'
                        ? 'bg-background text-foreground shadow-xs font-semibold'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Todas ({cuentasGrouped.length})
                  </button>
                  <button
                    onClick={() => setMayorTypeFilter('gasto')}
                    className={`px-2 py-1 rounded text-[11px] font-medium transition-all ${
                      mayorTypeFilter === 'gasto'
                        ? 'bg-purple-500/15 text-purple-700 dark:text-purple-300 font-semibold'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Gastos (Gr. 6)
                  </button>
                  <button
                    onClick={() => setMayorTypeFilter('tercero')}
                    className={`px-2 py-1 rounded text-[11px] font-medium transition-all ${
                      mayorTypeFilter === 'tercero'
                        ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300 font-semibold'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Terceros (Gr. 4/5)
                  </button>
                  <button
                    onClick={() => setMayorTypeFilter('impuesto')}
                    className={`px-2 py-1 rounded text-[11px] font-medium transition-all ${
                      mayorTypeFilter === 'impuesto'
                        ? 'bg-teal-500/15 text-teal-700 dark:text-teal-300 font-semibold'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    IVA (Gr. 47)
                  </button>
                </div>
              </div>

              {/* Botones Expandir / Colapsar todos */}
              <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setExpandedAccountKeys(cuentasFiltered.map(c => `${c.tipo}_${c.codigo}`))}
                  className="h-7 text-xs px-2.5 text-muted-foreground hover:text-foreground"
                >
                  <ChevronDown className="w-3.5 h-3.5 mr-1" />
                  Expandir todas
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setExpandedAccountKeys([])}
                  className="h-7 text-xs px-2.5 text-muted-foreground hover:text-foreground"
                >
                  <ChevronUp className="w-3.5 h-3.5 mr-1" />
                  Colapsar todas
                </Button>
              </div>
            </div>

            {/* Listado de Subcuentas con sus Extractos */}
            {cuentasFiltered.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground rounded-lg border border-border bg-card">
                No se encontraron subcuentas con movimientos para el filtro seleccionado.
              </div>
            ) : (
              <div className="space-y-3">
                {cuentasFiltered.map((cta) => {
                  const accountKey = `${cta.tipo}_${cta.codigo}`;
                  const isAccountExpanded = expandedAccountKeys.includes(accountKey);
                  const badgeTipo =
                    cta.tipo === 'tercero'
                      ? { label: 'Tercero', pos: 'Haber', class: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/25' }
                      : cta.tipo === 'gasto'
                      ? { label: 'Gasto', pos: 'Debe', class: 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/25' }
                      : { label: 'IVA', pos: 'Impuesto', class: 'bg-teal-500/15 text-teal-700 dark:text-teal-300 border border-teal-500/25' };

                  const saldo = cta.debe - cta.haber;

                  return (
                    <div
                      key={accountKey}
                      className="rounded-xl border border-border bg-card shadow-xs overflow-hidden transition-all"
                    >
                      {/* Cabecera de la Cuenta (Click para desplegar extracto) */}
                      <div
                        onClick={() => toggleExpandAccount(accountKey)}
                        className="p-3 sm:p-4 bg-muted/20 hover:bg-muted/40 transition-colors cursor-pointer flex items-center justify-between flex-wrap gap-3 border-b border-border/50"
                      >
                        {/* Lado izquierdo: Código, tipo, nombre, conteo */}
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <span className="px-2 py-0.5 rounded bg-muted border border-border font-mono font-bold text-xs text-foreground">
                            {cta.codigo}
                          </span>
                          <span className={`text-[10px] font-sans font-bold uppercase tracking-wider px-2 py-0.5 rounded ${badgeTipo.class}`}>
                            {badgeTipo.label} · {badgeTipo.pos}
                          </span>
                          <span className="font-semibold text-sm text-foreground">
                            {cta.nombre}
                          </span>
                          <Badge variant="outline" className="text-[10px] bg-muted/60 font-mono">
                            {cta.movimientos.length} doc{cta.movimientos.length !== 1 ? 's' : ''}
                          </Badge>
                          {cta.sugerenciasCount > 0 && (
                            <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25 font-medium gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                              {cta.sugerenciasCount} por revisar
                            </Badge>
                          )}
                        </div>

                        {/* Lado derecho: Totales Debe/Haber, saldo y chevron */}
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-3 text-xs">
                            <div className="text-right">
                              <span className="text-[10px] text-muted-foreground block font-sans">Debe:</span>
                              <span className="font-mono font-semibold text-purple-600 dark:text-purple-400">
                                {cta.debe > 0 ? cta.debe.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }) : '—'}
                              </span>
                            </div>
                            <div className="text-right">
                              <span className="text-[10px] text-muted-foreground block font-sans">Haber:</span>
                              <span className="font-mono font-semibold text-sky-600 dark:text-sky-400">
                                {cta.haber > 0 ? cta.haber.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }) : '—'}
                              </span>
                            </div>
                            <div className="text-right pl-2 border-l border-border/60">
                              <span className="text-[10px] text-muted-foreground block font-sans">Saldo:</span>
                              <span className={`font-mono font-bold ${saldo >= 0 ? 'text-foreground' : 'text-amber-600 dark:text-amber-400'}`}>
                                {Math.abs(saldo).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })} {saldo >= 0 ? 'D' : 'A'}
                              </span>
                            </div>
                          </div>

                          <div className="p-1 rounded hover:bg-muted text-muted-foreground">
                            {isAccountExpanded ? (
                              <ChevronUp className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Cuerpo del Extracto: Movimientos individuales */}
                      {isAccountExpanded && (
                        <div className="overflow-x-auto bg-background/50">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr className="border-b border-border/60 bg-muted/30 text-[10px] text-muted-foreground uppercase font-semibold">
                                <th className="py-2.5 px-3 w-28">Fecha</th>
                                <th className="py-2.5 px-3 w-44">Documento</th>
                                <th className="py-2.5 px-3 w-56">Tercero / CIF</th>
                                <th className="py-2.5 px-3">Concepto Apunte</th>
                                <th className="py-2.5 px-3 text-right w-28 text-purple-600 dark:text-purple-400">Debe (€)</th>
                                <th className="py-2.5 px-3 text-right w-28 text-sky-600 dark:text-sky-400">Haber (€)</th>
                                <th className="py-2.5 px-3 text-center w-28">Estado</th>
                                <th className="py-2.5 px-3 text-right w-28">Acción</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border/40">
                              {cta.movimientos.map((m, mIdx) => {
                                const isTicket = (m.tipoDocumento || '').toLowerCase().includes('ticket');
                                const isAbono = (m.tipoDocumento || '').toLowerCase().includes('abono');
                                return (
                                  <tr key={mIdx} className="hover:bg-muted/20 transition-colors">
                                    <td className="py-2.5 px-3 text-muted-foreground">
                                      {m.fechaEmision ? new Date(m.fechaEmision).toLocaleDateString('es-ES') : '—'}
                                    </td>
                                    <td className="py-2.5 px-3 font-mono font-medium text-foreground">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <a
                                          href={`/documento/${m.documentoId}`}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="text-primary hover:underline inline-flex items-center gap-1"
                                          title="Ver factura original en nueva pestaña"
                                        >
                                          <span>{m.numeroDocumento}</span>
                                          <ExternalLink className="w-2.5 h-2.5" />
                                        </a>
                                        {isTicket ? (
                                          <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 bg-amber-500/10 text-amber-600 border-amber-500/20">
                                            Ticket
                                          </Badge>
                                        ) : isAbono ? (
                                          <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 bg-rose-500/10 text-rose-600 border-rose-500/20">
                                            Abono
                                          </Badge>
                                        ) : null}
                                      </div>
                                    </td>
                                    <td className="py-2.5 px-3">
                                      <div className="font-medium text-foreground truncate max-w-[200px]" title={m.proveedor}>
                                        {m.proveedor && m.proveedor !== 'N/A' ? m.proveedor : 'Ticket / Simplificado'}
                                      </div>
                                      <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                                        {m.cif && m.cif !== 'N/A' ? m.cif : 'Sin CIF'}
                                      </div>
                                    </td>
                                    <td className="py-2.5 px-3 text-foreground/85">
                                      <div className="truncate max-w-sm" title={m.concepto}>
                                        {m.concepto}
                                      </div>
                                    </td>
                                    <td className="py-2.5 px-3 text-right font-mono font-semibold">
                                      {m.debe > 0
                                        ? <span className="text-purple-600 dark:text-purple-400">{m.debe.toFixed(2)} €</span>
                                        : <span className="text-muted-foreground/40">—</span>}
                                    </td>
                                    <td className="py-2.5 px-3 text-right font-mono font-semibold">
                                      {m.haber > 0
                                        ? <span className="text-sky-600 dark:text-sky-400">{m.haber.toFixed(2)} €</span>
                                        : <span className="text-muted-foreground/40">—</span>}
                                    </td>
                                    <td className="py-2.5 px-3 text-center">
                                      {m.isSuggested ? (
                                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/25">
                                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                          Sugerida
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                          <Check className="w-2.5 h-2.5" />
                                          Confirmada
                                        </span>
                                      )}
                                    </td>
                                    <td className="py-2.5 px-3 text-right">
                                      <div className="flex items-center justify-end gap-1">
                                        {m.isSuggested && (
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => handleApproveSingleDoc(m.documentoId)}
                                            className="h-6 px-1.5 text-[11px] text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400"
                                            title="Confirmar subcuenta en este documento"
                                          >
                                            <Check className="w-3 h-3 mr-0.5" />
                                            Confirmar
                                          </Button>
                                        )}
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() => setActiveAsientoDoc(m.rawDoc)}
                                          className="h-6 px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
                                          title="Ver asiento contable completo"
                                        >
                                          <BookOpen className="w-3 h-3 mr-0.5" />
                                          Asiento
                                        </Button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                            <tfoot>
                              <tr className="border-t border-border/80 bg-muted/40 font-semibold text-xs">
                                <td colSpan={4} className="py-2 px-3 text-right text-muted-foreground text-[11px]">
                                  Suma Subcuenta {cta.codigo}:
                                </td>
                                <td className="py-2 px-3 text-right font-mono text-purple-600 dark:text-purple-400">
                                  {cta.debe.toFixed(2)} €
                                </td>
                                <td className="py-2 px-3 text-right font-mono text-sky-600 dark:text-sky-400">
                                  {cta.haber.toFixed(2)} €
                                </td>
                                <td colSpan={2} className="py-2 px-3 text-right font-mono text-foreground text-[11px]">
                                  Saldo: {Math.abs(saldo).toFixed(2)} € {saldo >= 0 ? 'D' : 'A'}
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Modal de Asiento Contable */}
        <AsientoModal
          document={activeAsientoDoc}
          isOpen={!!activeAsientoDoc}
          onClose={() => setActiveAsientoDoc(null)}
          onApproveDoc={handleApproveSingleDoc}
        />

        {/* Diálogo de Edición de Cuenta al Clicar Chip */}
        <EditAccountDialog
          document={editingItem?.doc || null}
          accountItem={editingItem?.item || null}
          isOpen={!!editingItem}
          onClose={() => setEditingItem(null)}
          onSave={handleSaveAccountItem}
        />

        {/* Barra Flotante de Acciones Masivas */}
        <BulkActionBar
          selectedCount={selectedIds.length}
          suggestionsCount={selectedSuggestionsCount}
          onApproveAll={handleApproveBatch}
          onExport={handleExportCsv}
          onClearSelection={() => setSelectedIds([])}
          isProcessing={isProcessingBulk}
        />
      </div>
    </MainLayout>
  );
}
