'use client';

import React, { useMemo } from 'react';
import { type Document, type DocumentUpdatePayload } from '@/lib/types';
import type { UseFormReturn } from 'react-hook-form';
import { useFieldArray, useWatch } from 'react-hook-form';
import { FormField } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight, Save, Loader2, Trash2, PlusCircle, Edit, Lock, X, AlertCircle, CheckCircle2, RefreshCw, Tag, ExternalLink } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { DocumentTypeSelector } from './document-type-selector';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSidebar } from '@/components/ui/sidebar';

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
const SL = ({ children }: { children: React.ReactNode }) => (
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
}

export function ReviewInvoiceLayout({ doc, form, isEditing, isSaving, isDeleting, isValidating, isEditable, onEdit, onCancelEdit, onSave, onDelete, onValidate, onAuditMode, onMarkDuplicate }: Props) {
  const router = useRouter();
  const { setOpen, isMobile } = useSidebar();
  
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
  const documentUrl = doc?.archivos?.[0]?.ruta_archivo;
  const docName = doc?.archivos?.[0]?.nombre_archivo || `doc_${doc.id_documento}`;

  const [disponibles, setDisponibles] = React.useState<{ año: number; trimestre: number; label: string }[]>([]);
  const empresaId = doc.empresa_id || (doc as any).id_de_empresa;

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
  const liveBase   = Number(isEditing ? (fv.base_imponible ?? doc.base_imponible) : doc.base_imponible) || 0;
  const liveBaseNS = Number(isEditing ? (fv.base_no_sujeta ?? (doc as any).base_no_sujeta) : (doc as any).base_no_sujeta) || 0;
  const liveRetencion = Number(isEditing ? ((fv as any).retencion_irpf ?? (doc as any).retencion_irpf) : (doc as any).retencion_irpf) || 0;
  const liveDescuento = Number(isEditing ? (fv.descuento_global ?? (doc as any).descuento_global) : (doc as any).descuento_global) || 0;

  // Calculamos el total dinámicamente si está editando
  const liveIvaSum = liveIva.reduce((acc: number, t: any) => acc + Number(t.cuota || 0), 0);
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

  return (
    <div className="flex overflow-hidden bg-background" style={{ height: '100vh', minHeight: 0 }}>

      {/* ═══ LEFT PANEL ═══ */}
      <div className="flex flex-col border-r border-border overflow-hidden shrink-0" style={{ width: '60%', minWidth: '500px' }}>

        {/* Top bar */}
        <div style={{ background: 'hsl(var(--card))', borderBottom: '1px solid hsl(var(--border))' }}
          className="flex items-center px-4 py-3 shrink-0 gap-3">
          <button onClick={() => router.back()} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-muted/60 hover:bg-muted text-foreground text-sm font-medium transition-colors shrink-0 border border-border shadow-sm">
            <ChevronLeft className="h-4 w-4" />Atrás
          </button>
          <div className="flex-1 text-center min-w-0 overflow-hidden pr-12">
            <p className="text-sm font-bold">Revisar factura</p>
            <p className="text-[11px] font-medium truncate mt-0.5" style={{ color: statusColor }}>
              {(provider?.nombre || '—').substring(0, 22)}{(provider?.nombre || '').length > 22 ? '…' : ''} · {statusLabel}
            </p>
          </div>
        </div>

        {/* Scrollable form */}
        <div className="flex-1 overflow-y-auto px-6 py-5">

          {/* PROVEEDOR + CIF */}
          <div className="grid grid-cols-2 gap-6">
            <div><SL>Proveedor</SL>
              {isEditing
                ? <FormField control={form.control} name="proveedor" render={({ field }) => (
                    <EInput readOnly={false} value={field.value ?? ''} onChange={v => field.onChange(v)} placeholder="—" />
                  )} />
                : <EInput value={provider?.nombre || doc.proveedor || ''} placeholder="—" />}
            </div>
            <div><SL>CIF</SL>
              {isEditing
                ? <FormField control={form.control} name="cif" render={({ field }) => (
                    <EInput readOnly={false} value={field.value ?? ''} onChange={v => field.onChange(v)} className="font-mono text-foreground" placeholder="—" />
                  )} />
                : <EInput value={provider?.identificador_fiscal || doc.cif || ''} className="font-mono text-muted-foreground" placeholder="—" />}
            </div>
          </div>

          <Div />

          {/* Recibe tu empresa + Dirigida a */}
          <div className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">
                <span className="font-semibold text-foreground/90">Recibe tu empresa:</span>{' '}
                {doc.empresa_nombre || '—'} {doc.empresa_cif && <span className="font-mono text-[10px] text-muted-foreground">({doc.empresa_cif})</span>}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">
                <span className="font-semibold text-foreground/90">Dirigida a (según documento):</span>{' '}
                {client?.nombre || '—'} {client?.identificador_fiscal && <span className="font-mono text-[10px] text-muted-foreground">({client.identificador_fiscal})</span>}
              </p>
            </div>
          </div>

          <Div />

          {/* Nº FACTURA + FECHA — always inputs */}
          <div className="grid grid-cols-2 gap-6">
            <div><SL>Nº Factura</SL>
              {isEditing
                ? <FormField control={form.control} name="numero_documento" render={({ field }) => (
                    <EInput readOnly={false} value={field.value ?? ''} onChange={(v) => field.onChange(v)} className="font-mono" />
                  )} />
                : <EInput value={doc.numero_documento || ''} className="font-mono text-foreground" />}
            </div>
            <div><SL>Fecha</SL>
              {isEditing
                ? <FormField control={form.control} name="fecha_emision" render={({ field }) => (
                    <input type="date" value={toInputDate(field.value)} onChange={e => field.onChange(e.target.value || null)}
                      className="w-full px-2.5 py-2 text-sm rounded-md border border-border bg-background shadow-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
                  )} />
                : <EInput value={fmtDate(doc.fecha_emision)} />}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6 mt-6">
            <div><SL>Tipo de Documento</SL>
              {isEditing
                ? <FormField control={form.control} name="tipo_documento" render={({ field }) => (
                    <DocumentTypeSelector value={field.value ?? ''} onChange={field.onChange} />
                  )} />
                : <EInput value={doc.tipo_documento || '—'} className="font-medium text-foreground" />}
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
                : doc.iva_details.map((iva, i) => (
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
                {liveIva.map((iva: any, i: number) => (
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
              <button type="submit" disabled={isSaving || !form.formState.isDirty}
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

      {/* ═══ RIGHT — PDF ═══ */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden" style={{ background: '#1a1a2a' }}>
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
            <iframe key={documentUrl} src={`${documentUrl}#navpanes=0&view=FitH&toolbar=1`}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none', display: 'block' }}
              title="Documento" />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-white/25 gap-3 select-none">
              <svg className="h-16 w-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-sm">Sin archivo adjunto</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
