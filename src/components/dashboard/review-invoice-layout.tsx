'use client';

import React, { useMemo } from 'react';
import { type Document, type DocumentUpdatePayload } from '@/lib/types';
import type { UseFormReturn } from 'react-hook-form';
import { useFieldArray, useWatch } from 'react-hook-form';
import { FormField } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { cn, fixMinioUrl } from '@/lib/utils';
import { ChevronLeft, ChevronRight, Save, Loader2, Trash2, PlusCircle, Edit, Lock, X, AlertCircle, CheckCircle2, RefreshCw, Tag, ExternalLink, Eye, Globe, Folder } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { DocumentTypeSelector } from './document-type-selector';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSidebar } from '@/components/ui/sidebar';
import { SyntheticInvoiceViewer } from '@/components/documento/synthetic-invoice-viewer';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const fmtNum = (v: number | string | null | undefined) => {
  const n = parseFloat(String(v ?? 0));
  if (isNaN(n)) return '0,00';
  const [i, d] = n.toFixed(2).split('.');
  return `${i.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${d}`;
};
const fmtEur = (v: number | string | null | undefined) => `${fmtNum(v)} €`;
const fmtDate = (d: string | null | undefined) => {
  if (!d) return '';
  try { const dt = new Date(d); return `${String(dt.getUTCDate()).padStart(2,'0')}/${String(dt.getUTCMonth()+1).padStart(2,'0')}/${dt.getUTCFullYear()}`; }
  catch { return ''; }
};
const toInputDate = (d: string | null | undefined) => { try { return d ? new Date(d).toISOString().split('T')[0] : ''; } catch { return ''; } };

// ── Styled "always-visible" input (readonly or editable)
const EInput = ({ value, readOnly = true, onChange, type = 'text', className = '', placeholder = '' }: {
  value?: string | number; readOnly?: boolean; onChange?: (v: any) => void;
  type?: string; className?: string; placeholder?: string;
}) => (
  <input
    type={type}
    value={value ?? ''}
    readOnly={readOnly}
    onChange={onChange ? (e) => onChange(type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value) : undefined}
    className={cn(
      'w-full px-2.5 py-2 text-sm rounded-md border font-medium',
      'transition-colors placeholder:text-muted-foreground/40',
      'focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary',
      readOnly
        ? 'bg-white/5 border-white/10 text-foreground/80 cursor-default'
        : 'bg-background border-border shadow-sm text-foreground focus:bg-white/5',
      className
    )}
  />
);

// ── Section label
const SL = ({ children }: { children?: React.ReactNode }) => (
  <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground mb-1.5">{children}</p>
);

// ── Section divider
const Div = () => <hr className="border-border/40 my-6" />;

interface Props {
  doc: Document; form: UseFormReturn<DocumentUpdatePayload>;
  isEditing: boolean; isSaving: boolean; isDeleting: boolean; isValidating: boolean; isEditable: boolean;
  onEdit: () => void; onCancelEdit: () => void; onSave: () => void;
  onDelete: () => void; onValidate: () => void; onAuditMode: () => void;
  onMarkDuplicate: () => void;
  navigation?: {
    prevId: number | null;
    nextId: number | null;
    currentIndex: number | null;
    totalCount: number | null;
    onNavigatePrev: () => void;
    onNavigateNext: () => void;
    hasPrev: boolean;
    hasNext: boolean;
  };
  onRefresh?: () => Promise<void> | void;
}

