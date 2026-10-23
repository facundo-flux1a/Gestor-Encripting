'use client';

import * as React from 'react';
import { useCompanyContext } from '@/context/CompanyProvider';
import { MainLayout } from '@/components/layout/main-layout';
import { PageHeader } from '@/components/layout/page-header';
import {
  Search, RefreshCw, Check, Pencil, X,
  SlidersHorizontal, Sparkles, Building2, AlertCircle, CheckCircle2,
  ArrowDownLeft, ArrowUpRight, Zap, HelpCircle, Layers, Coins, History,
  Save, RotateCcw, Scale, BarChart3, CheckCheck, AlertTriangle,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { DEFAULT_TAX_ACCOUNTS } from '@/types/tax-accounts';
import type { TaxAccountsConfig, BalanceAccountRow, BalanceTotalsResponse } from '@/types/tax-accounts';
import { CuentasContablesTutorialProvider } from '@/context/CuentasContablesTutorialProvider';
import { CuentasContablesTutorialRouter } from '@/components/tutorials/CuentasContablesTutorialRouter';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SuggestionDetail {
  codigo: string;
  nombre: string;
  justificacion?: string;
}

interface ProveedorCC {
  empresa_id: number;
  identificador_fiscal: string;
  nombre: string;
  cuenta_compra: string | null;
  cuenta_venta: string | null;
  cuenta_gasto: string | null;
  cuenta_ingreso: string | null;
  cuenta_compra_sugerida: SuggestionDetail | null;
  cuenta_venta_sugerida: SuggestionDetail | null;
  cuenta_gasto_sugerida: SuggestionDetail | null;
  cuenta_ingreso_sugerida: SuggestionDetail | null;
  fecha_modificacion: string | null;
  total_documentos: number;
  roles: string[];
}

export type EntityRole = 'proveedor' | 'cliente';

export interface EntityAccountRow {
  rowId: string;
  empresa_id: number;
  identificador_fiscal: string;
  nombre: string;
  rol: EntityRole;
  
  // Cuenta de la entidad (410xxx o 430xxx)
  cuenta_entidad: string | null;
  cuenta_entidad_sugerida: SuggestionDetail | null;
  cuenta_entidad_field: 'cuenta_compra' | 'cuenta_venta';
  
  // Cuenta operativa (6xxx o 7xxx)
  cuenta_operativa: string | null;
  cuenta_operativa_sugerida: SuggestionDetail | null;
  cuenta_operativa_field: 'cuenta_gasto' | 'cuenta_ingreso';
  
  total_documentos: number;
  fecha_modificacion: string | null;
  hasPendingSuggestion: boolean;
  status: 'confirmada' | 'sugerida' | 'sin_asignar';
}

interface VisibleColumns {
  rol: boolean;
  cif: boolean;
  cuenta_entidad: boolean;
  cuenta_operativa: boolean;
  iva: boolean;
  estado: boolean;
  docs: boolean;
}

const DEFAULT_COLUMNS: VisibleColumns = {
  rol: true,
  cif: false, // Opcional por defecto: Javier pidió 3-4 columnas para no marear
  cuenta_entidad: true,
  cuenta_operativa: true,
  iva: false, // Opcional: configurable desde el gestor de columnas
  estado: true,
  docs: false,
};

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CuentasContablesProveedoresPage() {
  const { selectedCompanyIds } = useCompanyContext();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = React.useState<'entidades' | 'impuestos' | 'totales'>('entidades');

  // Entities state
  const [entities, setEntities] = React.useState<ProveedorCC[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshKey, setRefreshKey] = React.useState(0);

  // Balance state
  const [balanceData, setBalanceData] = React.useState<BalanceTotalsResponse | null>(null);
  const [loadingBalance, setLoadingBalance] = React.useState(false);
  const [balanceYear, setBalanceYear] = React.useState<string>('all');
  const [balanceTrimestre, setBalanceTrimestre] = React.useState<string>('all');
  const [balanceSearch, setBalanceSearch] = React.useState<string>('');
  const [balanceGroupFilter, setBalanceGroupFilter] = React.useState<string>('all');

  // Search
  const [search, setSearch] = React.useState('');

  // Column Visibility Manager
  const [visibleColumns, setVisibleColumns] = React.useState<VisibleColumns>(DEFAULT_COLUMNS);

  // Taxes config state
  const [taxConfig, setTaxConfig] = React.useState<TaxAccountsConfig>(DEFAULT_TAX_ACCOUNTS);
  const [loadingTaxConfig, setLoadingTaxConfig] = React.useState(false);
  const [isSavingTaxConfig, setIsSavingTaxConfig] = React.useState(false);

  // Retroactive Confirmation Modal State
  const [retroactiveModalOpen, setRetroactiveModalOpen] = React.useState(false);
  const [pendingRowAction, setPendingRowAction] = React.useState<{
    row: EntityAccountRow;
    type: 'row' | 'cell';
    cellField?: 'cuenta_compra' | 'cuenta_venta' | 'cuenta_gasto' | 'cuenta_ingreso';
    cellValue?: string;
  } | null>(null);

  // Checkbox Filters (Multi-select)
  const [roleFilters, setRoleFilters] = React.useState<{ proveedor: boolean; cliente: boolean }>({
    proveedor: true,
    cliente: true,
  });

  const [statusFilters, setStatusFilters] = React.useState<{ confirmada: boolean; sugerida: boolean; sin_asignar: boolean }>({
    confirmada: true,
    sugerida: true,
    sin_asignar: true,
  });

  // Edit states
  const [editingKey, setEditingKey] = React.useState<string | null>(null);
  const [editValue, setEditValue] = React.useState('');
  const [isSaving, setIsSaving] = React.useState(false);
  const [isAcceptingAllGlobal, setIsAcceptingAllGlobal] = React.useState(false);

  // Load column visibility from localStorage on mount
  React.useEffect(() => {
    try {
      const saved = localStorage.getItem('muvail_cc_columns_v3');
      if (saved) {
        setVisibleColumns(JSON.parse(saved));
      }
    } catch {
      /* ignore */
    }
  }, []);

  const updateVisibleColumns = (newCols: VisibleColumns) => {
    setVisibleColumns(newCols);
    try {
      localStorage.setItem('muvail_cc_columns_v3', JSON.stringify(newCols));
    } catch {
      /* ignore */
    }
  };

  const toggleColumn = (key: keyof VisibleColumns, val: boolean) => {
    updateVisibleColumns({ ...visibleColumns, [key]: val });
  };

  const resetColumnsPreset = (preset: 'minimal' | 'full') => {
    if (preset === 'minimal') {
      updateVisibleColumns({
        rol: true,
        cif: false,
        cuenta_entidad: true,
        cuenta_operativa: true,
        iva: false,
        estado: true,
        docs: false,
      });
    } else {
      updateVisibleColumns({
        rol: true,
        cif: true,
        cuenta_entidad: true,
        cuenta_operativa: true,
        iva: true,
        estado: true,
        docs: true,
      });
    }
  };

  // ── Load Entities Data ───────────────────────────────────────────────────────

  React.useEffect(() => {
    if (!selectedCompanyIds?.length) { setEntities([]); setLoading(false); return; }
    setLoading(true);
    const params = selectedCompanyIds.map(id => `companyId=${id}`).join('&');
    fetch(`/api/cuentas-contables/proveedores?${params}`)
      .then(r => r.json())
      .then(d => setEntities(d.entities || []))
      .catch(e => toast({ title: 'Error', description: e.message, variant: 'destructive' }))
      .finally(() => setLoading(false));
  }, [selectedCompanyIds, refreshKey]);

  // ── Load Tax Config Data ─────────────────────────────────────────────────────

  React.useEffect(() => {
    const firstCompanyId = selectedCompanyIds?.[0];
    if (!firstCompanyId) return;

    setLoadingTaxConfig(true);
    fetch(`/api/cuentas-contables/impuestos?companyId=${firstCompanyId}`)
      .then(r => r.json())
      .then(d => {
        if (d.config) setTaxConfig(d.config);
      })
      .catch(() => {})
      .finally(() => setLoadingTaxConfig(false));
  }, [selectedCompanyIds]);

  // ── Save Tax Config ─────────────────────────────────────────────────────────

  const handleSaveTaxConfig = async () => {
    const firstCompanyId = selectedCompanyIds?.[0];
    if (!firstCompanyId) {
      toast({ title: 'Selecciona una empresa', description: 'Debes tener una empresa activa.', variant: 'destructive' });
      return;
    }

    setIsSavingTaxConfig(true);
    try {
      const res = await fetch('/api/cuentas-contables/impuestos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: firstCompanyId,
          config: taxConfig,
        }),
      });

      if (!res.ok) throw new Error('Error al guardar configuración de impuestos');
      toast({
        title: '✅ Cuentas de impuestos guardadas',
        description: 'La configuración de IVA e IRPF de la empresa se ha actualizado.',
      });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setIsSavingTaxConfig(false);
    }
  };

  // ── Load Balance Totals Data ────────────────────────────────────────────────

  const loadBalance = React.useCallback(() => {
    const firstCompanyId = selectedCompanyIds?.[0];
    if (!firstCompanyId) return;

    setLoadingBalance(true);
    const params = new URLSearchParams({ companyId: String(firstCompanyId) });
    if (balanceYear !== 'all') params.append('year', balanceYear);
    if (balanceTrimestre !== 'all') params.append('trimestre', balanceTrimestre);

    fetch(`/api/cuentas-contables/balance?${params}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error);
        setBalanceData(d);
      })
      .catch(e => toast({ title: 'Error cargando balance', description: e.message, variant: 'destructive' }))
      .finally(() => setLoadingBalance(false));
  }, [selectedCompanyIds, balanceYear, balanceTrimestre, toast]);

  React.useEffect(() => {
    if (activeTab === 'totales') {
      loadBalance();
    }
  }, [activeTab, loadBalance]);

  const filteredBalanceRows = React.useMemo(() => {
    if (!balanceData?.rows) return [];
    return balanceData.rows.filter(r => {
      if (balanceSearch.trim()) {
        const q = balanceSearch.toLowerCase().trim();
        const matchCuenta = r.cuenta.toLowerCase().includes(q);
        const matchDesc = r.descripcion.toLowerCase().includes(q);
        if (!matchCuenta && !matchDesc) return false;
      }
      if (balanceGroupFilter !== 'all') {
        if (balanceGroupFilter === 'proveedores' && r.grupo !== 'proveedor') return false;
        if (balanceGroupFilter === 'clientes' && r.grupo !== 'cliente') return false;
        if (balanceGroupFilter === 'gastos' && r.grupo !== 'gasto') return false;
        if (balanceGroupFilter === 'ingresos' && r.grupo !== 'ingreso') return false;
        if (balanceGroupFilter === 'impuestos' && r.grupo !== 'impuesto') return false;
      }
      return true;
    });
  }, [balanceData, balanceSearch, balanceGroupFilter]);

  // ── Transform Entities into Single-Role Flat Rows ───────────────────────────

  const allRows = React.useMemo<EntityAccountRow[]>(() => {
    const rows: EntityAccountRow[] = [];

    for (const e of entities) {
      const isProveedor = e.roles.some(r => r === 'proveedor' || r === 'emisor');
      const isCliente = e.roles.some(r => r === 'cliente' || r === 'receptor');

      // 1. Fila de Proveedor
      if (isProveedor || (!isProveedor && !isCliente)) {
        const hasSug = Boolean(
          (!e.cuenta_compra && e.cuenta_compra_sugerida) ||
          (!e.cuenta_gasto && e.cuenta_gasto_sugerida)
        );
        const isConf = Boolean(e.cuenta_compra || e.cuenta_gasto);
        const status = hasSug ? 'sugerida' : (isConf ? 'confirmada' : 'sin_asignar');

        rows.push({
          rowId: `${e.identificador_fiscal}_proveedor`,
          empresa_id: e.empresa_id,
          identificador_fiscal: e.identificador_fiscal,
          nombre: e.nombre,
          rol: 'proveedor',
          cuenta_entidad: e.cuenta_compra,
          cuenta_entidad_sugerida: e.cuenta_compra_sugerida,
          cuenta_entidad_field: 'cuenta_compra',
          cuenta_operativa: e.cuenta_gasto,
          cuenta_operativa_sugerida: e.cuenta_gasto_sugerida,
          cuenta_operativa_field: 'cuenta_gasto',
          total_documentos: e.total_documentos,
          fecha_modificacion: e.fecha_modificacion,
          hasPendingSuggestion: hasSug,
          status,
        });
      }

      // 2. Fila de Cliente
      if (isCliente) {
        const hasSug = Boolean(
          (!e.cuenta_venta && e.cuenta_venta_sugerida) ||
          (!e.cuenta_ingreso && e.cuenta_ingreso_sugerida)
        );
        const isConf = Boolean(e.cuenta_venta || e.cuenta_ingreso);
        const status = hasSug ? 'sugerida' : (isConf ? 'confirmada' : 'sin_asignar');

        rows.push({
          rowId: `${e.identificador_fiscal}_cliente`,
          empresa_id: e.empresa_id,
          identificador_fiscal: e.identificador_fiscal,
          nombre: e.nombre,
          rol: 'cliente',
          cuenta_entidad: e.cuenta_venta,
          cuenta_entidad_sugerida: e.cuenta_venta_sugerida,
          cuenta_entidad_field: 'cuenta_venta',
          cuenta_operativa: e.cuenta_ingreso,
          cuenta_operativa_sugerida: e.cuenta_ingreso_sugerida,
          cuenta_operativa_field: 'cuenta_ingreso',
          total_documentos: e.total_documentos,
          fecha_modificacion: e.fecha_modificacion,
          hasPendingSuggestion: hasSug,
          status,
        });
      }
    }

    return rows;
  }, [entities]);

  // ── Stats Calculations ───────────────────────────────────────────────────────

  const stats = React.useMemo(() => {
    const proveedores = allRows.filter(r => r.rol === 'proveedor').length;
    const clientes = allRows.filter(r => r.rol === 'cliente').length;
    const sugeridas = allRows.filter(r => r.hasPendingSuggestion).length;
    const confirmadas = allRows.filter(r => r.status === 'confirmada').length;
    const sinAsignar = allRows.filter(r => r.status === 'sin_asignar').length;

    return { total: allRows.length, proveedores, clientes, sugeridas, confirmadas, sinAsignar };
  }, [allRows]);

  // ── Filtered Rows ────────────────────────────────────────────────────────────

  const filteredRows = React.useMemo(() => {
    return allRows.filter(row => {
      if (search) {
        const q = search.toLowerCase();
        if (!row.nombre.toLowerCase().includes(q) && !row.identificador_fiscal.toLowerCase().includes(q)) {
          return false;
        }
      }

      const anyRoleChecked = roleFilters.proveedor || roleFilters.cliente;
      if (anyRoleChecked) {
        if (row.rol === 'proveedor' && !roleFilters.proveedor) return false;
        if (row.rol === 'cliente' && !roleFilters.cliente) return false;
      }

      const anyStatusChecked = statusFilters.confirmada || statusFilters.sugerida || statusFilters.sin_asignar;
      if (anyStatusChecked) {
        if (!statusFilters[row.status]) return false;
      }

      return true;
    });
  }, [allRows, search, roleFilters, statusFilters]);

  // ── API Mutators (Actualización canónica y/o histórica) ───────────────────────

  const executeSaveCell = async (
    row: EntityAccountRow,
    field: 'cuenta_compra' | 'cuenta_venta' | 'cuenta_gasto' | 'cuenta_ingreso',
    value: string,
    actualizarHistoricos: boolean
  ) => {
    setIsSaving(true);
    try {
      const fieldMap = {
        cuenta_compra: 'cuentaCompra',
        cuenta_venta: 'cuentaVenta',
        cuenta_gasto: 'cuentaGasto',
        cuenta_ingreso: 'cuentaIngreso',
      };
      const labelMap = {
        cuenta_compra: 'Código Contable Proveedor',
        cuenta_venta: 'Código Contable Cliente',
        cuenta_gasto: 'Cuenta Gasto',
        cuenta_ingreso: 'Cuenta Ingreso',
      };

      const body = {
        empresaId: row.empresa_id,
        identificadorFiscal: row.identificador_fiscal,
        nombreReferencia: row.nombre,
        [fieldMap[field]]: value.trim(),
        actualizarHistoricos,
      };

      const res = await fetch('/api/entidades-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error('Error al guardar');
      toast({
        title: '✅ Cuenta guardada',
        description: actualizarHistoricos && row.total_documentos > 0
          ? `${row.nombre} → ${labelMap[field]}: ${value.trim()} (aplicado a ${row.total_documentos} facturas pasadas)`
          : `${row.nombre} → ${labelMap[field]}: ${value.trim()}`,
      });
      setRefreshKey(k => k + 1);
      setEditingKey(null);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const executeAcceptRowSuggestions = async (row: EntityAccountRow, actualizarHistoricos: boolean) => {
    setIsSaving(true);
    try {
      const body: Record<string, any> = {
        empresaId: row.empresa_id,
        identificadorFiscal: row.identificador_fiscal,
        nombreReferencia: row.nombre,
        actualizarHistoricos,
      };

      if (row.rol === 'proveedor') {
        if (!row.cuenta_entidad && row.cuenta_entidad_sugerida) {
          body.cuentaCompra = row.cuenta_entidad_sugerida.codigo;
        }
        if (!row.cuenta_operativa && row.cuenta_operativa_sugerida) {
          body.cuentaGasto = row.cuenta_operativa_sugerida.codigo;
        }
      } else {
        if (!row.cuenta_entidad && row.cuenta_entidad_sugerida) {
          body.cuentaVenta = row.cuenta_entidad_sugerida.codigo;
        }
        if (!row.cuenta_operativa && row.cuenta_operativa_sugerida) {
          body.cuentaIngreso = row.cuenta_operativa_sugerida.codigo;
        }
      }

      const res = await fetch('/api/entidades-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error('Error al guardar sugerencias');
      toast({
        title: '✨ Sugerencias aceptadas',
        description: actualizarHistoricos && row.total_documentos > 0
          ? `${row.nombre} configurado y aplicado a sus ${row.total_documentos} facturas históricas.`
          : `${row.nombre} configurado para futuras facturas.`,
      });
      setRefreshKey(k => k + 1);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  // ── Dispatchers con Diálogo de Retroactividad ────────────────────────────────

  const triggerAcceptRow = (row: EntityAccountRow) => {
    if (row.total_documentos > 0) {
      setPendingRowAction({ row, type: 'row' });
      setRetroactiveModalOpen(true);
    } else {
      executeAcceptRowSuggestions(row, false);
    }
  };

  const triggerSaveCell = (
    row: EntityAccountRow,
    field: 'cuenta_compra' | 'cuenta_venta' | 'cuenta_gasto' | 'cuenta_ingreso',
    value: string
  ) => {
    if (row.total_documentos > 0) {
      setPendingRowAction({ row, type: 'cell', cellField: field, cellValue: value });
      setRetroactiveModalOpen(true);
    } else {
      executeSaveCell(row, field, value, false);
    }
  };

  const handleConfirmRetroactive = (applyToHistoric: boolean) => {
    if (!pendingRowAction) return;
    setRetroactiveModalOpen(false);

    if (pendingRowAction.type === 'row') {
      executeAcceptRowSuggestions(pendingRowAction.row, applyToHistoric);
    } else if (pendingRowAction.type === 'cell' && pendingRowAction.cellField && pendingRowAction.cellValue !== undefined) {
      executeSaveCell(pendingRowAction.row, pendingRowAction.cellField, pendingRowAction.cellValue, applyToHistoric);
    }
    setPendingRowAction(null);
  };

  // ── Aceptar Todas las Sugerencias Globalmente ────────────────────────────────

  const acceptAllGlobalSuggestions = async () => {
    const pendingRows = allRows.filter(r => r.hasPendingSuggestion);
    if (!pendingRows.length) return;

    setIsAcceptingAllGlobal(true);
    try {
      for (const row of pendingRows) {
        const body: Record<string, any> = {
          empresaId: row.empresa_id,
          identificadorFiscal: row.identificador_fiscal,
          nombreReferencia: row.nombre,
          actualizarHistoricos: true, // Propagar automáticamente en lote
        };

        if (row.rol === 'proveedor') {
          if (!row.cuenta_entidad && row.cuenta_entidad_sugerida) {
            body.cuentaCompra = row.cuenta_entidad_sugerida.codigo;
          }
          if (!row.cuenta_operativa && row.cuenta_operativa_sugerida) {
            body.cuentaGasto = row.cuenta_operativa_sugerida.codigo;
          }
        } else {
          if (!row.cuenta_entidad && row.cuenta_entidad_sugerida) {
            body.cuentaVenta = row.cuenta_entidad_sugerida.codigo;
          }
          if (!row.cuenta_operativa && row.cuenta_operativa_sugerida) {
            body.cuentaIngreso = row.cuenta_operativa_sugerida.codigo;
          }
        }

        await fetch('/api/entidades-config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      }

      toast({
        title: '🎉 Todas las sugerencias aplicadas',
        description: `Se configuraron ${pendingRows.length} registros contables y se actualizaron sus documentos.`,
      });
      setRefreshKey(k => k + 1);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setIsAcceptingAllGlobal(false);
    }
  };

  // ── Componente Celda Unitaria ────────────────────────────────────────────────

  const SingleAccountCell = ({
    row,
    field,
    value,
    placeholder,
    label,
    sugerida,
  }: {
    row: EntityAccountRow;
    field: 'cuenta_compra' | 'cuenta_venta' | 'cuenta_gasto' | 'cuenta_ingreso';
    value: string | null;
    placeholder: string;
    label: string;
    sugerida?: SuggestionDetail | null;
  }) => {
    const cellKey = `${row.rowId}_${field}`;
    const isEditing = editingKey === cellKey;

    if (isEditing) {
      return (
        <div className="flex items-center gap-1.5 py-1">
          <Input
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') triggerSaveCell(row, field, editValue);
              if (e.key === 'Escape') setEditingKey(null);
            }}
            className="h-7 w-28 text-xs font-mono bg-background border-primary/50 focus-visible:ring-1 focus-visible:ring-primary"
            autoFocus
            placeholder={placeholder}
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                disabled={isSaving}
                onClick={() => triggerSaveCell(row, field, editValue)}
                className="text-emerald-400 hover:text-emerald-300 p-1 rounded hover:bg-emerald-500/15 transition-colors disabled:opacity-40"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Guardar cuenta contable (Enter)</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setEditingKey(null)}
                className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-muted/50 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Cancelar edición (Esc)</TooltipContent>
          </Tooltip>
        </div>
      );
    }

    if (value) {
      return (
        <div className="flex items-center gap-2 group/cell py-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="font-mono text-xs font-medium text-foreground bg-muted/40 border border-border/70 hover:border-border px-2 py-0.5 rounded flex items-center gap-1.5 transition-colors cursor-default">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                {value}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              Cuenta {label} confirmada y asignada a esta entidad
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => {
                  setEditingKey(cellKey);
                  setEditValue(value);
                }}
                className="opacity-0 group-hover/cell:opacity-100 transition-opacity text-muted-foreground hover:text-foreground p-1 rounded hover:bg-muted"
              >
                <Pencil className="h-3 w-3" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Modificar código de cuenta</TooltipContent>
          </Tooltip>
        </div>
      );
    }

    if (sugerida) {
      return (
        <div className="flex items-center gap-2 flex-wrap py-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                onClick={() => triggerSaveCell(row, field, sugerida.codigo)}
                className="inline-flex items-center gap-1.5 bg-primary/10 border border-primary/30 text-primary dark:text-emerald-300 px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer hover:bg-primary/20 hover:border-primary/50 transition-all shadow-sm"
              >
                <Sparkles className="h-3.5 w-3.5 text-primary shrink-0 animate-pulse" />
                <span className="font-mono font-bold tracking-wide text-foreground">{sugerida.codigo}</span>
                {sugerida.nombre && (
                  <span className="text-[10px] text-muted-foreground max-w-[150px] truncate hidden sm:inline">
                    · {sugerida.nombre}
                  </span>
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs space-y-1">
              <p className="font-semibold text-primary">Sugerencia PGC: {sugerida.codigo} ({sugerida.nombre})</p>
              {sugerida.justificacion && (
                <p className="text-xs text-muted-foreground">{sugerida.justificacion}</p>
              )}
              <p className="text-[10px] text-primary/80 pt-1 font-medium">Click para aceptar esta cuenta</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => {
                  setEditingKey(cellKey);
                  setEditValue(sugerida.codigo);
                }}
                className="text-[11px] text-muted-foreground hover:text-foreground underline decoration-dotted"
              >
                Editar
              </button>
            </TooltipTrigger>
            <TooltipContent>Escribir un código contable diferente</TooltipContent>
          </Tooltip>
        </div>
      );
    }

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => {
              setEditingKey(cellKey);
              setEditValue('');
            }}
            className="text-xs text-muted-foreground/60 hover:text-primary transition-colors flex items-center gap-1 py-0.5 border border-dashed border-border/60 px-2 py-0.5 rounded hover:border-primary/40"
          >
            <span className="text-[11px]">+ Asignar {label}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent>Asignar manualmente una cuenta contable</TooltipContent>
      </Tooltip>
    );
  };

  return (
    <TooltipProvider delayDuration={150}>
      <CuentasContablesTutorialProvider>
        <CuentasContablesTutorialRouter isDataLoading={loading} />
        <MainLayout>
          <PageHeader
            title="Cuentas Contables"
            icon={Scale}
            data-tutorial="cc-header"
          >
            <span className="hidden sm:inline-flex text-xs font-normal text-muted-foreground bg-muted/50 border border-border px-2.5 py-1 rounded-full">
              PGC Español
            </span>
          </PageHeader>

          <div className="flex-1 overflow-auto px-4 pb-24 space-y-5 pt-3 max-w-7xl mx-auto w-full">
            {/* Header Secundario: Descripción y Pestañas */}
            <div className="flex items-center justify-between gap-4 flex-wrap border-b border-border/60 pb-3">
              <div>
                <p className="text-xs text-muted-foreground">
                  Configuración canónica por entidad (41xxx/43xxx) e impuestos globales (472xxx/477xxx) para exportación a A3
                </p>
              </div>

              {/* Selector de Pestañas Superiores */}
              <div className="flex items-center p-1 bg-muted/50 border border-border/80 rounded-xl text-xs font-medium shadow-sm" data-tutorial="cc-tabs">
                <button
                  onClick={() => setActiveTab('entidades')}
                  data-tutorial="cc-tab-entidades"
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all",
                    activeTab === 'entidades'
                      ? "bg-background text-foreground shadow-sm font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Building2 className="h-3.5 w-3.5 text-sky-500 dark:text-sky-400" />
                  <span>Cuentas por Entidad</span>
                </button>

                <button
                  onClick={() => setActiveTab('impuestos')}
                  data-tutorial="cc-tab-impuestos"
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all",
                    activeTab === 'impuestos'
                      ? "bg-background text-foreground shadow-sm font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Coins className="h-3.5 w-3.5 text-amber-500 dark:text-amber-400" />
                  <span>Cuentas de Impuestos (IVA/IRPF)</span>
                </button>

                <button
                  onClick={() => setActiveTab('totales')}
                  data-tutorial="cc-tab-totales"
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all",
                    activeTab === 'totales'
                      ? "bg-background text-foreground shadow-sm font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Scale className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Balance y Totales CC</span>
                </button>
              </div>
            </div>

          {/* ══════════════════════════════════════════════════════════════════════ */}
          {/* PESTAÑA 1: CUENTAS POR ENTIDAD (PROVEEDORES Y CLIENTES)               */}
          {/* ══════════════════════════════════════════════════════════════════════ */}
          {activeTab === 'entidades' && (
            <div className="space-y-5">
              {/* Controles de Vista de Entidades */}
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="text-xs text-muted-foreground">
                  Vista canónica plana por rol: 1 código contable y 1 cuenta operativa por fila.
                </div>

                <div className="flex items-center gap-2">
                  {/* Gestor de Columnas */}
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8 border-border hover:bg-muted/50" data-tutorial="cc-columns-btn">
                        <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>Columnas</span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-60 p-3 space-y-3 bg-card border-border shadow-xl">
                      <div className="flex items-center justify-between pb-1.5 border-b border-border/60">
                        <span className="text-xs font-semibold text-foreground">Gestionar Columnas</span>
                        <span className="text-[10px] text-muted-foreground">Personalizar vista</span>
                      </div>

                      <div className="space-y-2 text-xs">
                        <label className="flex items-center justify-between cursor-pointer hover:bg-muted/40 px-2 py-1 rounded">
                          <span className="font-medium text-foreground">Rol (Proveedor/Cliente)</span>
                          <Checkbox
                            checked={visibleColumns.rol}
                            onCheckedChange={c => toggleColumn('rol', Boolean(c))}
                            className="h-3.5 w-3.5"
                          />
                        </label>

                        <label className="flex items-center justify-between cursor-pointer hover:bg-muted/40 px-2 py-1 rounded">
                          <span className="font-medium text-foreground">CIF / NIF</span>
                          <Checkbox
                            checked={visibleColumns.cif}
                            onCheckedChange={c => toggleColumn('cif', Boolean(c))}
                            className="h-3.5 w-3.5"
                          />
                        </label>

                        <label className="flex items-center justify-between cursor-pointer hover:bg-muted/40 px-2 py-1 rounded">
                          <span className="font-medium text-foreground">Código Contable (4xx)</span>
                          <Checkbox
                            checked={visibleColumns.cuenta_entidad}
                            onCheckedChange={c => toggleColumn('cuenta_entidad', Boolean(c))}
                            className="h-3.5 w-3.5"
                          />
                        </label>

                        <label className="flex items-center justify-between cursor-pointer hover:bg-muted/40 px-2 py-1 rounded">
                          <span className="font-medium text-foreground">Gasto / Ingreso (6xx/7xx)</span>
                          <Checkbox
                            checked={visibleColumns.cuenta_operativa}
                            onCheckedChange={c => toggleColumn('cuenta_operativa', Boolean(c))}
                            className="h-3.5 w-3.5"
                          />
                        </label>

                        <label className="flex items-center justify-between cursor-pointer hover:bg-muted/40 px-2 py-1 rounded">
                          <span className="font-medium text-foreground">Cuenta IVA Asociada</span>
                          <Checkbox
                            checked={visibleColumns.iva}
                            onCheckedChange={c => toggleColumn('iva', Boolean(c))}
                            className="h-3.5 w-3.5"
                          />
                        </label>

                        <label className="flex items-center justify-between cursor-pointer hover:bg-muted/40 px-2 py-1 rounded">
                          <span className="font-medium text-foreground">Estado Asignación</span>
                          <Checkbox
                            checked={visibleColumns.estado}
                            onCheckedChange={c => toggleColumn('estado', Boolean(c))}
                            className="h-3.5 w-3.5"
                          />
                        </label>

                        <label className="flex items-center justify-between cursor-pointer hover:bg-muted/40 px-2 py-1 rounded">
                          <span className="font-medium text-foreground">Facturas (Docs)</span>
                          <Checkbox
                            checked={visibleColumns.docs}
                            onCheckedChange={c => toggleColumn('docs', Boolean(c))}
                            className="h-3.5 w-3.5"
                          />
                        </label>
                      </div>

                      <div className="pt-2 border-t border-border/60 flex items-center justify-between gap-2">
                        <button
                          onClick={() => resetColumnsPreset('minimal')}
                          className="text-[11px] text-primary hover:text-primary/80 font-semibold"
                        >
                          Vista 3-4 cols
                        </button>
                        <button
                          onClick={() => resetColumnsPreset('full')}
                          className="text-[11px] text-muted-foreground hover:text-foreground font-medium"
                        >
                          Todas las cols
                        </button>
                      </div>
                    </PopoverContent>
                  </Popover>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setRefreshKey(k => k + 1)}
                        className="gap-1.5 text-xs h-8"
                      >
                        <RefreshCw className="h-3.5 w-3.5" /> Actualizar
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Recargar datos y sugerencias desde el servidor</TooltipContent>
                  </Tooltip>
                </div>
              </div>

              {/* Banner de Sugerencias IA si existen */}
              {stats.sugeridas > 0 && (
                <div data-tutorial="cc-ai-banner" className="rounded-xl border border-primary/25 bg-primary/[0.04] dark:bg-primary/[0.08] p-4 flex items-center justify-between gap-4 flex-wrap shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-xl bg-primary/10 border border-primary/25 flex items-center justify-center shrink-0 shadow-sm">
                      <Sparkles className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                        {stats.sugeridas} {stats.sugeridas === 1 ? 'registro tiene' : 'registros tienen'} sugerencias de cuentas contables listas
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        La IA detectó las cuentas recomendadas (41xxx, 43xxx, 6xxx, 7xxx) según el PGC español.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          disabled={isAcceptingAllGlobal}
                          onClick={acceptAllGlobalSuggestions}
                          className="h-8 px-3.5 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold rounded-lg shadow-sm gap-1.5 transition-all"
                        >
                          <Zap className="h-3.5 w-3.5 fill-current" />
                          {isAcceptingAllGlobal ? 'Guardando...' : 'Aceptar todas las sugerencias'}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="left">
                        Guarda automáticamente todas las cuentas recomendadas para los {stats.sugeridas} registros pendientes y actualiza sus documentos pasados
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              )}

              {/* Filtros con Checkboxes */}
              <div className="rounded-xl border border-border bg-card p-3.5 space-y-3 shadow-sm" data-tutorial="cc-filters">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nombre de empresa o CIF..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="pl-9 h-8 text-xs bg-background/50 border-border"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-4 pt-1 border-t border-border/40 text-xs">
                  {/* Checkboxes de Rol */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mr-1">
                      Rol:
                    </span>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <label
                          className={cn(
                            "flex items-center gap-2 px-2.5 py-1 rounded-lg border text-xs font-medium cursor-pointer select-none transition-all",
                            roleFilters.proveedor
                              ? "bg-blue-500/15 border-blue-500/40 text-blue-700 dark:text-blue-300"
                              : "bg-muted/20 border-border/40 text-muted-foreground hover:bg-muted/40"
                          )}
                        >
                          <Checkbox
                            checked={roleFilters.proveedor}
                            onCheckedChange={c => setRoleFilters(prev => ({ ...prev, proveedor: Boolean(c) }))}
                            className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600 h-3.5 w-3.5"
                          />
                          <ArrowDownLeft className="h-3 w-3 text-blue-500 dark:text-blue-400" />
                          <span>Proveedores</span>
                          <span className="text-[10px] font-mono opacity-80">({stats.proveedores})</span>
                        </label>
                      </TooltipTrigger>
                      <TooltipContent>Entidades que emiten facturas hacia tu empresa (compras / gastos)</TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <label
                          className={cn(
                            "flex items-center gap-2 px-2.5 py-1 rounded-lg border text-xs font-medium cursor-pointer select-none transition-all",
                            roleFilters.cliente
                              ? "bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-300"
                              : "bg-muted/20 border-border/40 text-muted-foreground hover:bg-muted/40"
                          )}
                        >
                          <Checkbox
                            checked={roleFilters.cliente}
                            onCheckedChange={c => setRoleFilters(prev => ({ ...prev, cliente: Boolean(c) }))}
                            className="data-[state=checked]:bg-amber-600 data-[state=checked]:border-amber-600 h-3.5 w-3.5"
                          />
                          <ArrowUpRight className="h-3 w-3 text-amber-500 dark:text-amber-400" />
                          <span>Clientes</span>
                          <span className="text-[10px] font-mono opacity-80">({stats.clientes})</span>
                        </label>
                      </TooltipTrigger>
                      <TooltipContent>Entidades a las que tu empresa les emite facturas (ventas / ingresos)</TooltipContent>
                    </Tooltip>
                  </div>

                  {/* Checkboxes de Estado */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mr-1">
                      Estado:
                    </span>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <label
                          className={cn(
                            "flex items-center gap-2 px-2.5 py-1 rounded-lg border text-xs font-medium cursor-pointer select-none transition-all",
                            statusFilters.sugerida
                              ? "bg-primary/10 border-primary/30 text-primary dark:text-emerald-300 shadow-sm"
                              : "bg-muted/20 border-border/40 text-muted-foreground hover:bg-muted/40"
                          )}
                        >
                          <Checkbox
                            checked={statusFilters.sugerida}
                            onCheckedChange={c => setStatusFilters(prev => ({ ...prev, sugerida: Boolean(c) }))}
                            className="data-[state=checked]:bg-primary data-[state=checked]:border-primary h-3.5 w-3.5"
                          />
                          <Sparkles className="h-3 w-3 text-primary" />
                          <span>Sugerencias IA</span>
                          <span className="text-[10px] font-mono opacity-80">({stats.sugeridas})</span>
                        </label>
                      </TooltipTrigger>
                      <TooltipContent>Registros con cuentas recomendadas por la IA pendientes de aceptar</TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <label
                          className={cn(
                            "flex items-center gap-2 px-2.5 py-1 rounded-lg border text-xs font-medium cursor-pointer select-none transition-all",
                            statusFilters.confirmada
                              ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
                              : "bg-muted/20 border-border/40 text-muted-foreground hover:bg-muted/40"
                          )}
                        >
                          <Checkbox
                            checked={statusFilters.confirmada}
                            onCheckedChange={c => setStatusFilters(prev => ({ ...prev, confirmada: Boolean(c) }))}
                            className="data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600 h-3.5 w-3.5"
                          />
                          <span>Confirmadas</span>
                          <span className="text-[10px] font-mono opacity-80">({stats.confirmadas})</span>
                        </label>
                      </TooltipTrigger>
                      <TooltipContent>Registros con sus cuentas ya configuradas y guardadas</TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <label
                          className={cn(
                            "flex items-center gap-2 px-2.5 py-1 rounded-lg border text-xs font-medium cursor-pointer select-none transition-all",
                            statusFilters.sin_asignar
                              ? "bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-300"
                              : "bg-muted/20 border-border/40 text-muted-foreground hover:bg-muted/40"
                          )}
                        >
                          <Checkbox
                            checked={statusFilters.sin_asignar}
                            onCheckedChange={c => setStatusFilters(prev => ({ ...prev, sin_asignar: Boolean(c) }))}
                            className="data-[state=checked]:bg-amber-600 data-[state=checked]:border-amber-600 h-3.5 w-3.5"
                          />
                          <span>Sin asignar</span>
                          <span className="text-[10px] font-mono opacity-80">({stats.sinAsignar})</span>
                        </label>
                      </TooltipTrigger>
                      <TooltipContent>Registros sin cuentas asignadas ni sugerencias disponibles</TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              </div>

              {/* Tabla Principal */}
              <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm" data-tutorial="cc-table">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted/40 border-b border-border text-muted-foreground text-[11px] font-semibold uppercase tracking-wider">
                        <th className="text-left px-4 py-3.5 min-w-[220px]">
                          <div className="flex items-center gap-1.5">
                            <span>Entidad</span>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <HelpCircle className="h-3 w-3 text-muted-foreground/60 cursor-help" />
                              </TooltipTrigger>
                              <TooltipContent>Nombre fiscal de la empresa</TooltipContent>
                            </Tooltip>
                          </div>
                        </th>

                        {visibleColumns.rol && (
                          <th className="text-left px-4 py-3.5 w-28">Rol</th>
                        )}

                        {visibleColumns.cif && (
                          <th className="text-left px-4 py-3.5 w-28">CIF / NIF</th>
                        )}

                        {visibleColumns.cuenta_entidad && (
                          <th className="text-left px-4 py-3.5 min-w-[200px]">Código Contable (4xx)</th>
                        )}

                        {visibleColumns.cuenta_operativa && (
                          <th className="text-left px-4 py-3.5 min-w-[240px]">Cuenta Gasto / Ingreso</th>
                        )}

                        {visibleColumns.iva && (
                          <th className="text-left px-4 py-3.5 min-w-[170px]">
                            <div className="flex items-center gap-1">
                              <span>Cuenta IVA (47x)</span>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <HelpCircle className="h-3 w-3 text-muted-foreground/60 cursor-help" />
                                </TooltipTrigger>
                                <TooltipContent>Cuenta oficial asignada a las facturas de este rol según la configuración de la empresa</TooltipContent>
                              </Tooltip>
                            </div>
                          </th>
                        )}

                        {visibleColumns.estado && (
                          <th className="text-left px-4 py-3.5 w-36">Estado</th>
                        )}

                        {visibleColumns.docs && (
                          <th className="text-right px-4 py-3.5 w-20">Docs</th>
                        )}

                        <th className="text-center px-4 py-3.5 w-28">Acciones</th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-border">
                      {loading ? (
                        <tr>
                          <td colSpan={10} className="text-center py-14 text-muted-foreground">
                            <div className="flex items-center justify-center gap-2.5">
                              <RefreshCw className="h-4 w-4 animate-spin text-primary" />
                              <span className="font-medium text-xs">Cargando cuentas contables y sugerencias...</span>
                            </div>
                          </td>
                        </tr>
                      ) : filteredRows.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="text-center py-14 text-muted-foreground">
                            <div className="max-w-md mx-auto space-y-2 px-4">
                              <p className="font-semibold text-foreground text-sm">
                                {entities.length === 0 ? 'No hay entidades contables aún' : 'Sin resultados'}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {entities.length === 0
                                  ? 'Tus proveedores y clientes aparecerán aquí automáticamente al procesar facturas comerciales para asignarles sus subcuentas 410/430 y 6xx/7xx.'
                                  : 'Ningún registro coincide con los filtros de rol o estado seleccionados.'}
                              </p>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        filteredRows.map((row, rowIndex) => {
                          const isProveedor = row.rol === 'proveedor';
                          const defaultIvaAccount = isProveedor
                            ? (taxConfig.iva_soportado_21 || '47200000')
                            : (taxConfig.iva_repercutido_21 || '47700000');

                          return (
                            <tr
                              key={row.rowId}
                              data-tutorial={rowIndex === 0 ? "cc-first-row" : undefined}
                              className="hover:bg-muted/20 transition-colors group"
                            >
                              {/* Entidad */}
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-3">
                                  <div
                                    className={cn(
                                      "h-8 w-8 rounded-lg flex items-center justify-center shrink-0 border",
                                      isProveedor
                                        ? "bg-blue-500/15 border-blue-500/30 text-blue-400"
                                        : "bg-amber-500/15 border-amber-500/30 text-amber-400"
                                    )}
                                  >
                                    <Building2 className="h-4 w-4" />
                                  </div>
                                  <div className="min-w-0">
                                    <span className="font-semibold text-foreground text-xs block truncate" title={row.nombre}>
                                      {row.nombre}
                                    </span>
                                    {!visibleColumns.cif && (
                                      <span className="text-[10px] font-mono text-muted-foreground/75 block">
                                        {row.identificador_fiscal}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </td>

                              {/* Rol */}
                              {visibleColumns.rol && (
                                <td className="px-4 py-3 whitespace-nowrap">
                                  {isProveedor ? (
                                    <Badge className="bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30 text-[10px] font-medium gap-1">
                                      <ArrowDownLeft className="h-3 w-3 text-blue-500 dark:text-blue-400" /> Proveedor
                                    </Badge>
                                  ) : (
                                    <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 text-[10px] font-medium gap-1">
                                      <ArrowUpRight className="h-3 w-3 text-amber-500 dark:text-amber-400" /> Cliente
                                    </Badge>
                                  )}
                                </td>
                              )}

                              {/* CIF */}
                              {visibleColumns.cif && (
                                <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                                  {row.identificador_fiscal}
                                </td>
                              )}

                              {/* Código Contable (4xx) */}
                              {visibleColumns.cuenta_entidad && (
                                <td className="px-4 py-3">
                                  <SingleAccountCell
                                    row={row}
                                    field={row.cuenta_entidad_field}
                                    value={row.cuenta_entidad}
                                    placeholder={isProveedor ? "41000000" : "43000000"}
                                    label={isProveedor ? "Código Proveedor" : "Código Cliente"}
                                    sugerida={row.cuenta_entidad_sugerida}
                                  />
                                </td>
                              )}

                              {/* Cuenta Gasto / Ingreso (6xx / 7xx) */}
                              {visibleColumns.cuenta_operativa && (
                                <td className="px-4 py-3">
                                  <SingleAccountCell
                                    row={row}
                                    field={row.cuenta_operativa_field}
                                    value={row.cuenta_operativa}
                                    placeholder={isProveedor ? "6230000" : "7050000"}
                                    label={isProveedor ? "Cuenta Gasto" : "Cuenta Ingreso"}
                                    sugerida={row.cuenta_operativa_sugerida}
                                  />
                                </td>
                              )}

                              {/* Cuenta IVA (47x) (Opcional en selector) */}
                              {visibleColumns.iva && (
                                <td className="px-4 py-3">
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="font-mono text-xs text-muted-foreground bg-muted/40 border border-border/60 px-2 py-0.5 rounded cursor-help inline-flex items-center gap-1">
                                        <Coins className="h-3 w-3 text-amber-400/80" />
                                        {defaultIvaAccount}
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      {isProveedor
                                        ? `IVA Soportado: se asigna ${defaultIvaAccount} en compras de este proveedor según la regla de la empresa`
                                        : `IVA Repercutido: se asigna ${defaultIvaAccount} en ventas de este cliente según la regla de la empresa`}
                                    </TooltipContent>
                                  </Tooltip>
                                </td>
                              )}

                              {/* Estado */}
                              {visibleColumns.estado && (
                                <td className="px-4 py-3 whitespace-nowrap">
                                  {row.status === 'sugerida' && (
                                    <Badge className="bg-primary/10 text-primary dark:text-emerald-300 border-primary/30 text-[10px] font-semibold gap-1 animate-pulse shadow-sm">
                                      <Sparkles className="h-3 w-3 text-primary" /> Sugerencias listas
                                    </Badge>
                                  )}
                                  {row.status === 'confirmada' && (
                                    <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px] font-medium gap-1">
                                      <CheckCircle2 className="h-3 w-3" /> Confirmada
                                    </Badge>
                                  )}
                                  {row.status === 'sin_asignar' && (
                                    <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-[10px] font-medium gap-1">
                                      <AlertCircle className="h-3 w-3" /> Sin asignar
                                    </Badge>
                                  )}
                                </td>
                              )}

                              {/* Docs */}
                              {visibleColumns.docs && (
                                <td className="px-4 py-3 text-right font-mono text-xs text-muted-foreground">
                                  {row.total_documentos}
                                </td>
                              )}

                              {/* Acciones */}
                              <td className="px-4 py-3 text-center">
                                {row.hasPendingSuggestion ? (
                                  <Button
                                    size="sm"
                                    disabled={isSaving}
                                    onClick={() => triggerAcceptRow(row)}
                                    className="h-6 px-2.5 bg-primary hover:bg-primary/90 text-primary-foreground text-[11px] font-semibold rounded shadow-sm gap-1 transition-all"
                                  >
                                    <Check className="h-3 w-3" /> Aceptar
                                  </Button>
                                ) : row.status === 'confirmada' ? (
                                  <span className="text-[11px] text-emerald-400/80 font-medium flex items-center justify-center gap-1">
                                    <CheckCircle2 className="h-3 w-3 text-emerald-400" /> Listo
                                  </span>
                                ) : (
                                  <span className="text-[11px] text-muted-foreground/50">—</span>
                                )}
                              </td>
                            </tr>
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
          {/* PESTAÑA 2: CUENTAS DE IMPUESTOS (IVA E IRPF POR EMPRESA)              */}
          {/* ══════════════════════════════════════════════════════════════════════ */}
          {activeTab === 'impuestos' && (
            <div className="space-y-6" data-tutorial="cc-taxes-container">
              <div className="rounded-xl border border-border bg-card p-5 space-y-6 shadow-sm">
                <div>
                  <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Coins className="h-4 w-4 text-amber-400" />
                    Cuentas de Impuestos Maestras (Plan General Contable)
                  </h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    Define a qué subcuentas oficiales se imputan los impuestos detectados en las facturas al subir. Los valores por defecto siguen el estándar PGC español.
                  </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Bloque Compras (IVA Soportado - 472) */}
                  <div className="p-4 rounded-xl border border-sky-500/25 bg-sky-500/[0.04] dark:bg-sky-950/20 space-y-4 shadow-sm">
                    <div className="flex items-center justify-between pb-2 border-b border-sky-500/20">
                      <div className="flex items-center gap-2">
                        <ArrowDownLeft className="h-4 w-4 text-sky-500 dark:text-sky-400" />
                        <span className="text-xs font-semibold text-sky-700 dark:text-sky-300">
                          Facturas Recibidas (Compras / Gastos - 472)
                        </span>
                      </div>
                      <Badge className="bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30 text-[10px]">IVA Soportado</Badge>
                    </div>

                    <div className="space-y-3 text-xs">
                      <div className="flex items-center justify-between gap-4">
                        <label className="text-foreground font-medium">IVA General (21%):</label>
                        <Input
                          value={taxConfig.iva_soportado_21}
                          onChange={e => setTaxConfig(prev => ({ ...prev, iva_soportado_21: e.target.value }))}
                          className="h-8 w-36 text-xs font-mono bg-background"
                          placeholder="47200000"
                        />
                      </div>

                      <div className="flex items-center justify-between gap-4">
                        <label className="text-foreground font-medium">IVA Reducido (10%):</label>
                        <Input
                          value={taxConfig.iva_soportado_10}
                          onChange={e => setTaxConfig(prev => ({ ...prev, iva_soportado_10: e.target.value }))}
                          className="h-8 w-36 text-xs font-mono bg-background"
                          placeholder="47200000"
                        />
                      </div>

                      <div className="flex items-center justify-between gap-4">
                        <label className="text-foreground font-medium">IVA Superreducido (4%):</label>
                        <Input
                          value={taxConfig.iva_soportado_4}
                          onChange={e => setTaxConfig(prev => ({ ...prev, iva_soportado_4: e.target.value }))}
                          className="h-8 w-36 text-xs font-mono bg-background"
                          placeholder="47200000"
                        />
                      </div>

                      <div className="flex items-center justify-between gap-4">
                        <label className="text-foreground font-medium">IVA Exento / Operaciones 0%:</label>
                        <Input
                          value={taxConfig.iva_soportado_0}
                          onChange={e => setTaxConfig(prev => ({ ...prev, iva_soportado_0: e.target.value }))}
                          className="h-8 w-36 text-xs font-mono bg-background"
                          placeholder="47200000"
                        />
                      </div>

                      <div className="pt-2 border-t border-border/40 space-y-3">
                        <div className="flex items-center justify-between gap-4">
                          <label className="text-foreground font-medium">Retención IRPF Profesional (15%):</label>
                          <Input
                            value={taxConfig.retencion_irpf_15}
                            onChange={e => setTaxConfig(prev => ({ ...prev, retencion_irpf_15: e.target.value }))}
                            className="h-8 w-36 text-xs font-mono bg-background"
                            placeholder="47510000"
                          />
                        </div>

                        <div className="flex items-center justify-between gap-4">
                          <label className="text-foreground font-medium">Retención IRPF Alquiler (19%):</label>
                          <Input
                            value={taxConfig.retencion_irpf_19}
                            onChange={e => setTaxConfig(prev => ({ ...prev, retencion_irpf_19: e.target.value }))}
                            className="h-8 w-36 text-xs font-mono bg-background"
                            placeholder="47510000"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Bloque Ventas (IVA Repercutido - 477) */}
                  <div className="p-4 rounded-xl border border-amber-500/25 bg-amber-500/[0.04] dark:bg-amber-950/20 space-y-4 shadow-sm">
                    <div className="flex items-center justify-between pb-2 border-b border-amber-500/20">
                      <div className="flex items-center gap-2">
                        <ArrowUpRight className="h-4 w-4 text-amber-500 dark:text-amber-400" />
                        <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                          Facturas Emitidas (Ventas / Ingresos - 477)
                        </span>
                      </div>
                      <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 text-[10px]">IVA Repercutido</Badge>
                    </div>

                    <div className="space-y-3 text-xs">
                      <div className="flex items-center justify-between gap-4">
                        <label className="text-foreground font-medium">IVA General (21%):</label>
                        <Input
                          value={taxConfig.iva_repercutido_21}
                          onChange={e => setTaxConfig(prev => ({ ...prev, iva_repercutido_21: e.target.value }))}
                          className="h-8 w-36 text-xs font-mono bg-background"
                          placeholder="47700000"
                        />
                      </div>

                      <div className="flex items-center justify-between gap-4">
                        <label className="text-foreground font-medium">IVA Reducido (10%):</label>
                        <Input
                          value={taxConfig.iva_repercutido_10}
                          onChange={e => setTaxConfig(prev => ({ ...prev, iva_repercutido_10: e.target.value }))}
                          className="h-8 w-36 text-xs font-mono bg-background"
                          placeholder="47700000"
                        />
                      </div>

                      <div className="flex items-center justify-between gap-4">
                        <label className="text-foreground font-medium">IVA Superreducido (4%):</label>
                        <Input
                          value={taxConfig.iva_repercutido_4}
                          onChange={e => setTaxConfig(prev => ({ ...prev, iva_repercutido_4: e.target.value }))}
                          className="h-8 w-36 text-xs font-mono bg-background"
                          placeholder="47700000"
                        />
                      </div>

                      <div className="flex items-center justify-between gap-4">
                        <label className="text-foreground font-medium">IVA Exento / Operaciones 0%:</label>
                        <Input
                          value={taxConfig.iva_repercutido_0}
                          onChange={e => setTaxConfig(prev => ({ ...prev, iva_repercutido_0: e.target.value }))}
                          className="h-8 w-36 text-xs font-mono bg-background"
                          placeholder="47700000"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Bloque Operaciones Exteriores (Inversión Sujeto Pasivo - ISP) */}
                  <div className="p-4 rounded-xl border border-sky-500/20 bg-sky-950/10 space-y-4 md:col-span-2">
                    <div className="flex items-center justify-between pb-2 border-b border-sky-500/20 flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-sky-400" />
                        <span className="text-xs font-semibold text-sky-300">
                          Operaciones Exteriores (Inversión del Sujeto Pasivo - ISP UE / Extracomunitarias)
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className="bg-sky-500/20 text-sky-300 text-[10px]">Autofactura / Espejo 472-477</Badge>
                      </div>
                    </div>

                    <p className="text-[11px] text-muted-foreground">
                      Subcuentas para autorrepercusión de IVA en adquisiciones intracomunitarias (UE) e importaciones de servicios (EE.UU. / terceros países). En la contabilidad española, el saldo neto es 0 € (472 menos 477), pero deben registrarse en sus casillas específicas del Modelo 303.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-1">
                      {/* Intracomunitario UE */}
                      <div className="space-y-3 text-xs bg-background/40 p-3 rounded-lg border border-border/50">
                        <div className="font-semibold text-foreground flex items-center gap-1.5 pb-1 border-b border-border/40">
                          <span>🇪🇺 Proveedores Unión Europea (Intracomunitario)</span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <label className="text-muted-foreground font-medium">IVA Soportado UE (21%):</label>
                          <Input
                            value={taxConfig.iva_intra_soportado_21}
                            onChange={e => setTaxConfig(prev => ({ ...prev, iva_intra_soportado_21: e.target.value }))}
                            className="h-8 w-36 text-xs font-mono bg-background"
                            placeholder="47210000"
                          />
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <label className="text-muted-foreground font-medium">IVA Repercutido UE (21%):</label>
                          <Input
                            value={taxConfig.iva_intra_repercutido_21}
                            onChange={e => setTaxConfig(prev => ({ ...prev, iva_intra_repercutido_21: e.target.value }))}
                            className="h-8 w-36 text-xs font-mono bg-background"
                            placeholder="47720000"
                          />
                        </div>
                      </div>

                      {/* Extracomunitario Terceros Países */}
                      <div className="space-y-3 text-xs bg-background/40 p-3 rounded-lg border border-border/50">
                        <div className="font-semibold text-foreground flex items-center gap-1.5 pb-1 border-b border-border/40">
                          <span>🌍 Proveedores Extracomunitarios (EE.UU., UK, etc.)</span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <label className="text-muted-foreground font-medium">IVA Soportado Extra (21%):</label>
                          <Input
                            value={taxConfig.iva_extra_soportado_21}
                            onChange={e => setTaxConfig(prev => ({ ...prev, iva_extra_soportado_21: e.target.value }))}
                            className="h-8 w-36 text-xs font-mono bg-background"
                            placeholder="47200021"
                          />
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <label className="text-muted-foreground font-medium">IVA Repercutido Extra (21%):</label>
                          <Input
                            value={taxConfig.iva_extra_repercutido_21}
                            onChange={e => setTaxConfig(prev => ({ ...prev, iva_extra_repercutido_21: e.target.value }))}
                            className="h-8 w-36 text-xs font-mono bg-background"
                            placeholder="47700021"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Acciones de Guardar */}
                <div className="flex items-center justify-between pt-4 border-t border-border flex-wrap gap-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setTaxConfig(DEFAULT_TAX_ACCOUNTS)}
                    className="text-xs text-muted-foreground gap-1.5"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Restablecer a valores PGC estándar
                  </Button>

                  <Button
                    size="sm"
                    disabled={isSavingTaxConfig || loadingTaxConfig}
                    onClick={handleSaveTaxConfig}
                    className="h-8 px-4 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg shadow-md gap-1.5 transition-all"
                  >
                    <Save className="h-3.5 w-3.5" />
                    {isSavingTaxConfig ? 'Guardando...' : 'Guardar Cuentas de Impuestos'}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════════ */}
          {/* PESTAÑA 3: BALANCE Y TOTALES DE CUENTAS CONTABLES                      */}
          {/* ══════════════════════════════════════════════════════════════════════ */}
          {activeTab === 'totales' && (
            <div className="space-y-5" data-tutorial="cc-balance-container">
              {/* Card Principal */}
              <div className="p-6 rounded-2xl bg-card border border-border shadow-sm space-y-6">
                {/* Header del Balance con Filtros */}
                <div className="flex items-start justify-between gap-4 flex-wrap pb-4 border-b border-border/60">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Scale className="h-5 w-5 text-emerald-400" />
                      <h2 className="text-base font-bold text-foreground">
                        Balance y Totales de Cuentas Contables (Sumas y Saldos)
                      </h2>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Consolidación de importes al Debe y al Haber de todas las facturas procesadas. Comprobación del cuadre para exportar a A3.
                    </p>
                  </div>

                  {/* Controles de Filtro (Trimestre, Año y Refrescar) */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Selector de Trimestre */}
                    <div className="flex items-center p-1 bg-muted/40 border border-border rounded-lg text-xs">
                      {(['all', '1', '2', '3', '4'] as const).map(q => (
                        <button
                          key={q}
                          onClick={() => setBalanceTrimestre(q)}
                          className={cn(
                            "px-2.5 py-1 rounded text-xs font-medium transition-colors",
                            balanceTrimestre === q
                              ? "bg-background text-foreground shadow-sm font-semibold"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          {q === 'all' ? 'Todo el año' : `${q}T`}
                        </button>
                      ))}
                    </div>

                    {/* Selector de Año */}
                    <div className="flex items-center p-1 bg-muted/40 border border-border rounded-lg text-xs">
                      {(['all', '2026', '2025'] as const).map(y => (
                        <button
                          key={y}
                          onClick={() => setBalanceYear(y)}
                          className={cn(
                            "px-2.5 py-1 rounded text-xs font-medium transition-colors",
                            balanceYear === y
                              ? "bg-background text-foreground shadow-sm font-semibold"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          {y === 'all' ? 'Todos los años' : y}
                        </button>
                      ))}
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={loadBalance}
                      disabled={loadingBalance}
                      className="h-8 gap-1.5 text-xs border-border"
                    >
                      <RefreshCw className={cn("h-3.5 w-3.5", loadingBalance && "animate-spin")} />
                      Actualizar
                    </Button>
                  </div>
                </div>

                {/* 4 Tarjetas de Métricas Resumen (KPIs) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Total DEBE */}
                  <div className="p-4 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.04] dark:bg-emerald-950/20 space-y-1 shadow-sm">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="font-semibold text-emerald-700 dark:text-emerald-400">Total DEBE (Cargos)</span>
                      <ArrowDownLeft className="h-4 w-4 text-emerald-500 dark:text-emerald-400" />
                    </div>
                    <div className="text-xl font-bold font-mono text-emerald-700 dark:text-emerald-300">
                      {(balanceData?.totales.sumaDebe || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                    </div>
                    <p className="text-[10px] text-muted-foreground">Compras, Gastos e IVA Soportado</p>
                  </div>

                  {/* Total HABER */}
                  <div className="p-4 rounded-xl border border-sky-500/25 bg-sky-500/[0.04] dark:bg-sky-950/20 space-y-1 shadow-sm">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="font-semibold text-sky-700 dark:text-sky-400">Total HABER (Abonos)</span>
                      <ArrowUpRight className="h-4 w-4 text-sky-500 dark:text-sky-400" />
                    </div>
                    <div className="text-xl font-bold font-mono text-sky-700 dark:text-sky-300">
                      {(balanceData?.totales.sumaHaber || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                    </div>
                    <p className="text-[10px] text-muted-foreground">Acreedores, Ingresos e IVA Repercutido</p>
                  </div>

                  {/* Estado de Cuadre */}
                  <div className={cn(
                    "p-4 rounded-xl border space-y-1 shadow-sm",
                    balanceData?.totales.isCuadrado
                      ? "border-emerald-500/30 bg-emerald-500/[0.04] dark:bg-emerald-950/20"
                      : "border-amber-500/30 bg-amber-500/[0.04] dark:bg-amber-950/20"
                  )}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-foreground">Cuadre Contable</span>
                      {balanceData?.totales.isCuadrado ? (
                        <CheckCheck className="h-4 w-4 text-emerald-400" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-amber-400" />
                      )}
                    </div>
                    <div className={cn(
                      "text-xl font-bold font-mono",
                      balanceData?.totales.isCuadrado ? "text-emerald-400" : "text-amber-400"
                    )}>
                      {balanceData?.totales.isCuadrado ? "0,00 €" : `${(balanceData?.totales.diferencia || 0).toFixed(2)} €`}
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {balanceData?.totales.isCuadrado ? "✓ Asiento cuadrado (Debe == Haber)" : "⚠️ Diferencia entre Debe y Haber"}
                    </p>
                  </div>

                  {/* Cuentas y Documentos */}
                  <div className="p-4 rounded-xl border border-border/60 bg-muted/20 space-y-1">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">Documentos y Cuentas</span>
                      <Layers className="h-4 w-4 text-primary" />
                    </div>
                    <div className="text-xl font-bold font-mono text-foreground">
                      {balanceData?.totales.totalCuentas || 0} <span className="text-xs font-normal text-muted-foreground">cuentas</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Sobre {balanceData?.totales.totalDocumentos || 0} facturas procesadas
                    </p>
                  </div>
                </div>

                {/* Banner Informativo si hay documentos incompletos */}
                {(balanceData?.totales.documentosIncompletos || 0) > 0 && (
                  <div className="flex items-center gap-3 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-300">
                    <AlertCircle className="h-4 w-4 shrink-0 text-amber-400" />
                    <div>
                      <strong>Atención:</strong> Hay {balanceData?.totales.documentosIncompletos} factura(s) que aún no tienen cuenta contable de proveedor/cliente asignada en la pestaña de entidades.
                    </div>
                  </div>
                )}

                {/* Barra de Filtros: Búsqueda y Selector de Grupo */}
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="relative flex-1 min-w-[240px] max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Buscar cuenta (ej: 410, 472, 629...) o nombre..."
                      value={balanceSearch}
                      onChange={e => setBalanceSearch(e.target.value)}
                      className="pl-9 h-8 text-xs bg-background"
                    />
                  </div>

                  {/* Filtro por Grupos Contables */}
                  <div className="flex items-center gap-1.5 flex-wrap text-xs">
                    {[
                      { id: 'all', label: 'Todas' },
                      { id: 'proveedores', label: 'Acreedores (40/41)' },
                      { id: 'clientes', label: 'Clientes (43)' },
                      { id: 'gastos', label: 'Gastos (6xx)' },
                      { id: 'ingresos', label: 'Ingresos (7xx)' },
                      { id: 'impuestos', label: 'Impuestos (47x)' },
                    ].map(g => (
                      <button
                        key={g.id}
                        onClick={() => setBalanceGroupFilter(g.id)}
                        className={cn(
                          "px-2.5 py-1 rounded-md text-xs font-medium transition-colors border",
                          balanceGroupFilter === g.id
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-muted/30 border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/60"
                        )}
                      >
                        {g.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tabla de Sumas y Saldos */}
                <div className="rounded-xl border border-border/80 overflow-hidden bg-card/60 shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border bg-muted/50 text-muted-foreground font-semibold">
                          <th className="py-2.5 px-4 text-left">Cuenta Contable</th>
                          <th className="py-2.5 px-4 text-left">Descripción / Titular</th>
                          <th className="py-2.5 px-4 text-center">Docs</th>
                          <th className="py-2.5 px-4 text-right">Total DEBE (€)</th>
                          <th className="py-2.5 px-4 text-right">Total HABER (€)</th>
                          <th className="py-2.5 px-4 text-right">Saldo Neto (€)</th>
                          <th className="py-2.5 px-4 text-center">Naturaleza</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40">
                        {loadingBalance ? (
                          <tr>
                            <td colSpan={7} className="py-12 text-center text-muted-foreground">
                              <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-primary" />
                              Calculando balance contable...
                            </td>
                          </tr>
                        ) : filteredBalanceRows.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="py-12 text-center text-muted-foreground">
                              No hay cuentas contables con movimientos para los filtros seleccionados.
                            </td>
                          </tr>
                        ) : (
                          filteredBalanceRows.map(r => (
                            <tr key={r.cuenta} className="hover:bg-muted/30 transition-colors">
                              {/* Cuenta Contable con badge de grupo */}
                              <td className="py-2.5 px-4 font-mono font-bold text-foreground">
                                <span className={cn(
                                  "px-2 py-0.5 rounded text-[11px] font-mono",
                                  r.grupo === 'proveedor' && "bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/30",
                                  r.grupo === 'cliente' && "bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/30",
                                  r.grupo === 'gasto' && "bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30",
                                  r.grupo === 'ingreso' && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30",
                                  r.grupo === 'impuesto' && "bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30",
                                  r.grupo === 'otro' && "bg-muted text-muted-foreground border border-border"
                                )}>
                                  {r.cuenta}
                                </span>
                              </td>

                              {/* Descripción */}
                              <td className="py-2.5 px-4 text-foreground font-medium">
                                {r.descripcion}
                              </td>

                              {/* Número de Movimientos */}
                              <td className="py-2.5 px-4 text-center">
                                <span className="bg-muted px-2 py-0.5 rounded-full text-[10px] text-muted-foreground font-medium">
                                  {r.numMovimientos}
                                </span>
                              </td>

                              {/* Total DEBE */}
                              <td className="py-2.5 px-4 text-right font-mono font-medium">
                                {r.totalDebe > 0 ? (
                                  <span className="text-emerald-700 dark:text-emerald-300 font-semibold">
                                    {r.totalDebe.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground/40">-</span>
                                )}
                              </td>

                              {/* Total HABER */}
                              <td className="py-2.5 px-4 text-right font-mono font-medium">
                                {r.totalHaber > 0 ? (
                                  <span className="text-sky-700 dark:text-sky-300 font-semibold">
                                    {r.totalHaber.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground/40">-</span>
                                )}
                              </td>

                              {/* Saldo Neto */}
                              <td className="py-2.5 px-4 text-right font-mono font-bold text-foreground">
                                {r.saldo.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                              </td>

                              {/* Naturaleza (Deudor / Acreedor) */}
                              <td className="py-2.5 px-4 text-center">
                                {r.tipoSaldo === 'DEUDOR' && (
                                  <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 text-[10px]">
                                    Deudor (Debe)
                                  </Badge>
                                )}
                                {r.tipoSaldo === 'ACREEDOR' && (
                                  <Badge className="bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30 text-[10px]">
                                    Acreedor (Haber)
                                  </Badge>
                                )}
                                {r.tipoSaldo === 'CERO' && (
                                  <Badge variant="outline" className="text-muted-foreground text-[10px]">
                                    Saldada (0 €)
                                  </Badge>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>

                      {/* Pie de Tabla con Totales Consolidados */}
                      {filteredBalanceRows.length > 0 && (
                        <tfoot>
                          <tr className="border-t-2 border-border bg-muted/60 font-bold text-xs">
                            <td colSpan={3} className="py-3 px-4 text-foreground uppercase tracking-wide">
                              Totales Consolidados ({filteredBalanceRows.length} cuentas)
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-emerald-400 text-sm">
                              {(balanceData?.totales.sumaDebe || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-blue-400 text-sm">
                              {(balanceData?.totales.sumaHaber || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                            </td>
                            <td colSpan={2} className="py-3 px-4 text-center">
                              {balanceData?.totales.isCuadrado ? (
                                <span className="inline-flex items-center gap-1.5 text-emerald-400 font-semibold text-xs">
                                  <CheckCheck className="h-4 w-4" />
                                  Cuadre perfecto (0,00 €)
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 text-amber-400 font-semibold text-xs">
                                  <AlertTriangle className="h-4 w-4" />
                                  Diferencia: {(balanceData?.totales.diferencia || 0).toFixed(2)} €
                                </span>
                              )}
                            </td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════════ */}
          {/* DIÁLOGO MODAL: APLICACIÓN RETROACTIVA A FACTURAS ANTERIORES          */}
          {/* ══════════════════════════════════════════════════════════════════════ */}
          <Dialog open={retroactiveModalOpen} onOpenChange={setRetroactiveModalOpen}>
            <DialogContent className="max-w-md bg-card border-border shadow-2xl p-6">
              <DialogHeader className="space-y-2">
                <div className="h-10 w-10 rounded-full bg-primary/10 border border-primary/25 flex items-center justify-center text-primary mb-1">
                  <History className="h-5 w-5" />
                </div>
                <DialogTitle className="text-base font-bold text-foreground">
                  ¿Aplicar también a las facturas anteriores?
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
                  <strong>{pendingRowAction?.row.nombre}</strong> tiene{' '}
                  <span className="font-semibold text-foreground">
                    {pendingRowAction?.row.total_documentos}{' '}
                    {pendingRowAction?.row.total_documentos === 1 ? 'factura registrada' : 'facturas registradas'}
                  </span>{' '}
                  en esta empresa. ¿Deseas aplicar estas cuentas contables a sus facturas ya subidas?
                </DialogDescription>
              </DialogHeader>

              <div className="bg-muted/30 border border-border/60 rounded-lg p-3 my-2 text-xs space-y-1.5 text-muted-foreground">
                <p>• <strong>Actualizar históricas:</strong> Inyecta las cuentas en todas las facturas pasadas de esta entidad para que queden listas para exportar a A3.</p>
                <p>• <strong>Solo futuras:</strong> Guarda la regla canónica solo para los próximos documentos que se suban.</p>
              </div>

              <DialogFooter className="flex flex-col sm:flex-row gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleConfirmRetroactive(false)}
                  className="text-xs h-8 border-border"
                >
                  Solo para futuras facturas
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleConfirmRetroactive(true)}
                  className="text-xs h-8 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold gap-1.5 shadow-sm"
                >
                  <Check className="h-3.5 w-3.5" />
                  Sí, actualizar las {pendingRowAction?.row.total_documentos} facturas
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </MainLayout>
      </CuentasContablesTutorialProvider>
    </TooltipProvider>
  );
}
