'use client';

import React, { useMemo } from 'react';
import { type Document, type DocumentUpdatePayload } from '@/lib/types';
import type { UseFormReturn } from 'react-hook-form';
import { useFieldArray, useWatch } from 'react-hook-form';
import { FormField } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { cn, fixMinioUrl } from '@/lib/utils';
import { ChevronLeft, ChevronRight, Save, Loader2, Trash2, PlusCircle, Edit, Lock, X, AlertCircle, CheckCircle2, RefreshCw, Tag, ExternalLink, Eye, Globe } from 'lucide-react';
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
        if (data?.config?.cuenta_compra) {
          setCuentaCompra(data.config.cuenta_compra);
        }
      })
      .catch(() => {});
  }, [empresaId, provider?.identificador_fiscal, doc.cif]);

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
          cuentaCompra: '4100000',
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
              <p className="text-sm font-bold">Revisar factura</p>
              {((doc as any)?.datos_extra?.canal_origen === 'api' || (doc as any)?.dashboard_correo === 'api') && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-400 border border-purple-500/30 font-mono" title="Ingresado vía API síncrona">
                  API
                </span>
              )}
            </div>
            <p className="text-[11px] font-medium truncate mt-0.5" style={{ color: statusColor }}>
              {(provider?.nombre || '—').substring(0, 22)}{(provider?.nombre || '').length > 22 ? '…' : ''} · {statusLabel}
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

          {/* ── BANNER / TOGGLE PROVEEDOR EXTRANJERO ── */}
          {isForeign ? (
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

              {/* Sugerencia de cuenta 4100000 */}
              {cuentaCompra !== '4100000' && (
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
          )}

          {/* ── MODAL CASO A: LOCAL ➔ EXTRANJERO ── */}
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

          {/* PROVEEDOR + CIF */}
          <div className="grid grid-cols-2 gap-4">
            <div className="min-w-0"><SL>Proveedor</SL>
              {isEditing
                ? <FormField control={form.control} name="proveedor" render={({ field }) => (
                    <EInput readOnly={false} value={field.value ?? ''} onChange={v => field.onChange(v)} placeholder="—" />
                  )} />
                : <EInput value={provider?.nombre || doc.proveedor || ''} placeholder="—" />}
            </div>
            <div className="min-w-0"><SL>CIF</SL>
              {isEditing
                ? <FormField control={form.control} name="cif" render={({ field }) => (
                    <EInput readOnly={false} value={field.value ?? ''} onChange={v => field.onChange(v)} className="font-mono text-foreground" placeholder="—" />
                  )} />
                : <EInput value={provider?.identificador_fiscal || doc.cif || ''} className="font-mono text-muted-foreground" placeholder="—" />}
            </div>
          </div>

          <Div />

          {/* Recibe tu empresa + Dirigida a */}
          <div className="space-y-4">
            <div>
              <SL>Recibe tu empresa</SL>
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
              <SL>Dirigida a (Cliente / Receptor)</SL>
              {isEditing ? (
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="cliente_nombre" render={({ field }) => (
                    <EInput readOnly={false} value={field.value ?? client?.nombre ?? ''} onChange={v => field.onChange(v)} placeholder="Nombre del cliente/receptor" />
                  )} />
                  <FormField control={form.control} name="cliente_cif" render={({ field }) => (
                    <EInput readOnly={false} value={field.value ?? client?.identificador_fiscal ?? ''} onChange={v => field.onChange(v)} className="font-mono" placeholder="CIF / NIF del cliente" />
                  )} />
                </div>
              ) : (
                <p className="text-xs text-muted-foreground mb-0.5">
                  <span className="font-semibold text-foreground/90">{client?.nombre || '—'}</span>{' '}
                  {client?.identificador_fiscal && <span className="font-mono text-[10px] text-muted-foreground">({client.identificador_fiscal})</span>}
                </p>
              )}
            </div>
          </div>

          <Div />

          {/* Nº FACTURA + FECHA EMISIÓN + FECHA VENCIMIENTO */}
          <div className="grid grid-cols-3 gap-4">
            <div><SL>Nº Factura</SL>
              {isEditing
                ? <FormField control={form.control} name="numero_documento" render={({ field, fieldState }) => (
                    <div>
                      <EInput readOnly={false} value={field.value ?? ''} onChange={(v) => field.onChange(v)} className={cn("font-mono", fieldState.error && "border-destructive focus:ring-destructive")} />
                      {fieldState.error && <p className="text-[11px] text-destructive mt-1 font-medium">{fieldState.error.message}</p>}
                    </div>
                  )} />
                : <EInput value={doc.numero_documento || ''} className="font-mono text-foreground" />}
            </div>
            <div><SL>Fecha Emisión</SL>
              {isEditing
                ? <FormField control={form.control} name="fecha_emision" render={({ field, fieldState }) => (
                    <div>
                      <input type="date" value={toInputDate(field.value)} onChange={e => field.onChange(e.target.value || null)}
                        className={cn("w-full px-2.5 py-2 text-sm rounded-md border border-border bg-background shadow-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50", fieldState.error && "border-destructive focus:ring-destructive")} />
                      {fieldState.error && <p className="text-[11px] text-destructive mt-1 font-medium">{fieldState.error.message}</p>}
                    </div>
                  )} />
                : <EInput value={fmtDate(doc.fecha_emision)} />}
            </div>
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
          </div>


          <div className="grid grid-cols-2 gap-6 mt-6">
            <div><SL>Tipo de Documento</SL>
              {isEditing
                ? <FormField control={form.control} name="tipo_documento" render={({ field }) => (
                    <DocumentTypeSelector value={field.value ?? ''} onChange={field.onChange} />
                  )} />
                : <EInput value={doc.tipo_documento || '—'} className="font-medium text-foreground" />}

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
              {/* header */}
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