export function ReviewInvoiceLayout({ doc, form, isEditing, isSaving, isDeleting, isValidating, isEditable, onEdit, onCancelEdit, onSave, onDelete, onValidate, onAuditMode, onMarkDuplicate, navigation, onRefresh }: Props) {
  const router = useRouter();
  const { setOpen, isMobile } = useSidebar();
  const [isMobileViewerOpen, setIsMobileViewerOpen] = React.useState(false);

  React.useEffect(() => {
    if (!isMobile) {
      // Forzar el colapso de la sidebar al entrar a esta vista
      setOpen(false);
    }
  }, [setOpen, isMobile]);

  const fv = useWatch({ control: form.control });
  const { fields: ivaFields, append: appendIva, remove: removeIva } = useFieldArray({ control: form.control, name: 'iva_details' });

  const provider = useMemo(() => doc.entidades.find(e => e.rol === 'proveedor' || e.rol === 'emisor'), [doc.entidades]);
  const client   = useMemo(() => doc.entidades.find(e => e.rol === 'cliente' || e.rol === 'receptor'), [doc.entidades]);
  const documentUrl = fixMinioUrl(doc?.archivos?.[0]?.ruta_archivo);
  const docName = doc?.archivos?.[0]?.nombre_archivo || `doc_${doc.id_documento}`;

  const [disponibles, setDisponibles] = React.useState<{ año: number; trimestre: number; label: string }[]>([]);
  const empresaId = doc.empresa_id || (doc as any).id_de_empresa;

  const { toast } = useToast();
  const rawDatosExtra = (doc as any)?.datos_extra || {};
  const [isForeign, setIsForeign] = React.useState<boolean>(
    Boolean(rawDatosExtra.es_proveedor_extranjero_ue)
  );
  const [showCaseADialog, setShowCaseADialog] = React.useState(false);
  const [showCaseBDialog, setShowCaseBDialog] = React.useState(false);
  const [isPendingToggle, setIsPendingToggle] = React.useState(false);
  const [cuentaCompra, setCuentaCompra] = React.useState<string | null>(null);
  const [isSavingAccount, setIsSavingAccount] = React.useState(false);
  const [cuentaEditInput, setCuentaEditInput] = React.useState('');
  const [cuentaEditMode, setCuentaEditMode] = React.useState(false);
  const [isSavingImpuesto, setIsSavingImpuesto] = React.useState<number | null>(null);
  const [impuestoEditMode, setImpuestoEditMode] = React.useState<number | null>(null); // id del impuesto en edición
  const [impuestoEditInput, setImpuestoEditInput] = React.useState('');
  // --- cuenta_gasto / cuenta_ingreso ---
  const [cuentaGasto, setCuentaGasto] = React.useState<string | null>(null);
  const [isSavingGasto, setIsSavingGasto] = React.useState(false);
  const [cuentaGastoEditInput, setCuentaGastoEditInput] = React.useState('');
  const [cuentaGastoEditMode, setCuentaGastoEditMode] = React.useState(false);
  const cuentasImpuestosSugeridas: Record<string, string> = rawDatosExtra.cuentas_impuestos_sugeridas || {};
  const cuentaGastoSugerida: { codigo: string; nombre: string; justificacion?: string } | null =
    rawDatosExtra.cuenta_gasto_sugerida || rawDatosExtra.cuenta_ingreso_sugerida || null;
  const [impuestosCC, setImpuestosCC] = React.useState<Record<number, string | null>>(
    () => Object.fromEntries((doc.iva_details || []).map((imp: any) => [imp.id, imp.cuenta_contable ?? null]))
  );

  // Emitida o recibida → determina qué CC de entidad usar
  const tipoDocUpper = (doc.tipo_documento || '').toUpperCase();
  const esEmitida = tipoDocUpper.includes('EMITIDA') || tipoDocUpper.includes('EMITIDO');
  const ccGastoFieldName = esEmitida ? 'cuentaIngreso' : 'cuentaGasto';
  const isTicketDoc = tipoDocUpper.includes('TICKET');
  const totalAmount = Number((doc as any).total ?? (doc as any).importe_total ?? 0);
  const importeTotalAmount = Number((doc as any).importe_total ?? (doc as any).total ?? 0);
  const isTicketRectificativo = isTicketDoc && (
    totalAmount < 0 ||
    importeTotalAmount < 0 ||
    Boolean(rawDatosExtra?.es_abono) ||
    Boolean(rawDatosExtra?.is_abono) ||
    tipoDocUpper.includes('RECTIFIC') ||
    tipoDocUpper.includes('ABONO')
  );
  const ccSugeridaEntidad = isForeign
    ? '4100000'
    : esEmitida
      ? '4300000' // Clientes
      : '4000000'; // Proveedores (compra / recibida, default)
  const ccFieldName = esEmitida ? 'cuentaVenta' : 'cuentaCompra'; // campo a usar en entidades-config
  const ccDbField  = esEmitida ? 'cuenta_venta' : 'cuenta_compra'; // campo que devuelve el GET

  // Detección de No Facturable ("Otros")
  const esNoFacturable = useMemo(() => {
    const isExplicitNF = rawDatosExtra?.es_facturable === false;
    const isFiscal =
      tipoDocUpper.includes('FACTURA') ||
      tipoDocUpper.includes('ABONO') ||
      tipoDocUpper.includes('TICKET') ||
      tipoDocUpper.includes('ALBARAN') ||
      tipoDocUpper.includes('ALBARÁN') ||
      tipoDocUpper.includes('RECTIFIC');

    if (isFiscal) return false;
    return isExplicitNF || tipoDocUpper.includes('OTROS') || tipoDocUpper.includes('OTRO');
  }, [rawDatosExtra?.es_facturable, tipoDocUpper]);

  const categoriaNF = rawDatosExtra?.categoria_documento || rawDatosExtra?.categoria_principal || rawDatosExtra?.CATEGORIA || 'No clasificado';
  const subcategoriaNF = rawDatosExtra?.subcategoria || '';
  const valorReferenciaNF = Number(rawDatosExtra?.valor_referencia_no_fiscal || 0);
  const conceptoReferenciaNF = rawDatosExtra?.concepto_valor_referencia || '';
  const metadatosNF = rawDatosExtra?.metadatos || null;

  const countryName = rawDatosExtra.pais_emisor_nombre || rawDatosExtra.pais_emisor || '';
  const backupFiscalImpuestos = rawDatosExtra.backup_fiscal_origen?.impuestos_originales || [];

  React.useEffect(() => {
    setIsForeign(Boolean(rawDatosExtra.es_proveedor_extranjero_ue));
  }, [rawDatosExtra.es_proveedor_extranjero_ue]);

  React.useEffect(() => {
    const providerCif = provider?.identificador_fiscal || doc.cif;
    if (!empresaId || !providerCif) return;
    fetch(`/api/entidades-config?empresaId=${empresaId}&identificadorFiscal=${encodeURIComponent(providerCif)}`)
      .then(res => res.json())
      .then(data => {
        // Leer el campo correcto según tipo de doc (compra o venta)
        const cc = data?.config?.[ccDbField];
        if (cc) setCuentaCompra(cc);
        // Leer cuenta_gasto o cuenta_ingreso
        const cg = data?.config?.[esEmitida ? 'cuenta_ingreso' : 'cuenta_gasto'];
        if (cg) setCuentaGasto(cg);
      })
      .catch(() => {});
  }, [empresaId, provider?.identificador_fiscal, doc.cif, ccDbField]);

  const handleToggleForeign = async (targetForeign: boolean) => {
    setIsPendingToggle(true);
    try {
      const res = await fetch(`/api/documents/${doc.id_documento}/extranjero`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ esExtranjero: targetForeign }),
      });
      const data = await res.json();
      if (res.ok) {
        setIsForeign(targetForeign);
        setShowCaseADialog(false);
        setShowCaseBDialog(false);

        if (targetForeign) {
          const currentTotal = Number(form.getValues('total') ?? doc.total) || 0;
          form.setValue('base_imponible', currentTotal);
          form.setValue('iva_details', []);
          toast({
            title: '🌍 Proveedor Extranjero',
            description: 'Documento ajustado: base contable igualada al total y líneas de impuestos removidas.',
          });
        } else {
          toast({
            title: '🏢 Convertido a Documento Local',
            description: 'Recuerda definir manualmente las cuotas y tasas de IVA correspondientes en el desglose.',
          });
        }

        if (onRefresh) {
          await onRefresh();
        } else {
          router.refresh();
        }
      } else {
        toast({
          title: 'Error',
          description: data.error || 'No se pudo cambiar el estado del documento.',
          variant: 'destructive',
        });
      }
    } catch (err: any) {
      toast({
        title: 'Error de red',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setIsPendingToggle(false);
      setShowCaseADialog(false);
      setShowCaseBDialog(false);
    }
  };

  const handleAssignAccount4100000 = async () => {
    const providerCif = provider?.identificador_fiscal || doc.cif;
    if (!empresaId || !providerCif) return;
    setIsSavingAccount(true);
    try {
      const res = await fetch('/api/entidades-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empresaId: Number(empresaId),
          identificadorFiscal: providerCif,
          nombreReferencia: provider?.nombre || doc.proveedor || '',
          [ccFieldName]: '4100000', // extranjero siempre compra (4100000 = acreedores ext.)
        }),
      });
      if (res.ok) {
        setCuentaCompra('4100000');
        toast({
          title: 'Subcuenta asignada',
          description: `Se asignó la cuenta 4100000 al proveedor ${provider?.nombre || providerCif}.`,
        });
      } else {
        toast({
          title: 'Error',
          description: 'No se pudo asignar la cuenta contable.',
          variant: 'destructive',
        });
      }
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setIsSavingAccount(false);
    }
  };

  React.useEffect(() => {
    if (!empresaId) return;
    fetch(`/api/trimestres/disponibles?empresa_id=${empresaId}`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setDisponibles(data.map((d: any) => ({
            año: d.año,
            trimestre: d.trimestre,
            label: `${d.año} – T${d.trimestre}`
          })));
        }
      })
      .catch(console.error);
  }, [empresaId]);

  const fallbackOptions = React.useMemo(() => {
    const currentYear = new Date().getFullYear();
    const opts: { año: number; trimestre: number; label: string }[] = [];
    for (let y = currentYear + 1; y >= currentYear - 2; y--) {
      for (let q = 4; q >= 1; q--) {
        opts.push({ año: y, trimestre: q, label: `${y} – T${q}` });
      }
    }
    return opts;
  }, []);

  const trimesterOptions = disponibles.length > 0 ? disponibles : fallbackOptions;
  const currentAño = fv.año_trimestre ?? doc.año_trimestre;
  const currentNum = fv.num_trimestre ?? doc.num_trimestre;
  const currentKey = currentAño && currentNum ? `${currentAño}-${currentNum}` : '';

  const liveIva    = isEditing ? ivaFields : (doc.iva_details || []);
  // Filas a mostrar en la tabla: excluir retenciones/IRPF porque tienen
  // su propia fila dedicada más abajo y se restan por separado en el total.
  const liveIvaRows = liveIva.filter((t: any) => {
    const tipo = (t.tipo_impuesto || '').toLowerCase();
    return !tipo.includes('retencion') && !tipo.includes('reten') && !tipo.includes('irpf');
  });
  const liveBase   = Number(isEditing ? (fv.base_imponible ?? doc.base_imponible) : doc.base_imponible) || 0;
  const liveBaseNS = Number(isEditing ? (fv.base_no_sujeta ?? (doc as any).base_no_sujeta) : (doc as any).base_no_sujeta) || 0;
  const liveRetencion = Number(isEditing ? ((fv as any).retencion_irpf ?? (doc as any).retencion_irpf) : (doc as any).retencion_irpf) || 0;
  const liveDescuento = Number(isEditing ? (fv.descuento_global ?? (doc as any).descuento_global) : (doc as any).descuento_global) || 0;

  // Calculamos el total dinámicamente si está editando.
  // ⚠️ Excluir filas de retención/IRPF de liveIvaSum porque ya se restan
  // explícitamente con liveRetencion. Sumarlas aquí causaría doble resta.
  // Recargo sí se incluye (no tiene campo separado en la fórmula).
  const liveIvaSum = liveIva
    .filter((t: any) => {
      const tipo = (t.tipo_impuesto || '').toLowerCase();
      return !tipo.includes('retencion') && !tipo.includes('reten') && !tipo.includes('irpf');
    })
    .reduce((acc: number, t: any) => acc + Number(t.cuota || 0), 0);
  const calculatedTotal = liveBase + liveIvaSum + liveBaseNS - liveDescuento - liveRetencion;
  const liveTotal  = isEditing ? calculatedTotal : (Number(doc.total) || 0);

  // Auto-actualizar el campo form.total para que se guarde correctamente
  React.useEffect(() => {
    if (isEditing) {
      const currentTotal = Number(form.getValues('total')) || 0;
      if (Math.abs(currentTotal - calculatedTotal) > 0.01) {
        form.setValue('total', calculatedTotal, { shouldDirty: true });
      }
    }
  }, [isEditing, calculatedTotal, form]);

  const statusLabel = doc.incidencia ? 'Revisión' : doc.verificado ? 'Validado' : 'Verificado';
  const statusColor = doc.incidencia ? '#f59e0b' : '#10b981';

  // Solo para No Facturables: comprobar si trae datos económicos o retenciones reales
  const hasNfEconomicData = esNoFacturable && (
    liveRetencion > 0 ||
    liveBase > 0 ||
    liveTotal > 0 ||
    liveBaseNS > 0 ||
    Boolean(doc.iva_details && doc.iva_details.some((t: any) => Math.abs(Number(t.cuota) || 0) > 0.001 || Math.abs(Number(t.base_imponible) || 0) > 0.001))
  );

  const handleClose = () => {
    if (form.formState.isDirty) {
      const confirmLeave = window.confirm(
        'Tienes cambios sin guardar en este documento. ¿Deseas salir de todos modos?'
      );
      if (!confirmLeave) return;
    }
    let originUrl = '/documents';
    try {
      const saved = sessionStorage.getItem('document_origin_url');
      if (saved) originUrl = saved;
    } catch {}
    router.push(originUrl);
  };

  return (
    <div className="flex flex-col md:flex-row overflow-hidden bg-background" style={{ height: '100dvh', minHeight: 0 }}>

      {/* ═══ LEFT PANEL ═══ */}
      <div className="flex flex-col border-r border-border overflow-hidden w-full md:w-[60%] md:min-w-[500px] md:shrink-0">

        {/* Top bar */}
        <div style={{ background: 'hsl(var(--card))', borderBottom: '1px solid hsl(var(--border))' }}
          className="flex items-center justify-between px-4 py-3 shrink-0 gap-3">
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => router.back()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-muted/60 hover:bg-muted text-foreground text-sm font-medium transition-colors border border-border shadow-sm"
              title="Volver al documento anterior en el historial"
            >
              <ChevronLeft className="h-4 w-4" />Atrás
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="p-1.5 rounded-md bg-muted/60 hover:bg-muted hover:text-destructive text-foreground text-sm font-medium transition-colors border border-border shadow-sm flex items-center justify-center"
              title="Cerrar y volver a la sección principal"
            >
              <X className="h-4 w-4" />
            </button>
            {/* Mobile: botón para abrir visor en modal */}
            <button
              type="button"
              onClick={() => setIsMobileViewerOpen(true)}
              className="md:hidden flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold transition-colors border border-primary/20 shrink-0"
              title="Ver documento"
            >
              <Eye className="h-3.5 w-3.5" />
              <span>Ver doc</span>
            </button>
          </div>
          <div className="flex-1 text-center min-w-0 overflow-hidden px-2">
            <div className="flex items-center justify-center gap-1.5">
              <p className="text-sm font-bold">
                {esNoFacturable
                  ? 'Revisar documento'
                  : isTicketDoc
                    ? (isTicketRectificativo ? 'Revisar ticket rectificativo' : 'Revisar ticket')
                    : 'Revisar factura'}
              </p>
              {esNoFacturable && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  {categoriaNF}
                </span>
              )}
              {!esNoFacturable && isTicketRectificativo && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30">
                  Rectificativo
                </span>
              )}
              {((doc as any)?.datos_extra?.canal_origen === 'api' || (doc as any)?.dashboard_correo === 'api') && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-400 border border-purple-500/30 font-mono" title="Ingresado vía API síncrona">
                  API
                </span>
              )}
            </div>
            <p className="text-[11px] font-medium truncate mt-0.5" style={{ color: statusColor }}>
              {esNoFacturable
                ? `${doc.tipo_documento || 'Documento'} · ${statusLabel}`
                : `${(provider?.nombre || '—').substring(0, 22)}${(provider?.nombre || '').length > 22 ? '…' : ''} · ${statusLabel}`}
            </p>
          </div>

          {/* Navigation controls */}
          {navigation && (
            <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-lg border border-border/60 shadow-sm shrink-0">
              <button
                type="button"
                onClick={() => navigation.onNavigatePrev?.()}
                disabled={!navigation.hasPrev}
                title="Documento anterior (← / Alt+←)"
                className={cn(
                  'p-1.5 rounded-md transition-colors flex items-center justify-center',
                  navigation.hasPrev
                    ? 'hover:bg-accent text-foreground hover:text-foreground cursor-pointer'
                    : 'text-muted-foreground/30 cursor-not-allowed'
                )}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              <span className="text-[11px] font-bold px-2 text-muted-foreground font-mono select-none">
                {navigation.currentIndex && navigation.totalCount
                  ? `${navigation.currentIndex} / ${navigation.totalCount}`
                  : '—'}
              </span>

              <button
                type="button"
                onClick={() => navigation.onNavigateNext?.()}
                disabled={!navigation.hasNext}
                title="Documento siguiente (→ / Alt+→)"
                className={cn(
                  'p-1.5 rounded-md transition-colors flex items-center justify-center',
                  navigation.hasNext
                    ? 'hover:bg-accent text-foreground hover:text-foreground cursor-pointer'
                    : 'text-muted-foreground/30 cursor-not-allowed'
                )}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        {/* Scrollable form */}
        <div className="flex-1 overflow-y-auto px-6 py-5 review-form-scrollbar">

          {/* ── BANNER / METADATOS DOCUMENTO NO FACTURABLE ── */}
          {esNoFacturable && (
            <div className="mb-5 p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
                    <Folder className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-sm text-foreground">
                        {doc.tipo_documento || 'Documento No Facturable'}
                      </h3>
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                        {categoriaNF}
                      </span>
                    </div>
                    {subcategoriaNF && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {subcategoriaNF}
                      </p>
                    )}
                    <p className="text-[11px] text-muted-foreground/80 mt-1">
                      Documento archivado en &ldquo;Otros&rdquo;. No genera cuotas fiscales de IVA ni obligaciones de Modelo 303.
                    </p>
                  </div>
                </div>
              </div>

              {/* Importe de referencia informativo (si existe) */}
              {valorReferenciaNF > 0 && (
                <div className="pt-2.5 border-t border-emerald-500/20 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground font-medium">
                      {conceptoReferenciaNF || 'Importe de referencia'}:
                    </span>
                    <span className="font-mono font-bold text-sm text-foreground">
                      {fmtEur(valorReferenciaNF)}
                    </span>
                  </div>
                  <span className="text-[10px] text-muted-foreground italic">
                    Informativo (sin IVA computable)
                  </span>
                </div>
              )}

              {/* Metadatos adicionales de IA si existen */}
              {metadatosNF && Object.keys(metadatosNF).length > 0 && (
                <div className="pt-2 border-t border-emerald-500/15 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px]">
                  {metadatosNF.numero_referencia && (
                    <div className="text-muted-foreground">
                      <span className="font-medium text-foreground/80">Ref:</span>{' '}
                      <span className="font-mono">{metadatosNF.numero_referencia}</span>
                    </div>
                  )}
                  {metadatosNF.estado && (
                    <div className="text-muted-foreground">
                      <span className="font-medium text-foreground/80">Estado:</span>{' '}
                      <span>{metadatosNF.estado}</span>
                    </div>
                  )}
                  {metadatosNF.periodo_fiscal && (
                    <div className="text-muted-foreground">
                      <span className="font-medium text-foreground/80">Período:</span>{' '}
                      <span>{metadatosNF.periodo_fiscal}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── BANNER / TOGGLE PROVEEDOR EXTRANJERO (SOLO FACTURABLES) ── */}
          {!esNoFacturable && (
            isForeign ? (
              <div className="mb-5 p-3.5 rounded-lg border border-blue-500/30 bg-blue-500/10 text-xs flex flex-col gap-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <span className="text-lg leading-none mt-0.5">🌍</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-blue-400">
                          Proveedor Extranjero {countryName ? `(${countryName})` : ''}
                        </p>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-blue-500/20 text-blue-300 border border-blue-500/30">
                          IVA NO DEDUCIBLE
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        El IVA de origen no es deducible en España (Modelo 303). El total computa íntegramente como gasto.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowCaseBDialog(true)}
                    disabled={isPendingToggle}
                    className="px-2.5 py-1 rounded bg-muted/60 hover:bg-muted text-[11px] font-medium border border-border text-foreground transition-colors shrink-0 flex items-center gap-1"
                  >
                    {isPendingToggle ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                    Cambiar a Local
                  </button>
                </div>

                {!isForeign && cuentaCompra !== '4100000' && (
                  <div className="pt-2 border-t border-blue-500/20 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <span>💡</span>
                      <span>Subcuenta sugerida: <strong className="text-foreground font-mono">4100000</strong> (Acreedores)</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleAssignAccount4100000}
                      disabled={isSavingAccount}
                      className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium text-[11px] shadow-sm transition-colors shrink-0 flex items-center gap-1"
                    >
                      {isSavingAccount ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                      Asignar 4100000 en 1 clic
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="mb-5 flex items-center justify-between px-3.5 py-2 rounded-lg border border-border/40 bg-muted/20 text-xs">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span>🏢</span>
                  <span className="text-[11px] font-medium">Proveedor Nacional / Local (Régimen General)</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCaseADialog(true)}
                  disabled={isPendingToggle}
                  className="px-2 py-0.5 rounded text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors border border-transparent hover:border-border flex items-center gap-1"
                >
                  {isPendingToggle ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                  <span>🌍</span> Marcar como Extranjero
                </button>
              </div>
            )
          )}

          {/* ================================================================
           * SECCIÓN CUENTAS CONTABLES
           * Diferenciada visualmente. Solo visible para documentos facturables.
           * ================================================================ */}
          {!esNoFacturable && (
            <div className="mb-5 rounded-xl border border-violet-500/30 bg-violet-500/5 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-violet-500/20 flex items-center gap-2">
                <span className="text-sm">📒</span>
                <span className="font-semibold text-violet-400 text-xs">Cuentas Contables</span>
                <span className="text-[10px] text-muted-foreground ml-auto">Sugerencias IA · Aceptar o editar</span>
              </div>
              <div className="p-4 flex flex-col gap-4">

                {/* Cuenta de la Entidad */}
                <div className="flex flex-col gap-1.5">
                  <p className="text-[11px] font-medium text-violet-300">🏢 Entidad ({provider?.nombre || doc.proveedor || 'Proveedor/Cliente'})</p>

                  {cuentaCompra && !cuentaEditMode ? (
                    // ── Modo lectura: ya tiene CC asignada ──
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs bg-violet-900/30 border border-violet-500/30 rounded px-2 py-0.5 text-violet-200">
                        {cuentaCompra}
                      </span>
                      <span className="text-[10px] text-green-400">✓ Asignada</span>
                      <button
                        type="button"
                        onClick={() => { setCuentaEditInput(cuentaCompra); setCuentaEditMode(true); }}
                        className="text-[10px] text-muted-foreground hover:text-foreground underline"
                      >
                        Cambiar
                      </button>
                    </div>
                  ) : cuentaEditMode ? (
                    // ── Modo edición: cambiar cuenta existente ──
                    <div className="flex items-center gap-2 flex-wrap">
                      <input
                        type="text"
                        value={cuentaEditInput}
                        onChange={e => setCuentaEditInput(e.target.value)}
                        className="h-7 text-xs bg-background border border-violet-500/50 rounded px-2 w-32 font-mono"
                        autoFocus
                      />
                      <button
                        type="button"
                        disabled={isSavingAccount || !cuentaEditInput.trim()}
                        onClick={async () => {
                          const providerCif = provider?.identificador_fiscal || doc.cif;
                          if (!doc.empresa_id || !providerCif || !cuentaEditInput.trim()) return;
                          setIsSavingAccount(true);
                          try {
                            const res = await fetch('/api/entidades-config', {
                              method: 'POST', headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ empresaId: Number(doc.empresa_id), identificadorFiscal: providerCif, nombreReferencia: provider?.nombre || '', [ccFieldName]: cuentaEditInput.trim() }),
                            });
                            if (res.ok) { setCuentaCompra(cuentaEditInput.trim()); setCuentaEditMode(false); }
                          } finally { setIsSavingAccount(false); }
                        }}
                        className="text-[11px] bg-violet-700 hover:bg-violet-600 text-white rounded px-2.5 py-1 disabled:opacity-40"
                      >
                        {isSavingAccount ? '...' : 'Guardar'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setCuentaEditMode(false)}
                        className="text-[10px] text-muted-foreground hover:text-foreground underline"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    // ── Sin CC: mostrar sugerencia + input manual ──
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={async () => {
                          const providerCif = provider?.identificador_fiscal || doc.cif;
                          if (!doc.empresa_id || !providerCif) return;
                          setIsSavingAccount(true);
                          try {
                            const res = await fetch('/api/entidades-config', {
                              method: 'POST', headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ empresaId: Number(doc.empresa_id), identificadorFiscal: providerCif, nombreReferencia: provider?.nombre || '', [ccFieldName]: ccSugeridaEntidad }),
                            });
                            if (res.ok) setCuentaCompra(ccSugeridaEntidad);
                          } finally { setIsSavingAccount(false); }
                        }}
                        disabled={isSavingAccount}
                        className="text-[11px] bg-violet-700 hover:bg-violet-600 text-white rounded px-2.5 py-1 disabled:opacity-50 flex items-center gap-1"
                      >
                        {isSavingAccount ? '...' : `💡 Aceptar ${ccSugeridaEntidad}`}
                      </button>
                      <span className="text-[10px] text-muted-foreground">
                        {isForeign ? 'Acreedores ext.' : tipoDocUpper.includes('EMITIDA') || tipoDocUpper.includes('EMITIDO') ? 'Clientes' : 'Proveedores'}
                      </span>
                      <span className="text-[10px] text-muted-foreground/50">·</span>
                      <input
                        type="text"
                        placeholder="Cuenta manual"
                        value={cuentaEditInput}
                        onChange={e => setCuentaEditInput(e.target.value)}
                        className="h-7 text-xs bg-background border border-input rounded px-2 w-28 font-mono"
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          const providerCif = provider?.identificador_fiscal || doc.cif;
                          if (!doc.empresa_id || !providerCif || !cuentaEditInput.trim()) return;
                          setIsSavingAccount(true);
                          try {
                            const res = await fetch('/api/entidades-config', {
                              method: 'POST', headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ empresaId: Number(doc.empresa_id), identificadorFiscal: providerCif, nombreReferencia: provider?.nombre || '', [ccFieldName]: cuentaEditInput.trim() }),
                            });
                            if (res.ok) setCuentaCompra(cuentaEditInput.trim());
                          } finally { setIsSavingAccount(false); }
                        }}
                        disabled={isSavingAccount || !cuentaEditInput.trim()}
                        className="text-[11px] bg-muted hover:bg-muted/80 text-foreground rounded px-2.5 py-1 disabled:opacity-40"
                      >
                        Guardar manual
                      </button>
                    </div>
                  )}
                </div>

                {/* Cuenta de Gastos / Ingresos — sugerida por IA, guardada por proveedor */}
                <div className="flex flex-col gap-1.5">
                  <p className="text-[11px] font-medium text-violet-300">
                    {esEmitida ? '📈 Cuenta de Ingresos' : '📉 Cuenta de Gastos'}
                    {cuentaGasto && <span className="ml-2 text-[10px] text-emerald-400 font-normal">✓ Asignada</span>}
                  </p>

                  {cuentaGasto && !cuentaGastoEditMode ? (
                    // ── Cuenta guardada ──
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm text-foreground">{cuentaGasto}</span>
                      <button
                        type="button"
                        onClick={() => { setCuentaGastoEditInput(cuentaGasto); setCuentaGastoEditMode(true); }}
                        className="text-[10px] text-muted-foreground hover:text-foreground underline"
                      >Cambiar</button>
                    </div>
                  ) : cuentaGastoEditMode ? (
                    // ── Modo edición ──
                    <div className="flex items-center gap-2 flex-wrap">
                      <input
                        type="text"
                        value={cuentaGastoEditInput}
                        onChange={e => setCuentaGastoEditInput(e.target.value)}
                        className="h-7 text-xs bg-background border border-violet-500/50 rounded px-2 w-32 font-mono"
                        autoFocus
                        placeholder="ej. 6290000"
                      />
                      <button
                        type="button"
                        disabled={isSavingGasto || !cuentaGastoEditInput.trim()}
                        onClick={async () => {
                          const providerCif = provider?.identificador_fiscal || doc.cif;
                          if (!doc.empresa_id || !providerCif || !cuentaGastoEditInput.trim()) return;
                          setIsSavingGasto(true);
                          try {
                            const res = await fetch('/api/entidades-config', {
                              method: 'POST', headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ empresaId: Number(doc.empresa_id), identificadorFiscal: providerCif, nombreReferencia: provider?.nombre || '', [ccGastoFieldName]: cuentaGastoEditInput.trim() }),
                            });
                            if (res.ok) { setCuentaGasto(cuentaGastoEditInput.trim()); setCuentaGastoEditMode(false); }
                          } finally { setIsSavingGasto(false); }
                        }}
                        className="text-[11px] bg-violet-700 hover:bg-violet-600 text-white rounded px-2.5 py-1 disabled:opacity-40"
                      >
                        {isSavingGasto ? '...' : 'Guardar'}
                      </button>
                      <button type="button" onClick={() => setCuentaGastoEditMode(false)} className="text-[10px] text-muted-foreground hover:text-foreground underline">Cancelar</button>
                    </div>
                  ) : (
                    // ── Sin CC: mostrar sugerencia IA + input manual ──
                    <div className="flex items-center gap-2 flex-wrap">
                      {cuentaGastoSugerida ? (
                        <button
                          type="button"
                          disabled={isSavingGasto}
                          onClick={async () => {
                            const providerCif = provider?.identificador_fiscal || doc.cif;
                            if (!doc.empresa_id || !providerCif) return;
                            setIsSavingGasto(true);
                            try {
                              // 1. Guardar en entidades_documento (per-documento, sin propagar)
                              await fetch(`/api/documents/${doc.id_documento}/entidad-gasto`, {
                                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ cuentaGasto: cuentaGastoSugerida.codigo }),
                              });
                              // 2. Guardar en entidades_config (default canónico para futuros docs)
                              const res = await fetch('/api/entidades-config', {
                                method: 'POST', headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ empresaId: Number(doc.empresa_id), identificadorFiscal: providerCif, nombreReferencia: provider?.nombre || '', [ccGastoFieldName]: cuentaGastoSugerida.codigo }),
                              });
                              if (res.ok) setCuentaGasto(cuentaGastoSugerida.codigo);
                            } finally { setIsSavingGasto(false); }
                          }}
                          className="text-[11px] bg-violet-700 hover:bg-violet-600 text-white rounded px-2.5 py-1 disabled:opacity-50 flex items-center gap-1"
                          title={cuentaGastoSugerida.justificacion}
                        >
                          {isSavingGasto ? '...' : `💡 Aceptar ${cuentaGastoSugerida.codigo}`}
                        </button>
                      ) : null}
                      {cuentaGastoSugerida && (
                        <span className="text-[10px] text-muted-foreground">{cuentaGastoSugerida.nombre}</span>
                      )}
                      {cuentaGastoSugerida && <span className="text-[10px] text-muted-foreground/50">·</span>}
                      <input
                        type="text"
                        placeholder="Cuenta manual"
                        value={cuentaGastoEditInput}
                        onChange={e => setCuentaGastoEditInput(e.target.value)}
                        className="h-7 text-xs bg-background border border-input rounded px-2 w-28 font-mono"
                      />
                      <button
                        type="button"
                        disabled={isSavingGasto || !cuentaGastoEditInput.trim()}
                        onClick={async () => {
                          const providerCif = provider?.identificador_fiscal || doc.cif;
                          if (!doc.empresa_id || !providerCif || !cuentaGastoEditInput.trim()) return;
                          setIsSavingGasto(true);
                          try {
                            const res = await fetch('/api/entidades-config', {
                              method: 'POST', headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ empresaId: Number(doc.empresa_id), identificadorFiscal: providerCif, nombreReferencia: provider?.nombre || '', [ccGastoFieldName]: cuentaGastoEditInput.trim() }),
                            });
                            if (res.ok) setCuentaGasto(cuentaGastoEditInput.trim());
                          } finally { setIsSavingGasto(false); }
                        }}
                        className="text-[11px] bg-muted hover:bg-muted/80 text-foreground rounded px-2.5 py-1 disabled:opacity-40"
                      >
                        Guardar manual
                      </button>
                    </div>
                  )}
                </div>

                {/* Impuestos: mostrar cuando existan líneas fiscales (incluye IVA espejo intracomunitario 472/477) */}
                {doc.iva_details && doc.iva_details.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <p className="text-[11px] font-medium text-violet-300">🧾 Impuestos del documento</p>
                    <div className="rounded-lg border border-violet-500/20 overflow-hidden">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-violet-900/20 text-muted-foreground">
                            <th className="text-left px-3 py-1.5 font-medium">Tipo</th>
                            <th className="text-right px-3 py-1.5 font-medium">%</th>
                            <th className="text-right px-3 py-1.5 font-medium">Cuota</th>
                            <th className="text-left px-3 py-1.5 font-medium">Cuenta</th>
                            <th className="px-2 py-1.5"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-violet-500/10">
                          {(doc.iva_details as any[]).map((imp: any) => {
                            const key = `${imp.tipo_impuesto}_${Math.round(Number(imp.porcentaje))}`;
                            const fallbackSop = imp.tipo_impuesto?.includes('SOPORTADO') ? `472000${Math.round(Number(imp.porcentaje)).toString().padStart(2, '0')}` : null;
                            const fallbackRep = imp.tipo_impuesto?.includes('REPERCUTIDO') ? `477000${Math.round(Number(imp.porcentaje)).toString().padStart(2, '0')}` : null;
                            const sugerida = cuentasImpuestosSugeridas[key] || fallbackSop || fallbackRep;
                            const asignada = impuestosCC[imp.id];
                            const enEdicion = impuestoEditMode === imp.id;

                            const saveCC = async (valor: string | null) => {
                              setIsSavingImpuesto(imp.id);
                              try {
                                const res = await fetch(`/api/documents/${doc.id_documento}/impuesto-cuenta`, {
                                  method: 'PATCH',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ impuestoId: imp.id, cuentaContable: valor }),
                                });
                                if (res.ok) {
                                  setImpuestosCC(prev => ({ ...prev, [imp.id]: valor }));
                                  setImpuestoEditMode(null);
                                  setImpuestoEditInput('');
                                }
                              } finally { setIsSavingImpuesto(null); }
                            };

                            return (
                              <tr key={imp.id} className="hover:bg-violet-500/5">
                                <td className="px-3 py-1.5 font-medium">{imp.tipo_impuesto}</td>
                                <td className="px-3 py-1.5 text-right">{Number(imp.porcentaje).toFixed(0)}%</td>
                                <td className="px-3 py-1.5 text-right font-mono">{Number(imp.cuota).toFixed(2)} €</td>

                                {/* Celda Cuenta */}
                                <td className="px-3 py-1.5" colSpan={enEdicion ? 2 : 1}>
                                  {enEdicion ? (
                                    // ── Modo edición inline ──
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <input
                                        type="text"
                                        autoFocus
                                        value={impuestoEditInput}
                                        onChange={e => setImpuestoEditInput(e.target.value)}
                                        onKeyDown={e => {
                                          if (e.key === 'Enter' && impuestoEditInput.trim()) saveCC(impuestoEditInput.trim());
                                          if (e.key === 'Escape') { setImpuestoEditMode(null); setImpuestoEditInput(''); }
                                        }}
                                        placeholder={sugerida || 'Cuenta...'}
                                        className="h-6 text-xs bg-background border border-violet-500/50 rounded px-2 w-24 font-mono"
                                      />
                                      <button type="button"
                                        onClick={() => impuestoEditInput.trim() && saveCC(impuestoEditInput.trim())}
                                        disabled={isSavingImpuesto === imp.id || !impuestoEditInput.trim()}
                                        className="text-[10px] bg-violet-700 hover:bg-violet-600 text-white rounded px-2 py-0.5 disabled:opacity-40">
                                        {isSavingImpuesto === imp.id ? '...' : 'Guardar'}
                                      </button>
                                      <button type="button"
                                        onClick={() => { setImpuestoEditMode(null); setImpuestoEditInput(''); }}
                                        className="text-[10px] text-muted-foreground hover:text-foreground underline">
                                        Cancelar
                                      </button>
                                    </div>
                                  ) : asignada ? (
                                    // ── Lectura: CC asignada ──
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="font-mono bg-violet-900/30 border border-violet-500/30 rounded px-2 py-0.5 text-violet-200 text-xs">{asignada}</span>
                                      <button type="button"
                                        onClick={() => { setImpuestoEditInput(asignada); setImpuestoEditMode(imp.id); }}
                                        className="text-[10px] text-muted-foreground hover:text-foreground underline">
                                        Cambiar
                                      </button>
                                      <button type="button"
                                        onClick={() => saveCC(null)}
                                        disabled={isSavingImpuesto === imp.id}
                                        className="text-[10px] text-red-400/70 hover:text-red-400 underline">
                                        Quitar
                                      </button>
                                    </div>
                                  ) : sugerida ? (
                                    // ── Sin CC: mostrar sugerencia ──
                                    <span className="text-muted-foreground text-xs">💡 <span className="font-mono">{sugerida}</span></span>
                                  ) : (
                                    <span className="text-muted-foreground italic text-xs">Sin asignar</span>
                                  )}
                                </td>

                                {/* Celda Acciones (oculta en modo edición porque usa colSpan=2) */}
                                {!enEdicion && (
                                  <td className="px-2 py-1.5">
                                    {!asignada && sugerida && (
                                      <button type="button" disabled={isSavingImpuesto === imp.id}
                                        onClick={() => saveCC(sugerida)}
                                        className="text-[10px] bg-violet-700 hover:bg-violet-600 text-white rounded px-2 py-0.5 disabled:opacity-40">
                                        {isSavingImpuesto === imp.id ? '...' : 'Aceptar'}
                                      </button>
                                    )}
                                    {!asignada && !sugerida && (
                                      <button type="button"
                                        onClick={() => { setImpuestoEditInput(''); setImpuestoEditMode(imp.id); }}
                                        className="text-[10px] text-violet-400 hover:text-violet-300 underline">
                                        + Manual
                                      </button>
                                    )}
                                  </td>
                                )}
                              </tr>
                            );
                          })}

                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

              </div>
            </div>
          )}
          <AlertDialog open={showCaseADialog} onOpenChange={setShowCaseADialog}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  <span>🌍</span> ¿Marcar como Proveedor Extranjero?
                </AlertDialogTitle>
                <AlertDialogDescription className="text-sm space-y-2 text-muted-foreground pt-1">
                  <p>
                    El IVA de origen no es deducible en España (Modelo 303).
                  </p>
                  <p>
                    El importe total de la factura pasará a computarse íntegramente como base del gasto contable.
                  </p>
                  <p className="font-semibold text-foreground">
                    Se eliminarán todas las líneas de impuestos de este documento en la base de datos (se conservará un respaldo en metadatos para auditoría).
                  </p>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isPendingToggle}>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => handleToggleForeign(true)}
                  disabled={isPendingToggle}
                  className="bg-blue-600 hover:bg-blue-500 text-white"
                >
                  {isPendingToggle ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
                  Confirmar y Marcar Extranjero
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* ── MODAL CASO B: EXTRANJERO ➔ LOCAL ── */}
          <AlertDialog open={showCaseBDialog} onOpenChange={setShowCaseBDialog}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  <span>🏢</span> ¿Desmarcar Proveedor Extranjero (Convertir a Local)?
                </AlertDialogTitle>
                <AlertDialogDescription className="text-sm space-y-2 text-muted-foreground pt-1">
                  <p>
                    Este documento fue ingresado o configurado como extranjero, por lo que <strong>no cuenta con cuotas o tasas de impuestos registradas</strong>.
                  </p>
                  <p className="font-semibold text-foreground">
                    Al convertirlo a documento local, deberás definir manualmente el IVA y las cuotas correspondientes en la sección de desglose de impuestos para que compute correctamente en tus modelos fiscales.
                  </p>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isPendingToggle}>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => handleToggleForeign(false)}
                  disabled={isPendingToggle}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                  {isPendingToggle ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
                  Confirmar y Convertir a Local
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* PROVEEDOR / EMISOR + CIF */}
          <div className="grid grid-cols-2 gap-4">
            <div className="min-w-0"><SL>{esNoFacturable ? 'Emisor / Remitente' : 'Proveedor'}</SL>
              {isEditing
                ? <FormField control={form.control} name="proveedor" render={({ field }) => (
                    <EInput readOnly={false} value={field.value ?? ''} onChange={v => field.onChange(v)} placeholder="—" />
                  )} />
                : <EInput value={provider?.nombre || doc.proveedor || (esNoFacturable ? (rawDatosExtra?.metadatos?.remitente || '') : '')} placeholder="—" />}
            </div>
            <div className="min-w-0"><SL>CIF / NIF</SL>
              {isEditing
                ? <FormField control={form.control} name="cif" render={({ field }) => (
                    <EInput readOnly={false} value={field.value ?? ''} onChange={v => field.onChange(v)} className="font-mono text-foreground" placeholder="—" />
                  )} />
                : <EInput value={provider?.identificador_fiscal || doc.cif || (esNoFacturable ? (rawDatosExtra?.metadatos?.nif_cif_relacionado || '') : '')} className="font-mono text-muted-foreground" placeholder="—" />}
            </div>
          </div>

          <Div />

          {/* Recibe tu empresa + Dirigida a */}
          <div className="space-y-4">
            <div>
              <SL>{esNoFacturable ? 'Empresa de tu cuenta' : 'Recibe tu empresa'}</SL>
              {isEditing ? (
                <FormField control={form.control} name="empresa_nombre" render={({ field }) => (
                  <EInput readOnly={false} value={field.value ?? doc.empresa_nombre ?? ''} onChange={v => field.onChange(v)} placeholder="Nombre de tu empresa" />
                )} />
              ) : (
                <p className="text-xs text-muted-foreground mb-0.5">
                  <span className="font-semibold text-foreground/90">{doc.empresa_nombre || '—'}</span>{' '}
                  {doc.empresa_cif && <span className="font-mono text-[10px] text-muted-foreground">({doc.empresa_cif})</span>}
                </p>
              )}
            </div>
            <div>
              <SL>{esNoFacturable ? 'Destinatario / Entidad relacionada' : 'Dirigida a (Cliente / Receptor)'}</SL>
              {isEditing ? (
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="cliente_nombre" render={({ field }) => (
                    <EInput readOnly={false} value={field.value ?? client?.nombre ?? ''} onChange={v => field.onChange(v)} placeholder="Nombre del destinatario" />
                  )} />
                  <FormField control={form.control} name="cliente_cif" render={({ field }) => (
                    <EInput readOnly={false} value={field.value ?? client?.identificador_fiscal ?? ''} onChange={v => field.onChange(v)} className="font-mono" placeholder="CIF / NIF" />
                  )} />
                </div>
              ) : (
                <p className="text-xs text-muted-foreground mb-0.5">
                  <span className="font-semibold text-foreground/90">{client?.nombre || (esNoFacturable ? (rawDatosExtra?.metadatos?.destinatario || '') : '') || '—'}</span>{' '}
                  {(client?.identificador_fiscal || (esNoFacturable && rawDatosExtra?.metadatos?.destinatario && rawDatosExtra?.metadatos?.nif_cif_relacionado)) && (
                    <span className="font-mono text-[10px] text-muted-foreground">({client?.identificador_fiscal || rawDatosExtra?.metadatos?.nif_cif_relacionado})</span>
                  )}
                </p>
              )}
            </div>
          </div>

          <Div />

          {/* Nº FACTURA/DOC + FECHA EMISIÓN + FECHA VENCIMIENTO */}
          <div className={cn("grid gap-4", esNoFacturable && !isEditing && !doc.fecha_vencimiento ? "grid-cols-2" : "grid-cols-3")}>
            <div><SL>{esNoFacturable ? 'Nº Documento / Ref.' : 'Nº Factura'}</SL>
              {isEditing
                ? <FormField control={form.control} name="numero_documento" render={({ field, fieldState }) => (
                    <div>
                      <EInput readOnly={false} value={field.value ?? ''} onChange={(v) => field.onChange(v)} className={cn("font-mono", fieldState.error && "border-destructive focus:ring-destructive")} />
                      {fieldState.error && <p className="text-[11px] text-destructive mt-1 font-medium">{fieldState.error.message}</p>}
                    </div>
                  )} />
                : <EInput value={doc.numero_documento || (esNoFacturable ? (rawDatosExtra?.metadatos?.numero_referencia || '') : '')} className="font-mono text-foreground" />}
            </div>
            <div><SL>{esNoFacturable ? 'Fecha Documento' : 'Fecha Emisión'}</SL>
              {isEditing
                ? <FormField control={form.control} name="fecha_emision" render={({ field, fieldState }) => (
                    <div>
                      <input type="date" value={toInputDate(field.value)} onChange={e => field.onChange(e.target.value || null)}
                        className={cn("w-full px-2.5 py-2 text-sm rounded-md border border-border bg-background shadow-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50", fieldState.error && "border-destructive focus:ring-destructive")} />
                      {fieldState.error && <p className="text-[11px] text-destructive mt-1 font-medium">{fieldState.error.message}</p>}
                    </div>
                  )} />
                : <EInput value={fmtDate(doc.fecha_emision) || (esNoFacturable && doc.fecha_creacion ? fmtDate(doc.fecha_creacion) : '—')} placeholder="—" />}
            </div>
            {(!esNoFacturable || isEditing || doc.fecha_vencimiento) && (
              <div><SL>Fecha Vencimiento</SL>
                {isEditing
                  ? <FormField control={form.control} name="fecha_vencimiento" render={({ field, fieldState }) => (
                      <div>
                        <input type="date" value={toInputDate(field.value)} onChange={e => field.onChange(e.target.value || null)}
                          className={cn("w-full px-2.5 py-2 text-sm rounded-md border border-border bg-background shadow-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50", fieldState.error && "border-destructive focus:ring-destructive")} />
                        {fieldState.error && <p className="text-[11px] text-destructive mt-1 font-medium">{fieldState.error.message}</p>}
                      </div>
                    )} />
                  : <EInput value={fmtDate(doc.fecha_vencimiento) || '—'} placeholder="—" />}
              </div>
            )}
          </div>


          <div className="grid grid-cols-2 gap-6 mt-6">
            <div><SL>Tipo de Documento</SL>
              {isEditing
                ? <FormField control={form.control} name="tipo_documento" render={({ field }) => (
                    <DocumentTypeSelector value={field.value ?? ''} onChange={field.onChange} />
                  )} />
                : <EInput value={doc.tipo_documento || '—'} className="font-medium text-foreground" />}

              {/* Chip visual: ticket rectificativo (solo frontend, no altera tipo_documento) */}
              {isTicketRectificativo && (
                <div className="mt-2 text-xs flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-400">
                  <span>↩️</span>
                  <span className="font-medium">Ticket Rectificativo</span>
                  <span className="text-muted-foreground">— anula o corrige un ticket anterior</span>
                </div>
              )}
              {rawDatosExtra?.factura_rectificada && (
                <div className="mt-2 text-xs flex items-center gap-1.5 p-2 rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-400">
                  <span>🔗 Rectifica a:</span>
                  {rawDatosExtra.factura_rectificada_id ? (
                    <Link
                      href={`/documento/${rawDatosExtra.factura_rectificada_id}`}
                      className="font-bold underline hover:text-blue-300 flex items-center gap-1"
                    >
                      {rawDatosExtra.factura_rectificada} <ExternalLink className="h-3 w-3 inline" />
                    </Link>
                  ) : (
                    <span className="font-semibold text-foreground">{rawDatosExtra.factura_rectificada}</span>
                  )}
                  {rawDatosExtra.motivo_rectificacion && (
                    <span className="text-[11px] text-muted-foreground ml-1">({rawDatosExtra.motivo_rectificacion})</span>
                  )}
                </div>
              )}

              {rawDatosExtra?.rectificada_por_numero && (
                <div className="mt-2 text-xs flex items-center gap-1.5 p-2 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-400">
                  <span>⚠️ Rectificada por abono:</span>
                  {rawDatosExtra.rectificada_por_id ? (
                    <Link
                      href={`/documento/${rawDatosExtra.rectificada_por_id}`}
                      className="font-bold underline hover:text-amber-300 flex items-center gap-1"
                    >
                      {rawDatosExtra.rectificada_por_numero} <ExternalLink className="h-3 w-3 inline" />
                    </Link>
                  ) : (
                    <span className="font-semibold">{rawDatosExtra.rectificada_por_numero}</span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ── SECCIONES FISCALES (SOLO FACTURABLES) ── */}
          {!esNoFacturable && (
            <>
              <Div />

              {/* DESGLOSE IVA — always input rows */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <SL>Desglose de IVA</SL>
                  {isEditing && (
                    <button type="button" onClick={() => appendIva({ tipo_impuesto: 'IVA', porcentaje: 21, base_imponible: 0, cuota: 0 })}
                      className="flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline">
                      <PlusCircle className="h-3.5 w-3.5" />Añadir
                    </button>
                  )}
                </div>

                {/* Sugerencia de cuotas respaldadas del documento original si está como local */}
                {backupFiscalImpuestos.length > 0 && !isForeign && (
                  <div className="mb-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs shadow-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold text-amber-400 flex items-center gap-1.5">
                        <span>💡</span> Cuotas detectadas en documento original (respaldo):
                      </span>
                      {isEditing ? (
                        <button
                          type="button"
                          onClick={() => {
                            const originalBase = rawDatosExtra.backup_fiscal_origen?.importe_sin_impuestos_original;
                            if (originalBase !== undefined && originalBase !== null && !isNaN(Number(originalBase))) {
                              form.setValue('base_imponible', Number(originalBase), { shouldDirty: true });
                            }
                            form.setValue('iva_details', []);
                            backupFiscalImpuestos.forEach((imp: any) => {
                              appendIva({
                                tipo_impuesto: imp.tipo || 'IVA',
                                porcentaje: Number(imp.porcentaje) || 21,
                                base_imponible: Number(imp.base) || 0,
                                cuota: Number(imp.cuota) || 0,
                              });
                            });
                            toast({
                              title: '💡 Desglose aplicado',
                              description: 'Se copiaron las cuotas originales del respaldo y se ajustó la base imponible.',
                            });
                          }}
                          className="px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 font-semibold text-[11px] transition-colors shrink-0 flex items-center gap-1 shadow-sm"
                        >
                          Copiar al desglose
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            onEdit();
                            setTimeout(() => {
                              const originalBase = rawDatosExtra.backup_fiscal_origen?.importe_sin_impuestos_original;
                              if (originalBase !== undefined && originalBase !== null && !isNaN(Number(originalBase))) {
                                form.setValue('base_imponible', Number(originalBase), { shouldDirty: true });
                              }
                              form.setValue('iva_details', []);
                              backupFiscalImpuestos.forEach((imp: any) => {
                                appendIva({
                                  tipo_impuesto: imp.tipo || 'IVA',
                                  porcentaje: Number(imp.porcentaje) || 21,
                                  base_imponible: Number(imp.base) || 0,
                                  cuota: Number(imp.cuota) || 0,
                                });
                              });
                              toast({
                                title: '💡 Desglose aplicado',
                                description: 'Se activó la edición y se copiaron las cuotas originales.',
                              });
                            }, 50);
                          }}
                          className="px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 font-semibold text-[11px] transition-colors shrink-0 flex items-center gap-1 shadow-sm"
                        >
                          <Edit className="h-3 w-3" /> Editar y aplicar cuotas
                        </button>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {backupFiscalImpuestos.map((imp: any, i: number) => (
                        <span key={i} className="px-2 py-0.5 rounded bg-background/60 border border-amber-500/20 font-mono text-[10px] text-foreground">
                          {imp.tipo} {imp.porcentaje}%: Base {fmtEur(imp.base)} → Cuota {fmtEur(imp.cuota)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                  <div className="grid gap-2" style={{ gridTemplateColumns: '1fr 64px 1fr 24px' }}>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-1">Base</p>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground text-center">%</p>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground text-right px-1">Total</p>
                    <span />
                  </div>

                  {isEditing ? ivaFields.map((field, idx) => (
                    <div key={field.id} className="grid gap-2 group" style={{ gridTemplateColumns: '1fr 64px 1fr 24px' }}>
                      <FormField control={form.control} name={`iva_details.${idx}.base_imponible`} render={({ field: f }) => (
                        <EInput readOnly={false} type="number" value={f.value ?? 0} onChange={v => f.onChange(v)} className="text-right tabular-nums" />
                      )} />
                      <FormField control={form.control} name={`iva_details.${idx}.porcentaje`} render={({ field: f }) => (
                        <EInput readOnly={false} type="number" value={f.value ?? 0} onChange={v => f.onChange(v)} className="text-center tabular-nums px-1" />
                      )} />
                      <FormField control={form.control} name={`iva_details.${idx}.cuota`} render={({ field: f }) => (
                        <EInput readOnly={false} type="number" value={f.value ?? 0} onChange={v => f.onChange(v)} className="text-right tabular-nums" />
                      )} />
                      <button type="button" onClick={() => removeIva(idx)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive/70 hover:text-destructive flex items-center justify-center">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )) : doc.iva_details.length === 0
                    ? <div className="py-4 border border-dashed border-border/50 rounded-md text-center"><p className="text-xs text-muted-foreground">Sin desglose de IVA</p></div>
                    : isForeign
                      ? (() => {
                          const ivaOrigenRows = (backupFiscalImpuestos as any[]).filter(
                            (imp: any) => Math.abs(Number(imp.cuota) || 0) > 0.001
                          );
                          const ispRows = doc.iva_details.filter((iva) => {
                            const tipo = (iva.tipo_impuesto || '').toUpperCase();
                            return tipo.includes('INTRA') || tipo.includes('EXTRA');
                          });
                          return (
                            <div className="space-y-2">
                              {ivaOrigenRows.length > 0 && (
                                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 overflow-hidden">
                                  <div className="px-3 py-1.5 flex items-center gap-1.5 border-b border-amber-500/20">
                                    <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">⚠️ IVA origen proveedor ({countryName}) — INDEBIDO</span>
                                    <span className="text-[10px] text-amber-400/70 ml-auto">No computa en Mod. 303</span>
                                  </div>
                                  {ivaOrigenRows.map((imp: any, i: number) => (
                                    <div key={i} className="grid gap-2 px-1 py-1" style={{ gridTemplateColumns: '1fr 64px 1fr 24px' }}>
                                      <EInput value={fmtEur(imp.base)} className="text-right tabular-nums text-amber-300/70 line-through decoration-amber-500/50" />
                                      <EInput value={`${Math.abs(Number(imp.porcentaje) || 0)}%`} className="text-center text-amber-300/70 line-through decoration-amber-500/50" />
                                      <EInput value={fmtEur(imp.cuota)} className="text-right tabular-nums text-amber-300/70 line-through decoration-amber-500/50" />
                                      <span />
                                    </div>
                                  ))}
                                </div>
                              )}
                              <div className="rounded-md border border-blue-500/30 bg-blue-500/5 overflow-hidden">
                                <div className="px-3 py-1.5 flex items-center gap-1.5 border-b border-blue-500/20">
                                  <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">🇪🇸 ISP España — IVA autorrepercutido (neto 0€)</span>
                                  <span className="text-[10px] text-blue-400/70 ml-auto">Mod. 303 · Mod. 349</span>
                                </div>
                                {ispRows.map((iva, i) => {
                                  const esRepercutido = (iva.tipo_impuesto || '').toUpperCase().includes('REPERCUTIDO');
                                  return (
                                    <div key={i} className="grid gap-2 px-1 py-1" style={{ gridTemplateColumns: '1fr 64px 1fr 24px' }}>
                                      <EInput value={fmtEur(iva.base_imponible)} className="text-right tabular-nums text-muted-foreground" />
                                      <EInput value={`${iva.porcentaje}%`} className="text-center text-blue-300" />
                                      <EInput
                                        value={fmtEur(iva.cuota)}
                                        className={`text-right tabular-nums font-semibold ${esRepercutido ? 'text-emerald-400' : 'text-blue-300'}`}
                                      />
                                      <span className="flex items-center justify-center">
                                        <span className="text-[9px] text-muted-foreground font-mono leading-none">
                                          {esRepercutido ? 'REP' : 'SOP'}
                                        </span>
                                      </span>
                                    </div>
                                  );
                                })}
                                <div className="px-3 py-1 border-t border-blue-500/20 flex justify-between items-center">
                                  <span className="text-[10px] text-muted-foreground">Neto ISP</span>
                                  <span className="text-[11px] font-bold text-blue-300 font-mono">0,00 €</span>
                                </div>
                              </div>
                            </div>
                          );
                        })()
                      : doc.iva_details.filter((iva) => {
                          const tipo = (iva.tipo_impuesto || '').toLowerCase();
                          return !tipo.includes('retencion') && !tipo.includes('reten') && !tipo.includes('irpf');
                        }).map((iva, i) => (
                        <div key={i} className="grid gap-2" style={{ gridTemplateColumns: '1fr 64px 1fr 24px' }}>
                          <EInput value={fmtEur(iva.base_imponible)} className="text-right tabular-nums text-muted-foreground" />
                          <EInput value={`${iva.porcentaje}%`} className="text-center text-muted-foreground" />
                          <EInput value={fmtEur(iva.cuota)} className="text-right tabular-nums text-foreground font-semibold" />
                          <span />
                        </div>
                      ))
                  }
                </div>
              </div>

              <Div />

              {/* Base exenta, Retenciones y Descuento */}
              <div className="grid grid-cols-2 gap-6 mt-6">
                <div><SL>Base exenta / No sujeta</SL>
                  {isEditing
                    ? <FormField control={form.control} name="base_no_sujeta" render={({ field }) => (
                        <EInput readOnly={false} type="number" value={field.value ?? 0} onChange={v => field.onChange(v)} className="text-right tabular-nums" />
                      )} />
                    : <EInput value={fmtEur(liveBaseNS)} className="text-right tabular-nums text-muted-foreground" />}
                </div>
                <div><SL>Retención (IRPF)</SL>
                  {isEditing
                    ? <FormField control={form.control} name="retencion_irpf" render={({ field }) => (
                        <EInput readOnly={false} type="number" value={field.value ?? 0} onChange={v => field.onChange(v)} className="text-right tabular-nums" />
                      )} />
                    : <EInput value={fmtEur(liveRetencion)} className="text-right tabular-nums text-muted-foreground" />}
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-6 mt-6">
                <div><SL>Descuento Global</SL>
                  {isEditing
                    ? <FormField control={form.control} name="descuento_global" render={({ field }) => (
                        <EInput readOnly={false} type="number" value={field.value ?? 0} onChange={v => field.onChange(v)} className="text-right tabular-nums text-destructive" />
                      )} />
                    : <EInput value={fmtEur(liveDescuento)} className="text-right tabular-nums text-muted-foreground" />}
                </div>
              </div>

              <Div />

              {/* Suma neta */}
              <div className="grid grid-cols-2 gap-6">
                <div><SL>Base Imponible</SL>
                  {isEditing
                    ? <FormField control={form.control} name="base_imponible" render={({ field }) => (
                        <EInput readOnly={false} type="number" value={field.value ?? 0} onChange={v => field.onChange(v)} className="text-right tabular-nums" />
                      )} />
                    : <EInput value={fmtEur(liveBase)} className="text-right tabular-nums text-muted-foreground" />}
                </div>
              </div>

              {/* Summary table */}
              <div className="rounded-md border border-border overflow-hidden shadow-sm mt-6">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr style={{ background: 'hsl(var(--muted)/0.5)' }}>
                      <th className="text-center px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground w-16">%</th>
                      <th className="text-right px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Base</th>
                      <th className="text-right px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">IVA</th>
                      <th className="text-right px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {liveIvaRows.map((iva: any, i: number) => (
                      <tr key={i} className="border-t border-border/40 hover:bg-muted/10 transition-colors">
                        <td className="px-3 py-2 text-center font-medium text-muted-foreground">{iva.porcentaje}%</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{fmtEur(iva.base_imponible)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{fmtEur(iva.cuota)}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium text-foreground">
                          {fmtEur(Number(iva.base_imponible || 0) + Number(iva.cuota || 0))}
                        </td>
                      </tr>
                    ))}
                    
                    {liveBaseNS > 0 && (
                      <tr className="border-t border-border/40">
                        <td colSpan={3} className="px-3 py-2 text-right font-medium text-xs text-muted-foreground">Base exenta / no sujeta</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{fmtEur(liveBaseNS)}</td>
                      </tr>
                    )}
                    {liveDescuento > 0 && (
                      <tr className="border-t border-border/40">
                        <td colSpan={3} className="px-3 py-2 text-right font-medium text-xs text-muted-foreground">Descuento Global</td>
                        <td className="px-3 py-2 text-right tabular-nums text-destructive">-{fmtEur(liveDescuento)}</td>
                      </tr>
                    )}
                    {liveRetencion > 0 && (
                      <tr className="border-t border-border/40">
                        <td colSpan={3} className="px-3 py-2 text-right font-medium text-xs text-muted-foreground">Retención (IRPF)</td>
                        <td className="px-3 py-2 text-right tabular-nums text-destructive">-{fmtEur(liveRetencion)}</td>
                      </tr>
                    )}

                    <tr className="border-t-2 border-primary/30" style={{ background: 'hsl(var(--primary)/0.08)' }}>
                      <td className="px-3 py-3 font-bold text-sm tracking-wide">TOTAL</td>
                      <td className="px-3 py-3 text-right tabular-nums font-semibold opacity-90">{fmtEur(liveBase)}</td>
                      <td />
                      <td className="px-3 py-3 text-right tabular-nums font-bold text-lg text-primary">{fmtEur(liveTotal)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* ── DATOS ECONÓMICOS DETECTADOS EN NO FACTURABLES (SI EXISTEN VALORES REALES) ── */}
          {hasNfEconomicData && (
            <div className="mt-6 space-y-3">
              <Div />
              <div className="p-3.5 rounded-xl border border-border/70 bg-muted/20 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <span>📊</span> Datos económicos detectados en el documento
                  </span>
                  <span className="text-[10px] text-muted-foreground italic">
                    Informativo · Sin liquidación IVA
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1 text-xs">
                  {liveBase > 0 && (
                    <div className="p-2 rounded-lg bg-background/60 border border-border/40">
                      <p className="text-[10px] text-muted-foreground uppercase font-medium">Base / Importe</p>
                      <p className="font-mono font-bold text-foreground mt-0.5">{fmtEur(liveBase)}</p>
                    </div>
                  )}
                  {liveRetencion > 0 && (
                    <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                      <p className="text-[10px] text-amber-400 uppercase font-medium">Retención (IRPF)</p>
                      <p className="font-mono font-bold text-amber-300 mt-0.5">{fmtEur(liveRetencion)}</p>
                    </div>
                  )}
                  {liveBaseNS > 0 && (
                    <div className="p-2 rounded-lg bg-background/60 border border-border/40">
                      <p className="text-[10px] text-muted-foreground uppercase font-medium">Exenta / No sujeta</p>
                      <p className="font-mono font-bold text-foreground mt-0.5">{fmtEur(liveBaseNS)}</p>
                    </div>
                  )}
                  {liveTotal > 0 && (
                    <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                      <p className="text-[10px] text-emerald-400 uppercase font-medium">Total</p>
                      <p className="font-mono font-bold text-emerald-300 mt-0.5">{fmtEur(liveTotal)}</p>
                    </div>
                  )}
                </div>

                {doc.iva_details && doc.iva_details.filter((t: any) => Math.abs(Number(t.cuota) || 0) > 0.001).length > 0 && (
                  <div className="pt-2 border-t border-border/40 text-[11px] text-muted-foreground flex flex-wrap items-center gap-1.5">
                    <span className="font-medium text-foreground/80">Cuotas detectadas:</span>
                    {doc.iva_details.filter((t: any) => Math.abs(Number(t.cuota) || 0) > 0.001).map((imp: any, i: number) => (
                      <span key={i} className="px-1.5 py-0.5 rounded bg-background/80 border border-border/40 font-mono text-[10px]">
                        {imp.porcentaje}%: {fmtEur(imp.cuota)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── SECCIÓN NOTAS / OBSERVACIONES (DOCUMENTOS NO FACTURABLES) ── */}
          {esNoFacturable && (
            <div className="mt-6 space-y-3">
              <Div />
              <SL>Notas y Observaciones</SL>
              {isEditing ? (
                <FormField
                  control={form.control}
                  name="observaciones"
                  render={({ field }) => (
                    <textarea
                      value={field.value ?? ''}
                      onChange={(e) => field.onChange(e.target.value)}
                      placeholder="Añadir notas o descripción sobre este documento..."
                      rows={3}
                      className="w-full px-3 py-2 text-xs rounded-md border border-border bg-background text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted-foreground/40 resize-none font-medium"
                    />
                  )}
                />
              ) : (
                <div className="p-3.5 rounded-lg border border-border/50 bg-muted/20 text-xs min-h-[64px]">
                  {doc.observaciones || rawDatosExtra?.observaciones ? (
                    <p className="text-foreground/90 whitespace-pre-wrap leading-relaxed">
                      {doc.observaciones || rawDatosExtra?.observaciones}
                    </p>
                  ) : (
                    <p className="italic text-muted-foreground/60">
                      Sin observaciones registradas para este documento. Puedes hacer clic en &ldquo;Editar&rdquo; para agregar notas.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Meta: Trimestre + CIF */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-6 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <span className="font-medium text-foreground/70">Trimestre:</span>
              {isEditing ? (
                <Select
                  value={currentKey}
                  onValueChange={(val) => {
                    const [a, q] = val.split('-').map(Number);
                    form.setValue('año_trimestre', a, { shouldDirty: true });
                    form.setValue('num_trimestre', q, { shouldDirty: true });
                  }}
                >
                  <SelectTrigger className="h-7 w-[140px] text-xs bg-background">
                    <SelectValue placeholder="Seleccionar trimestre" />
                  </SelectTrigger>
                  <SelectContent className="z-[100]">
                    {trimesterOptions.map((opt) => (
                      <SelectItem key={`${opt.año}-${opt.trimestre}`} value={`${opt.año}-${opt.trimestre}`}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span className="font-semibold text-foreground">
                  {doc.año_trimestre ? `${doc.año_trimestre} – T${doc.num_trimestre}` : 'Sin trimestre'}
                </span>
              )}
            </div>

            {(doc.cif || provider?.identificador_fiscal) && (
              <span>
                <span className="font-medium text-foreground/70">CIF doc:</span>{' '}
                <span className="font-mono">{doc.cif || provider?.identificador_fiscal}</span>
              </span>
            )}
          </div>

          {/* Incidencia */}
          {doc.incidencia && (
            <div className="flex gap-2 rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>{doc.incidencia_razon || 'Incidencia detectada.'}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-border px-5 py-3 space-y-2" style={{ background: 'hsl(var(--card))' }}>
          {isEditing ? (
            <div className="flex gap-2">
              <button type="button" onClick={onCancelEdit}
                className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded border border-border text-sm hover:bg-muted transition-colors">
                <X className="h-4 w-4" />Cancelar
              </button>
              <button type="submit" disabled={isSaving}
                style={{ background: '#059669' }}
                className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Guardar
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {doc.incidencia && (
                <button type="button" disabled={isValidating} onClick={onValidate}
                  style={{ background: '#059669' }}
                  className="flex items-center gap-1.5 h-8 px-3 rounded text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
                  {isValidating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  Aceptar
                </button>
              )}
              <button type="button" disabled={!isEditable} onClick={onEdit}
                style={{ background: '#059669' }}
                className={cn('flex items-center gap-1.5 h-8 px-3 rounded text-white text-sm font-medium hover:opacity-90 transition-opacity', !isEditable && 'opacity-50 cursor-not-allowed')}>
                {isEditable ? <Edit className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                Editar
              </button>
              <Popover>
                <PopoverTrigger asChild>
                  <button type="button" disabled={!isEditable}
                    className="flex items-center gap-1.5 h-8 px-3 rounded border border-border text-sm hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                    <Tag className="h-3.5 w-3.5" />Cambiar tipo
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-3" align="end">
                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-foreground">Cambiar Tipo de Documento</p>
                    <DocumentTypeSelector 
                      value={doc.tipo_documento} 
                      onChange={(newType) => {
                        form.setValue('tipo_documento', newType, { shouldDirty: true });
                        onSave();
                      }} 
                    />
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 text-xs">
            {isEditable && (
              <button type="button" disabled={isDeleting} onClick={onDelete}
                className="flex items-center gap-1.5 h-8 px-3 rounded border border-destructive/30 text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-40">
                {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                Borrar
              </button>
            )}
            <button type="button" onClick={onMarkDuplicate} className="flex items-center gap-1 h-8 px-3 rounded text-muted-foreground hover:bg-muted transition-colors">
              Marcar como duplicado
            </button>
          </div>
        </div>
      </div>

      {/* ═══ RIGHT — PDF / Visor (solo desktop) ═══ */}
      <div className="hidden md:flex md:flex-col md:flex-1 min-w-0 overflow-hidden" style={{ background: '#1a1a2a' }}>
        <div className="flex items-center px-3 py-1.5 border-b border-white/10 shrink-0" style={{ background: '#141420' }}>
          <span className="text-xs text-white/40 truncate flex-1">{docName}</span>
          {documentUrl && (
            <button onClick={() => window.open(documentUrl, '_blank')}
              className="flex items-center gap-1 text-xs text-white/40 hover:text-white transition-colors px-2 py-1 rounded hover:bg-white/10 shrink-0">
              <ExternalLink className="h-3 w-3" />Abrir
            </button>
          )}
        </div>
        <div className="flex-1 overflow-hidden relative">
          {documentUrl ? (
            (() => {
              const cleanUrl = documentUrl.split('?')[0].toLowerCase();
              const tipoArch = (doc?.archivos?.[0]?.tipo_archivo || '').toLowerCase();
              const isImage = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg'].some(ext => cleanUrl.endsWith('.' + ext) || tipoArch === ext || tipoArch.includes('image'));
              if (isImage) {
                return (
                  <div className="w-full h-full flex items-center justify-center p-4 overflow-auto bg-black/40">
                    <img src={documentUrl} alt={docName} className="max-w-full max-h-full object-contain rounded shadow-lg" />
                  </div>
                );
              }
              return (
                <iframe key={documentUrl} src={`${documentUrl}#navpanes=0&view=FitH&toolbar=1`}
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none', display: 'block' }}
                  title="Documento" />
              );
            })()
          ) : (
            <SyntheticInvoiceViewer doc={doc} />
          )}
        </div>
      </div>
      {/* ═══ MOBILE VIEWER MODAL ═══ */}
      {isMobileViewerOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex flex-col" style={{ background: '#1a1a2a' }}>
          <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 shrink-0" style={{ background: '#141420' }}>
            <span className="text-xs text-white/50 truncate flex-1 mr-2">{docName}</span>
            {documentUrl && (
              <button onClick={() => window.open(documentUrl, '_blank')}
                className="flex items-center gap-1 text-xs text-white/40 hover:text-white transition-colors px-2 py-1 rounded hover:bg-white/10 shrink-0 mr-1">
                <ExternalLink className="h-3 w-3" />Abrir
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsMobileViewerOpen(false)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-colors shrink-0"
            >
              <X className="h-3.5 w-3.5" />Cerrar
            </button>
          </div>
          <div className="flex-1 overflow-hidden relative">
            {documentUrl ? (
              (() => {
                const cleanUrl = documentUrl.split('?')[0].toLowerCase();
                const tipoArch = (doc?.archivos?.[0]?.tipo_archivo || '').toLowerCase();
                const isImage = ['png','jpg','jpeg','webp','gif','bmp','svg'].some(ext => cleanUrl.endsWith('.' + ext) || tipoArch === ext || tipoArch.includes('image'));
                if (isImage) {
                  return (
                    <div className="w-full h-full flex items-center justify-center p-4 overflow-auto bg-black/40">
                      <img src={documentUrl} alt={docName} className="max-w-full max-h-full object-contain rounded shadow-lg" />
                    </div>
                  );
                }
                return (
                  <iframe key={documentUrl} src={`${documentUrl}#navpanes=0&view=FitH&toolbar=1`}
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none', display: 'block' }}
                    title="Documento" />
                );
              })()
            ) : (
              <SyntheticInvoiceViewer doc={doc} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
