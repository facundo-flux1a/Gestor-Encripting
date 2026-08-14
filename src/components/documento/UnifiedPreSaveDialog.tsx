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
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Calendar,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  Calculator,
  Copy,
  FileCheck,
  Info,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { PreSaveIssue } from '@/lib/types';
import { QuarterOption } from './quarter-reassignment-dialog';

export interface HealthTransitionContext {
  wasInHealthCheck: boolean;
  willBeInHealthCheck: boolean;
  resolvedReason?: string;
  newIssueReason?: string;
}

export interface UnifiedPreSaveDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (resolutions: {
    año?: number;
    trimestre?: number;
    tipoDocumento?: string;
    validateAndRedirect?: boolean;
  }) => void;
  issues: PreSaveIssue[];
  quarterContext?: {
    newDate: string;
    currentQuarter: { año: number; trimestre: number };
    targetQuarter: { año: number; trimestre: number };
    naturalQuarter?: { año: number; trimestre: number };
    isPastYear?: boolean;
    isTargetClosed: boolean;
    availableQuarters: QuarterOption[];
  };
  healthTransition?: HealthTransitionContext;
}

// ── Pill badge ─────────────────────────────────────────────────────────────
function Pill({ children, color }: { children: React.ReactNode; color: 'amber' | 'orange' | 'slate' | 'blue' | 'green' }) {
  const styles = {
    amber: 'bg-amber-500/15  text-amber-400  ring-amber-500/30',
    orange: 'bg-orange-500/15 text-orange-400 ring-orange-500/30',
    slate: 'bg-slate-500/15  text-slate-400  ring-slate-500/20',
    blue: 'bg-blue-500/15   text-blue-400   ring-blue-500/30',
    green: 'bg-green-500/15  text-green-400  ring-green-500/30',
  };
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 uppercase tracking-wide', styles[color])}>
      {children}
    </span>
  );
}

// ── Section card ───────────────────────────────────────────────────────────
function IssueCard({ children, accent }: { children: React.ReactNode; accent: 'amber' | 'orange' | 'slate' | 'blue' | 'green' }) {
  const border = {
    amber: 'border-amber-500/25  bg-amber-500/[0.04]',
    orange: 'border-orange-500/25 bg-orange-500/[0.04]',
    slate: 'border-border         bg-muted/20',
    blue: 'border-blue-500/25   bg-blue-500/[0.04]',
    green: 'border-green-500/30  bg-green-500/[0.06]',
  };
  return (
    <div className={cn('rounded-xl border p-4 space-y-3 shadow-sm', border[accent])}>
      {children}
    </div>
  );
}

// ── Radio-style option row ─────────────────────────────────────────────────
function RadioOption({
  selected,
  onClick,
  label,
  sublabel,
  badge,
  accent = 'blue',
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
  sublabel?: string;
  badge?: string;
  accent?: 'blue' | 'primary' | 'violet' | 'green';
}) {
  const ringColor = { blue: 'border-blue-500 bg-blue-500', primary: 'border-primary bg-primary', violet: 'border-violet-500 bg-violet-500', green: 'border-green-500 bg-green-500' };
  const bgColor = { blue: 'bg-blue-500/10 border-blue-500/35', primary: 'bg-primary/10 border-primary/35', violet: 'bg-violet-500/10 border-violet-500/35', green: 'bg-green-500/10 border-green-500/35' };

  return (
    <div
      onClick={onClick}
      className={cn(
        'flex items-center justify-between gap-3 p-2.5 rounded-lg border cursor-pointer transition-all',
        selected ? bgColor[accent] : 'border-border/40 bg-muted/20 hover:bg-muted/40',
      )}
    >
      <div className="flex items-center gap-3">
        <div className={cn('h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0', selected ? ringColor[accent] : 'border-muted-foreground/30')}>
          {selected && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
        </div>
        <div>
          <p className="text-xs font-semibold text-foreground">{label}</p>
          {sublabel && <p className="text-[10.5px] text-muted-foreground mt-0.5">{sublabel}</p>}
        </div>
      </div>
      {badge && <span className="text-[10px] font-semibold text-blue-400 bg-blue-500/15 ring-1 ring-blue-500/20 px-2 py-0.5 rounded-full uppercase tracking-wide shrink-0">{badge}</span>}
    </div>
  );
}

// ── Alert callout (replaces the hard-to-read destructive text) ─────────────
function Callout({ type, children }: { type: 'error' | 'info'; children: React.ReactNode }) {
  const styles = {
    error: { wrap: 'bg-rose-950/60 border-rose-500/40 shadow-[inset_0_0_0_1px_rgba(244,63,94,0.15)]', icon: <XCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />, text: 'text-rose-200' },
    info: { wrap: 'bg-sky-950/60  border-sky-500/40  shadow-[inset_0_0_0_1px_rgba(56,189,248,0.10)]', icon: <Info className="h-4 w-4 text-sky-400 shrink-0 mt-0.5" />, text: 'text-sky-200' },
  };
  const s = styles[type];
  return (
    <div className={cn('flex items-start gap-2.5 rounded-lg border p-3', s.wrap)}>
      {s.icon}
      <span className={cn('text-[11.5px] leading-relaxed font-medium', s.text)}>{children}</span>
    </div>
  );
}

export function UnifiedPreSaveDialog({ isOpen, onClose, onConfirm, issues, quarterContext, healthTransition }: UnifiedPreSaveDialogProps) {
  const [selectedQuarterOption, setSelectedQuarterOption] = useState<'target' | 'current' | 'custom'>('target');
  const [customQuarterKey, setCustomQuarterKey] = useState<string>('');
  const [acceptTipoCorrection, setAcceptTipoCorrection] = useState<boolean>(true);
  const [acknowledgeMathMismatch, setAcknowledgeMathMismatch] = useState<boolean>(true);
  const [acknowledgeDuplicate, setAcknowledgeDuplicate] = useState<boolean>(true);
  const [acknowledgeChanges, setAcknowledgeChanges] = useState<boolean>(false);
  const [validateAndRedirect, setValidateAndRedirect] = useState<boolean>(true);

  const quarterIssue = issues.find(i => i.type === 'QUARTER_CHANGE');
  const tipoIssue = issues.find(i => i.type === 'TIPO_MISMATCH');
  const mathIssue = issues.find(i => i.type === 'MATH_MISMATCH');
  const duplicateIssue = issues.find(i => i.type === 'DUPLICATE_NUMBER');
  const changesIssue = issues.find(i => i.type === 'CHANGES_REVIEW');

  useEffect(() => {
    if (isOpen) {
      setAcceptTipoCorrection(true);
      setAcknowledgeMathMismatch(true);
      setAcknowledgeDuplicate(true);
      setAcknowledgeChanges(false);
      setValidateAndRedirect(true);
      if (quarterContext) {
        setSelectedQuarterOption(quarterContext.isPastYear ? 'target' : quarterContext.isTargetClosed ? 'current' : 'target');
        if (quarterContext.availableQuarters.length > 0) {
          const first = quarterContext.availableQuarters[0];
          setCustomQuarterKey(`${first.año}-T${first.trimestre}`);
        }
      }
    }
  }, [isOpen, quarterContext]);

  const isBlocked = (tipoIssue && !acceptTipoCorrection) || (duplicateIssue && !acknowledgeDuplicate) || (changesIssue && !acknowledgeChanges);

  const handleConfirm = () => {
    if (isBlocked) return;
    const resolutions: { año?: number; trimestre?: number; tipoDocumento?: string; validateAndRedirect?: boolean } = {};
    if (tipoIssue && acceptTipoCorrection && tipoIssue.suggestedValue) resolutions.tipoDocumento = tipoIssue.suggestedValue;
    if (quarterIssue && quarterContext) {
      if (selectedQuarterOption === 'target') {
        resolutions.año = quarterContext.targetQuarter.año;
        resolutions.trimestre = quarterContext.targetQuarter.trimestre;
      } else if (selectedQuarterOption === 'current') {
        resolutions.año = quarterContext.currentQuarter.año;
        resolutions.trimestre = quarterContext.currentQuarter.trimestre;
      } else {
        const [añoStr, trimStr] = customQuarterKey.split('-T');
        const año = parseInt(añoStr, 10), trimestre = parseInt(trimStr, 10);
        if (!isNaN(año) && !isNaN(trimestre)) { resolutions.año = año; resolutions.trimestre = trimestre; }
      }
    }
    if (healthTransition?.wasInHealthCheck && !healthTransition?.willBeInHealthCheck) {
      resolutions.validateAndRedirect = validateAndRedirect;
    }
    onConfirm(resolutions);
  };

  const fmtDate = (d: string) => {
    const p = d.split('-');
    return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d;
  };

  const isResolvedHealth = healthTransition?.wasInHealthCheck && !healthTransition?.willBeInHealthCheck;

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && onClose()}>
      <DialogContent className="sm:max-w-[540px] bg-[hsl(var(--card))] border border-border/60 shadow-[0_32px_64px_rgba(0,0,0,0.5)] rounded-2xl p-0 max-h-[88vh] overflow-hidden flex flex-col gap-0">

        {/* Header */}
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-border/50 shrink-0">
          <div className="flex items-center gap-3.5">
            <div className={cn(
              "h-10 w-10 rounded-xl flex items-center justify-center shrink-0 border",
              isResolvedHealth
                ? "bg-green-500/20 text-green-400 border-green-500/30"
                : "bg-amber-500/20 text-amber-400 border-amber-500/30"
            )}>
              {isResolvedHealth ? <CheckCircle2 className="h-5 w-5 text-green-400" /> : <ShieldAlert className="h-5 w-5 text-amber-400" />}
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-[15px] font-bold text-foreground tracking-tight leading-tight">
                {isResolvedHealth ? 'Resolución de Cuarentena de Seguridad' : 'Verificación previa al guardado'}
              </DialogTitle>
              <DialogDescription className="text-[12px] text-muted-foreground mt-0.5">
                {isResolvedHealth
                  ? 'Tus ediciones resuelven las inconsistencias del documento.'
                  : issues.length === 1
                    ? 'Se detectó 1 observación que requiere tu confirmación.'
                    : `Se detectaron ${issues.length} observaciones que requieren tu confirmación.`}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

          {/* ── HEALTH CHECK TRANSITION CARD ──────────────────────────── */}
          {healthTransition?.wasInHealthCheck && !healthTransition?.willBeInHealthCheck && (
            <IssueCard accent="green">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4.5 w-4.5 text-green-400 shrink-0" />
                  <span className="text-[13px] font-semibold text-foreground">🟢 Documento Cuadrado y Válido</span>
                </div>
                <Pill color="green">Cuarentena Resuelta</Pill>
              </div>

              <p className="text-[12px] text-muted-foreground leading-relaxed">
                Con las modificaciones introducidas, los totales coinciden perfectamente y se eliminan las alertas. El documento se considera listo para ingresar a contabilidad.
              </p>

              <div className="space-y-2 pt-1">
                <RadioOption
                  selected={validateAndRedirect === true}
                  onClick={() => setValidateAndRedirect(true)}
                  label="Validar e Integrar ya a Contabilidad"
                  sublabel="Saca el documento de cuarentena y sé redirigido al Health Check para continuar"
                  badge="Recomendado"
                  accent="green"
                />
                <RadioOption
                  selected={validateAndRedirect === false}
                  onClick={() => setValidateAndRedirect(false)}
                  label="Solo Guardar Cambios"
                  sublabel="Conserva las ediciones pero deja el documento en lista de cuarentena para revisión posterior"
                  accent="primary"
                />
              </div>
            </IssueCard>
          )}

          {!healthTransition?.wasInHealthCheck && healthTransition?.willBeInHealthCheck && (
            <IssueCard accent="orange">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4.5 w-4.5 text-orange-400 shrink-0" />
                  <span className="text-[13px] font-semibold text-foreground">⚠️ Entrará al Health Check</span>
                </div>
                <Pill color="orange">Atención</Pill>
              </div>
              <p className="text-[12px] text-muted-foreground leading-relaxed">
                Con los importes o datos que estás ingresando, el documento pasará al Centro de Seguridad para su revisión ({healthTransition.newIssueReason || 'descuadre entre Total y la suma de Base + IVA'}).
              </p>
            </IssueCard>
          )}

          {/* ── V1: TIPO MISMATCH ─────────────────────────────────────── */}
          {tipoIssue && (
            <IssueCard accent="amber">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <FileCheck className="h-4 w-4 text-amber-400 shrink-0" />
                  <span className="text-[13px] font-semibold text-foreground">{tipoIssue.title}</span>
                </div>
                <Pill color="amber">Obligatorio</Pill>
              </div>

              <p className="text-[12px] text-muted-foreground leading-relaxed">{tipoIssue.description}</p>

              <div
                onClick={() => setAcceptTipoCorrection(!acceptTipoCorrection)}
                className={cn(
                  'flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all',
                  acceptTipoCorrection
                    ? 'bg-amber-500/10 border-amber-500/35'
                    : 'bg-muted/30 border-border/50 hover:bg-muted/50'
                )}
              >
                <Checkbox id="accept-tipo" checked={acceptTipoCorrection} onCheckedChange={c => setAcceptTipoCorrection(!!c)} className="mt-0.5 shrink-0" />
                <div>
                  <label htmlFor="accept-tipo" className="text-[12px] font-semibold cursor-pointer text-foreground block">
                    Cambiar tipo de documento a "{tipoIssue.suggestedValue}"
                  </label>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                    Garantiza la consistencia del libro fiscal según el rol de la empresa propia en las entidades.
                  </p>
                </div>
              </div>

              {!acceptTipoCorrection && (
                <Callout type="error">
                  El tipo de documento contradice el rol de las entidades (emisor/receptor). Tenés dos opciones: marcá la casilla de arriba para cambiar el tipo a <strong>"{tipoIssue.suggestedValue}"</strong>, o hacé clic en <strong>Cancelar</strong> y editá el Proveedor o Cliente directamente en el formulario.
                </Callout>
              )}
            </IssueCard>
          )}

          {/* ── QUARTER CHANGE ────────────────────────────────────────── */}
          {quarterIssue && quarterContext && (
            <IssueCard accent="blue">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-blue-400 shrink-0" />
                  <span className="text-[13px] font-semibold text-foreground">Reasignación de Trimestre Fiscal</span>
                </div>
                <Pill color={quarterContext.isPastYear ? 'orange' : quarterContext.isTargetClosed ? 'amber' : 'blue'}>
                  {quarterContext.isPastYear
                    ? `Ejercicio anterior (${quarterContext.naturalQuarter?.año ?? ''} – T${quarterContext.naturalQuarter?.trimestre ?? ''})`
                    : quarterContext.isTargetClosed ? 'Trimestre cerrado' : `Fecha: ${fmtDate(quarterContext.newDate)}`}
                </Pill>
              </div>

              <p className="text-[12px] text-muted-foreground leading-relaxed">
                {quarterContext.isPastYear
                  ? `La fecha de emisión (${fmtDate(quarterContext.newDate)}) pertenece al ejercicio anterior (${quarterContext.naturalQuarter?.año ?? ''} - T${quarterContext.naturalQuarter?.trimestre ?? ''}). Por normativa fiscal, no se puede imputar a trimestres ya liquidados — se sugiere asignar al año actual (${quarterContext.targetQuarter.año} - T${quarterContext.targetQuarter.trimestre}).`
                  : quarterContext.isTargetClosed
                    ? `La fecha elegida corresponde al trimestre ${quarterContext.targetQuarter.año} - T${quarterContext.targetQuarter.trimestre}, el cual ya está cerrado contablemente. Elegí cómo clasificar este documento.`
                    : `La fecha de emisión ingresada corresponde al trimestre ${quarterContext.targetQuarter.año} - T${quarterContext.targetQuarter.trimestre}. Elegí a qué trimestre asignar este documento.`}
              </p>

              <div className="space-y-2">
                {(!quarterContext.isTargetClosed || quarterContext.isPastYear) && (
                  <RadioOption
                    selected={selectedQuarterOption === 'target'}
                    onClick={() => setSelectedQuarterOption('target')}
                    label={`Reasignar a ${quarterContext.targetQuarter.año} – T${quarterContext.targetQuarter.trimestre}`}
                    sublabel={
                      quarterContext.isPastYear
                        ? 'Sugerido por normativa fiscal (ejercicio fiscal activo)'
                        : 'Calculado automáticamente por la fecha de emisión'
                    }
                    badge="Sugerido"
                    accent="blue"
                  />
                )}
                <RadioOption
                  selected={selectedQuarterOption === 'current'}
                  onClick={() => setSelectedQuarterOption('current')}
                  label={`Mantener trimestre actual (${quarterContext.currentQuarter.año} – T${quarterContext.currentQuarter.trimestre})`}
                  accent="primary"
                />
                <div>
                  <RadioOption
                    selected={selectedQuarterOption === 'custom'}
                    onClick={() => setSelectedQuarterOption('custom')}
                    label="Seleccionar un trimestre disponible"
                    accent="violet"
                  />
                  {selectedQuarterOption === 'custom' && (
                    <div className="mt-2 pl-7">
                      <Select value={customQuarterKey} onValueChange={setCustomQuarterKey}>
                        <SelectTrigger className="h-8 text-xs bg-background">
                          <SelectValue placeholder="Seleccioná un trimestre" />
                        </SelectTrigger>
                        <SelectContent>
                          {quarterContext.availableQuarters.map(q => {
                            const key = `${q.año}-T${q.trimestre}`;
                            return <SelectItem key={key} value={key} className="text-xs">{q.label || `${q.año} – T${q.trimestre}`}</SelectItem>;
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              </div>
            </IssueCard>
          )}

          {/* ── CHANGES REVIEW (diff table) ───────────────────── */}
          {changesIssue && changesIssue.changedFields && (
            <IssueCard accent="slate">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Calculator className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-[13px] font-semibold text-foreground">{changesIssue.title}</span>
                </div>
                <Pill color="slate">Revisar</Pill>
              </div>

              <p className="text-[12px] text-muted-foreground leading-relaxed">{changesIssue.description}</p>

              {/* Diff table */}
              <div className="rounded-lg border border-border/60 overflow-hidden">
                <table className="w-full text-[11.5px]">
                  <thead>
                    <tr className="border-b border-border/60 bg-muted/30">
                      <th className="text-left px-3 py-2 font-semibold text-muted-foreground uppercase tracking-wider text-[10px] w-[35%]">Campo</th>
                      <th className="text-right px-3 py-2 font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Antes</th>
                      <th className="text-right px-3 py-2 font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Después</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {changesIssue.changedFields.map((f, i) => (
                      <tr key={i} className="hover:bg-muted/10 transition-colors">
                        <td className="px-3 py-2 font-medium text-muted-foreground">{f.label}</td>
                        <td className="px-3 py-2 text-right tabular-nums line-through text-muted-foreground/60">{f.before}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold text-foreground">{f.after}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div
                onClick={() => setAcknowledgeChanges(!acknowledgeChanges)}
                className={cn(
                  'flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all',
                  acknowledgeChanges
                    ? 'bg-primary/10 border-primary/35'
                    : 'bg-muted/30 border-border/50 hover:bg-muted/50'
                )}
              >
                <Checkbox
                  id="ack-changes"
                  checked={acknowledgeChanges}
                  onCheckedChange={c => setAcknowledgeChanges(!!c)}
                  className="shrink-0"
                />
                <label htmlFor="ack-changes" className="text-[12px] font-semibold cursor-pointer text-foreground">
                  Confirmé los cambios y son correctos
                </label>
              </div>

              {!acknowledgeChanges && (
                <Callout type="info">
                  Revisá la tabla de cambios y marcá la casilla para confirmar que los nuevos valores son los correctos antes de guardar.
                </Callout>
              )}
            </IssueCard>
          )}

          {/* ── V2: MATH MISMATCH ─────────────────────────────────────── */}
          {mathIssue && (
            <IssueCard accent="slate">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Calculator className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-[13px] font-semibold text-foreground">{mathIssue.title}</span>
                </div>
                <Pill color="slate">Advertencia</Pill>
              </div>

              <p className="text-[12px] text-muted-foreground leading-relaxed">{mathIssue.description}</p>

              <div className="flex items-center gap-2.5 pt-0.5">
                <Checkbox id="ack-math" checked={acknowledgeMathMismatch} onCheckedChange={c => setAcknowledgeMathMismatch(!!c)} />
                <label htmlFor="ack-math" className="text-[12px] font-medium cursor-pointer text-foreground">
                  Entendido, guardar conservando el descuadre actual
                </label>
              </div>
            </IssueCard>
          )}

          {/* ── V6: DUPLICATE NUMBER ──────────────────────────────────── */}
          {duplicateIssue && (
            <IssueCard accent="orange">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Copy className="h-4 w-4 text-orange-400 shrink-0" />
                  <span className="text-[13px] font-semibold text-foreground">{duplicateIssue.title}</span>
                </div>
                <Pill color="orange">Duplicidad</Pill>
              </div>

              <p className="text-[12px] text-muted-foreground leading-relaxed">{duplicateIssue.description}</p>

              <div
                onClick={() => setAcknowledgeDuplicate(!acknowledgeDuplicate)}
                className={cn(
                  'flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all',
                  acknowledgeDuplicate
                    ? 'bg-orange-500/10 border-orange-500/35'
                    : 'bg-muted/30 border-border/50 hover:bg-muted/50'
                )}
              >
                <Checkbox id="ack-dup" checked={acknowledgeDuplicate} onCheckedChange={c => setAcknowledgeDuplicate(!!c)} className="mt-0.5 shrink-0" />
                <div>
                  <label htmlFor="ack-dup" className="text-[12px] font-semibold cursor-pointer text-foreground block">
                    Guardar con este número de documento de todas formas
                  </label>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                    Ambos documentos con el mismo número irán al Centro de Seguridad hasta que resuelvas la duplicidad.
                  </p>
                </div>
              </div>

              {!acknowledgeDuplicate && (
                <Callout type="info">
                  No podés guardar con este número si no aceptás la duplicidad. Marcá la casilla de arriba para guardar de todas formas, o hacé clic en <strong>Cancelar</strong> para volver y modificar el campo <strong>"Nº Factura"</strong>.
                </Callout>
              )}
            </IssueCard>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="px-6 py-4 border-t border-border/50 shrink-0 flex flex-row gap-2 sm:gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={onClose} className="text-[12px] h-8 px-4">
            Cancelar
          </Button>
          <Button
            size="sm"
            disabled={!!isBlocked}
            onClick={handleConfirm}
            className={cn(
              "text-[12px] h-8 px-5 font-semibold disabled:opacity-40",
              isResolvedHealth && validateAndRedirect ? "bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-500/20" : ""
            )}
          >
            {isResolvedHealth && validateAndRedirect ? 'Validar e Integrar a Contabilidad' : 'Confirmar y Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

