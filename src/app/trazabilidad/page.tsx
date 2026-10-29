'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  History, RefreshCw, ChevronDown, CheckCircle2,
  XCircle, Clock, BarChart2, CalendarDays,
  CalendarRange, Calendar as CalendarIcon, Loader2, Sparkles, FileText, Copy,
  ArrowLeft, ArrowRight, Search, Mail, UploadCloud,
  AlertTriangle, FileCheck2, Info, Terminal, Layers,
  ChevronRight, Check, Bug, ExternalLink
} from 'lucide-react';
import type { DateRange } from 'react-day-picker';
import { es } from 'date-fns/locale';
import { PageHeader } from '@/components/layout/page-header';
import { MainLayout } from '@/components/layout/main-layout';
import { CompaniesHeaderSelector } from '@/components/companies-header-selector';
import { useCompanyContext } from '@/context/CompanyProvider';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

// ─── Types ───────────────────────────────────────────────────────────────────

type Vista = 'diaria' | 'semanal' | 'mensual' | 'personalizado';
type StatusFilter = 'all' | 'Procesado' | 'Revision' | 'Fallido' | 'Duplicado';

interface SerieSlot {
  label: string;
  fecha?: string;
  total: number;
  procesados: number;
  en_revision: number;
  fallidos: number;
  duplicados: number;
}

interface BatchItem {
  id: number;
  upload_id: string;
  parent_upload_id?: string | null;
  documento_id?: number | null;
  nombre: string;
  tipo?: string;
  status?: string;
  step?: string;
  progreso?: number;
  mensaje?: string;
  error_detalle?: string;
  retry_count?: number;
  is_retry?: boolean;
  created_at: string;
  completed_at?: string;
  duracion_ms?: number | null;
}

interface Batch {
  batch_id: string;
  fecha: string;
  canal: 'correo' | 'api' | 'dashboard';
  nombre_archivo?: string;
  es_multiple?: boolean;
  archivos: number;
  procesados: number;
  en_revision: number;
  fallidos: number;
  duplicados: number;
  tiempo_total_ms: number;
  items: BatchItem[];
}

interface Resumen {
  total: number;
  procesados: number;
  en_revision: number;
  fallidos: number;
  duplicados: number;
  pendientes: number;
  pctSubida?: number;
  pctExito: number;
  tiempoMedioMs: number | null;
}

interface HistorialData {
  periodo: { desde: string; hasta: string; vista: Vista; fecha: string };
  resumen: Resumen;
  series: SerieSlot[];
  batches: Batch[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDuracion(ms: number | null | undefined): string {
  if (ms == null || ms <= 0) return '—';
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.round(ms / 60000)} min`;
}

function formatFechaAmigable(iso: string): string {
  try {
    const d = new Date(iso);
    const ahora = new Date();
    const esHoy = d.toDateString() === ahora.toDateString();
    
    const ayer = new Date();
    ayer.setDate(ahora.getDate() - 1);
    const esAyer = d.toDateString() === ayer.toDateString();

    const horaStr = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

    if (esHoy) return `Hoy a las ${horaStr}`;
    if (esAyer) return `Ayer a las ${horaStr}`;

    return `${d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}, ${horaStr}`;
  } catch {
    return iso;
  }
}

function getCanalInfo(canal: string) {
  if (canal === 'correo') {
    return {
      label: 'Recibido por Correo',
      badgeClass: 'border-indigo-500/30 bg-indigo-500/10 text-indigo-300',
      iconBg: 'bg-indigo-500/15 text-indigo-400',
      Icon: Mail,
    };
  }
  if (canal === 'api') {
    return {
      label: 'Ingreso por API',
      badgeClass: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
      iconBg: 'bg-emerald-500/15 text-emerald-400',
      Icon: Terminal,
    };
  }
  return {
    label: 'Subida desde la Web',
    badgeClass: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
    iconBg: 'bg-sky-500/15 text-sky-400',
    Icon: UploadCloud,
  };
}

function getHumanStatus(status?: string, step?: string, mensaje?: string): {
  label: string;
  colorClass: string;
  bgClass: string;
  borderClass: string;
  icon: any;
} {
  const s = (status || '').toLowerCase();
  const st = (step || '').toLowerCase();
  const m = (mensaje || '').toLowerCase();

  if (s === 'revision' || /revisi[oó]n|incidencia/i.test(`${st} ${m}`)) {
    return {
      label: 'Guardado en revisión',
      colorClass: 'text-amber-400',
      bgClass: 'bg-amber-500/10',
      borderClass: 'border-amber-500/25',
      icon: AlertTriangle,
    };
  }

  if (/procesado|completado|ok/i.test(s)) {
    return {
      label: 'Subida con éxito',
      colorClass: 'text-emerald-400',
      bgClass: 'bg-emerald-500/10',
      borderClass: 'border-emerald-500/25',
      icon: CheckCircle2,
    };
  }

  if (/duplicado/i.test(s)) {
    return {
      label: 'Ya existía (Duplicada)',
      colorClass: 'text-amber-400',
      bgClass: 'bg-amber-500/10',
      borderClass: 'border-amber-500/25',
      icon: Copy,
    };
  }

  if (/fallido|error/i.test(s)) {
    return {
      label: 'No se pudo procesar',
      colorClass: 'text-rose-400',
      bgClass: 'bg-rose-500/10',
      borderClass: 'border-rose-500/25',
      icon: XCircle,
    };
  }

  return {
    label: 'En proceso...',
    colorClass: 'text-sky-400',
    bgClass: 'bg-sky-500/10',
    borderClass: 'border-sky-500/25',
    icon: Clock,
  };
}

// ─── Subcomponentes ───────────────────────────────────────────────────────────

function TechnicalErrorAccordion({ errorDetalle }: { errorDetalle: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(errorDetalle);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mt-2 text-xs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer group"
      >
        <Bug className="h-3.5 w-3.5 text-rose-400/80 group-hover:text-rose-400" />
        <span className="underline decoration-dotted underline-offset-2">
          {open ? 'Ocultar diagnóstico técnico' : 'Ver detalle del error'}
        </span>
        <ChevronRight className={cn('h-3 w-3 transition-transform duration-150', open && 'rotate-90')} />
      </button>

      {open && (
        <div className="mt-2 rounded-xl border border-white/10 bg-slate-950/70 p-3 space-y-2 animate-in fade-in duration-150">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium text-muted-foreground">Registro de soporte técnico:</span>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md bg-white/5 hover:bg-white/10 text-slate-300 transition-colors"
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3 text-emerald-400" />
                  <span className="text-emerald-400">Copiado</span>
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3 text-slate-400" />
                  <span>Copiar diagnóstico</span>
                </>
              )}
            </button>
          </div>
          <pre className="text-[11px] font-mono text-slate-300/90 whitespace-pre-wrap break-all leading-relaxed p-2 rounded-lg bg-black/40 border border-white/5 select-text">
            {errorDetalle}
          </pre>
        </div>
      )}
    </div>
  );
}

function FriendlyMetricCard({
  title,
  value,
  subtext,
  variant = 'default',
}: {
  title: string;
  value: string | number;
  subtext: string;
  icon?: any;
  variant?: 'default' | 'success' | 'alert' | 'warning' | 'info';
  badgeText?: string;
}) {
  const variantStyles = {
    default: {
      border: 'border-white/10 hover:border-white/20',
      bg: 'bg-slate-900/40',
      valColor: 'text-foreground',
      dot: 'bg-slate-400',
    },
    success: {
      border: 'border-emerald-500/25 hover:border-emerald-500/40',
      bg: 'bg-emerald-500/[0.04]',
      valColor: 'text-emerald-400',
      dot: 'bg-emerald-400',
    },
    alert: {
      border: 'border-rose-500/25 hover:border-rose-500/40',
      bg: 'bg-rose-500/[0.04]',
      valColor: 'text-rose-400',
      dot: 'bg-rose-400',
    },
    warning: {
      border: 'border-amber-500/25 hover:border-amber-500/40',
      bg: 'bg-amber-500/[0.04]',
      valColor: 'text-amber-400',
      dot: 'bg-amber-400',
    },
    info: {
      border: 'border-sky-500/25 hover:border-sky-500/40',
      bg: 'bg-sky-500/[0.04]',
      valColor: 'text-sky-400',
      dot: 'bg-sky-400',
    },
  }[variant];

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border p-4 transition-all duration-200 backdrop-blur-sm shadow-sm flex flex-col justify-between group hover:border-white/25',
        variantStyles.border,
        variantStyles.bg
      )}
    >
      <div>
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', variantStyles.dot)} />
          <span className="text-xs font-medium text-muted-foreground truncate" title={title}>
            {title}
          </span>
        </div>
        <p className={cn('text-2xl sm:text-3xl font-bold tracking-tight tabular-nums', variantStyles.valColor)}>
          {value}
        </p>
      </div>
      <p className="text-[11px] text-muted-foreground mt-2 truncate" title={subtext}>
        {subtext}
      </p>
    </div>
  );
}

function FriendlyBarChart({
  series,
  maxVal,
  vista,
  onSelectSlot,
  loading,
}: {
  series: SerieSlot[];
  maxVal: number;
  vista: Vista;
  onSelectSlot?: (slot: SerieSlot) => void;
  loading?: boolean;
}) {
  const [hoveredSlot, setHoveredSlot] = useState<SerieSlot | null>(null);

  if (maxVal === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
        <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center text-muted-foreground mb-3">
          <CalendarDays className="h-6 w-6 opacity-60" />
        </div>
        <p className="text-sm font-medium text-foreground/80">Sin envíos registrados en este período</p>
        <p className="text-xs text-muted-foreground mt-1 max-w-sm">
          Cuando se reciban comprobantes por Web, API o Correo electrónico, verás aquí su trazabilidad día a día.
        </p>
      </div>
    );
  }

  const canDrillDown = Boolean(
    !loading &&
    onSelectSlot &&
    (vista === 'mensual' || vista === 'semanal' || (vista === 'personalizado' && series.some(s => s.label.includes('/') || s.label.startsWith('Sem'))))
  );

  return (
    <div className="space-y-3">
      {/* Detalle rápido al hacer hover */}
      <div className="min-h-6 flex items-center justify-between text-xs px-1">
        {hoveredSlot ? (
          <div className="flex items-center gap-2 font-medium animate-in fade-in duration-150 flex-wrap w-full justify-between">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-foreground font-semibold">{hoveredSlot.label}:</span>
              <span className="text-emerald-400">{hoveredSlot.procesados} listas</span>
              {hoveredSlot.en_revision > 0 && <span className="text-amber-400">· {hoveredSlot.en_revision} en revisión</span>}
              {hoveredSlot.fallidos > 0 && <span className="text-rose-400">· {hoveredSlot.fallidos} con fallos</span>}
              {hoveredSlot.duplicados > 0 && <span className="text-amber-300">· {hoveredSlot.duplicados} ya existían</span>}
              <span className="text-muted-foreground">({hoveredSlot.total} en total)</span>
            </div>
            {canDrillDown && hoveredSlot.fecha && (
              <span className="text-[11px] text-primary bg-primary/10 hover:bg-primary/20 px-2 py-0.5 rounded-full font-semibold transition-colors flex items-center gap-1 cursor-pointer">
                {vista === 'mensual' ? 'Clic para ver esta semana →' : vista === 'semanal' ? 'Clic para ver este día →' : 'Clic para ver detalle →'}
              </span>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
            <span>Pasa el cursor por encima de una barra para ver los detalles</span>
            {canDrillDown && (
              <span className="text-primary/80 font-medium hidden sm:inline">
                · Haz clic en una barra para {vista === 'mensual' ? 'filtrar por esa semana' : 'filtrar por ese día'}
              </span>
            )}
          </p>
        )}
      </div>

      {/* Gráfico de barras */}
      <div className={cn(
        "flex items-end gap-1 sm:gap-2 h-36 w-full pt-4 pb-1 overflow-x-auto scrollbar-none transition-opacity duration-200",
        loading && "opacity-60 pointer-events-none"
      )}>
        {series.map((slot) => {
          const pct = maxVal > 0 ? (slot.total / maxVal) * 100 : 0;
          const prcProcesados = slot.total > 0 ? (slot.procesados / slot.total) * 100 : 0;
          const prcRevision = slot.total > 0 ? (slot.en_revision / slot.total) * 100 : 0;
          const prcFallidos = slot.total > 0 ? (slot.fallidos / slot.total) * 100 : 0;
          const prcDuplicados = slot.total > 0 ? (slot.duplicados / slot.total) * 100 : 0;
          const hasActivity = slot.total > 0;
          const isSlotClickable = canDrillDown && Boolean(slot.fecha);

          return (
            <div
              key={slot.label}
              className={cn(
                'flex flex-col items-center gap-1.5 flex-1 min-w-[20px] sm:min-w-0 group relative h-full justify-end select-none',
                isSlotClickable ? 'cursor-pointer' : 'cursor-default'
              )}
              onMouseEnter={() => setHoveredSlot(slot)}
              onMouseLeave={() => setHoveredSlot(null)}
              onClick={() => {
                if (!loading && isSlotClickable && onSelectSlot) {
                  onSelectSlot(slot);
                }
              }}
              title={
                isSlotClickable
                  ? `${slot.label}: Clic para ${vista === 'mensual' ? 'ver semana' : 'ver día'}`
                  : slot.label
              }
            >
              {/* Riel visual contenedor */}
              <div className={cn(
                'w-full max-w-[28px] h-full flex flex-col justify-end rounded-lg p-0.5 transition-all duration-200',
                isSlotClickable
                  ? 'bg-white/[0.03] group-hover:bg-white/[0.08] group-hover:ring-1 group-hover:ring-primary/40 group-active:scale-95'
                  : 'bg-white/[0.03] group-hover:bg-white/[0.06]'
              )}>
                {hasActivity ? (
                  <div
                    className="w-full rounded-md overflow-hidden flex flex-col-reverse shadow-sm transition-all duration-300 group-hover:scale-y-105 origin-bottom"
                    style={{ height: `${Math.max(pct, 12)}%` }}
                  >
                    <div className="bg-emerald-500 group-hover:bg-emerald-400 transition-colors" style={{ height: `${prcProcesados}%` }} />
                    <div className="bg-amber-500 group-hover:bg-amber-400 transition-colors" style={{ height: `${prcRevision}%` }} />
                    <div className="bg-amber-600/70 group-hover:bg-amber-500/70 transition-colors" style={{ height: `${prcDuplicados}%` }} />
                    <div className="bg-rose-500 group-hover:bg-rose-400 transition-colors" style={{ height: `${prcFallidos}%` }} />
                  </div>
                ) : (
                  <div className="w-full h-1 bg-white/5 rounded-full" />
                )}
              </div>

              {/* Etiqueta inferior */}
              <span
                className={cn(
                  'text-[10px] font-medium transition-colors truncate max-w-full text-center leading-none',
                  hasActivity ? 'text-foreground/90 font-semibold' : 'text-muted-foreground/60',
                  isSlotClickable && 'group-hover:text-primary group-hover:font-bold'
                )}
              >
                {slot.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FriendlyBatchCard({
  batch,
  searchFilter,
}: {
  batch: Batch;
  searchFilter: string;
}) {
  const [expanded, setExpanded] = useState(false);

  // Filtrar items por búsqueda
  const filteredItems = useMemo(() => {
    if (!searchFilter.trim()) return batch.items;
    const q = searchFilter.toLowerCase();
    return batch.items.filter(
      (item) =>
        item.nombre.toLowerCase().includes(q) ||
        (item.mensaje && item.mensaje.toLowerCase().includes(q))
    );
  }, [batch.items, searchFilter]);

  const totalArchivos = batch.archivos;
  const procesados = batch.procesados;
  const enRevision = batch.en_revision;
  const fallidos = batch.fallidos;
  const duplicados = batch.duplicados;
  const pct = totalArchivos > 0 ? Math.round((procesados / totalArchivos) * 100) : 0;
  const todoExito = fallidos === 0 && enRevision === 0 && procesados > 0;

  const canalInfo = getCanalInfo(batch.canal);
  const CanalIcon = canalInfo.Icon;

  return (
    <div
      className={cn(
        'rounded-2xl border transition-all duration-200 backdrop-blur-sm overflow-hidden',
        expanded ? 'border-primary/30 bg-slate-900/60 shadow-md' : 'border-white/10 bg-slate-900/40 hover:border-white/20 hover:bg-slate-900/50'
      )}
    >
      {/* Cabecera del lote */}
      <button
        type="button"
        className="w-full flex items-center justify-between gap-3 p-4 text-left transition-colors cursor-pointer group"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-3.5 min-w-0">
          <div className={cn('rounded-xl p-2.5 shrink-0 transition-transform group-hover:scale-105', canalInfo.iconBg)}>
            <CanalIcon className="h-5 w-5" />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-foreground">
                {batch.nombre_archivo && batch.es_multiple ? batch.nombre_archivo : `${totalArchivos} ${totalArchivos === 1 ? 'documento' : 'documentos'}`}
              </span>

              <Badge variant="outline" className={cn('text-[10px] font-medium px-2 py-0.5 rounded-full', canalInfo.badgeClass)}>
                {canalInfo.label}
              </Badge>

              {batch.es_multiple && (
                <Badge variant="outline" className="text-[10px] font-medium px-2 py-0.5 rounded-full border-primary/30 bg-primary/10 text-primary flex items-center gap-1">
                  <Layers className="h-3 w-3" />
                  <span>Documento múltiple ({totalArchivos} {totalArchivos === 1 ? 'página' : 'páginas/facturas'})</span>
                </Badge>
              )}

              {/* Status pill visible siempre (cerrada o abierta la tarjeta) */}
              {todoExito && (
                <Badge variant="outline" className="text-[10px] font-semibold px-2 py-0.5 rounded-full border-emerald-500/30 bg-emerald-500/10 text-emerald-300 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                  <span>{batch.es_multiple || totalArchivos > 1 ? `Todas listas (${totalArchivos})` : 'Subió con éxito'}</span>
                </Badge>
              )}
              {fallidos > 0 && (
                <Badge variant="outline" className="text-[10px] font-semibold px-2 py-0.5 rounded-full border-rose-500/30 bg-rose-500/15 text-rose-300 flex items-center gap-1">
                  <XCircle className="h-3 w-3 text-rose-400" />
                  <span>{batch.es_multiple || totalArchivos > 1 ? `${fallidos} con fallos` : 'Falló al subir'}</span>
                </Badge>
              )}
              {enRevision > 0 && fallidos === 0 && (
                <Badge variant="outline" className="text-[10px] font-semibold px-2 py-0.5 rounded-full border-amber-500/30 bg-amber-500/15 text-amber-300 flex items-center gap-1">
                  <Clock className="h-3 w-3 text-amber-400" />
                  <span>{batch.es_multiple || totalArchivos > 1 ? `${enRevision} en revisión` : 'En revisión'}</span>
                </Badge>
              )}
              {duplicados > 0 && procesados === 0 && fallidos === 0 && enRevision === 0 && (
                <Badge variant="outline" className="text-[10px] font-semibold px-2 py-0.5 rounded-full border-amber-500/30 bg-amber-500/15 text-amber-300 flex items-center gap-1">
                  <Copy className="h-3 w-3 text-amber-400" />
                  <span>{batch.es_multiple || totalArchivos > 1 ? `${duplicados} ya existían` : 'Ya existía'}</span>
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {formatFechaAmigable(batch.fecha)}
            </p>
          </div>
        </div>

        {/* Resumen de estado a la derecha (solo para lotes con múltiples archivos / parents) */}
        <div className="flex items-center gap-3 sm:gap-4 shrink-0">
          {(batch.es_multiple || totalArchivos > 1) && (
            <div className="text-right hidden sm:block">
              {todoExito ? (
                <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400 justify-end">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Todo listo ({pct}%)</span>
                </div>
              ) : fallidos > 0 ? (
                <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-400 justify-end">
                  <AlertTriangle className="h-4 w-4" />
                  <span>{fallidos} con fallos</span>
                </div>
              ) : enRevision > 0 ? (
                <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-400 justify-end">
                  <AlertTriangle className="h-4 w-4" />
                  <span>{enRevision} en revisión</span>
                </div>
              ) : (
                <span className="text-xs font-medium text-amber-400">
                  {duplicados} ya registradas
                </span>
              )}

              <p className="text-[11px] text-muted-foreground mt-0.5">
                {procesados} de {totalArchivos} listas en el sistema
              </p>
            </div>
          )}

          <div className="flex items-center gap-1 text-xs text-muted-foreground group-hover:text-foreground transition-colors">
            <span className="hidden sm:inline font-medium">
              {expanded ? 'Ocultar' : 'Ver detalle'}
            </span>
            <div className={cn('p-1 rounded-lg bg-white/5 transition-transform duration-200', expanded && 'rotate-180')}>
              <ChevronDown className="h-4 w-4" />
            </div>
          </div>
        </div>
      </button>

      {/* Desglose de documentos individuales */}
      {expanded && (
        <div className="border-t border-white/10 bg-slate-950/40 p-3 sm:p-4 space-y-2.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground pb-1 px-1">
            <span>Comprobantes contenidos en este envío ({filteredItems.length}):</span>
            {batch.tiempo_total_ms > 0 && (
              <span>Tiempo total: {formatDuracion(batch.tiempo_total_ms)}</span>
            )}
          </div>

          {filteredItems.length === 0 ? (
            <p className="text-xs text-muted-foreground italic py-2 px-1">
              Ningún archivo coincide con la búsqueda "{searchFilter}".
            </p>
          ) : (
            filteredItems.map((item) => {
              const statusInfo = getHumanStatus(item.status, item.step, item.mensaje);
              const StatusIcon = statusInfo.icon;

              return (
                <div
                  key={item.id}
                  className="rounded-xl border border-white/5 bg-slate-900/50 p-3 hover:bg-slate-900/80 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5 min-w-0 flex-1">
                      <div className={cn('rounded-lg p-2 shrink-0 mt-0.5', statusInfo.bgClass, statusInfo.colorClass)}>
                        <StatusIcon className="h-4 w-4" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-xs sm:text-sm font-semibold text-foreground truncate max-w-md" title={item.nombre}>
                            {item.nombre}
                          </p>
                          {Boolean(item.is_retry) && (
                            <Badge variant="outline" className="text-[10px] h-4.5 px-1.5 border-amber-500/30 text-amber-400">
                              Reintentado
                            </Badge>
                          )}
                        </div>

                        {/* Estado amigable */}
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span
                            className={cn(
                              'text-xs font-medium px-2 py-0.5 rounded-full border',
                              statusInfo.bgClass,
                              statusInfo.colorClass,
                              statusInfo.borderClass
                            )}
                          >
                            {statusInfo.label}
                          </span>

                          {item.duracion_ms != null && (
                            <span className="text-[11px] text-muted-foreground">
                              tardó {formatDuracion(item.duracion_ms)}
                            </span>
                          )}
                        </div>

                        {/* Mensaje principal limpio */}
                        {item.mensaje && (
                          <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                            {item.mensaje}
                          </p>
                        )}

                        {/* Acordeón técnico colapsado si falló y tiene detalle */}
                        {item.error_detalle && /fallido|error/i.test(item.status || '') && (
                          <TechnicalErrorAccordion errorDetalle={item.error_detalle} />
                        )}
                      </div>
                    </div>

                    {/* Botón de acceso directo a la factura para comprobantes completados */}
                    {item.status && /procesado|completado|ok/i.test(item.status) && (
                      <a
                        href="/documents"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/25 transition-colors shrink-0 self-start mt-0.5"
                        title="Ver comprobante en Documentos"
                      >
                        <span>Ver factura</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// ─── Página Principal ─────────────────────────────────────────────────────────

export default function TrazabilidadPage() {
  const { selectedCompanyIds } = useCompanyContext();

  const [vista, setVista] = useState<Vista>('semanal');
  const [fechaReferencia, setFechaReferencia] = useState<string>(() => new Date().toISOString().slice(0, 10));

  // Rango personalizado (Desde - Hasta)
  const [customDesde, setCustomDesde] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 29); // Por defecto últimos 30 días
    return d.toISOString().slice(0, 10);
  });
  const [customHasta, setCustomHasta] = useState<string>(() => new Date().toISOString().slice(0, 10));

  // Estados temporales del popover desplegable
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [tempDesde, setTempDesde] = useState<string>(customDesde);
  const [tempHasta, setTempHasta] = useState<string>(customHasta);
  const [calendarRange, setCalendarRange] = useState<DateRange | undefined>(() => ({
    from: new Date(customDesde + 'T00:00:00'),
    to: new Date(customHasta + 'T00:00:00'),
  }));

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchFilter, setSearchFilter] = useState('');

  const [data, setData] = useState<HistorialData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Presets rápidos para el popover
  const presets = useMemo(() => {
    const hoy = new Date();
    const hoyStr = hoy.toISOString().slice(0, 10);

    const ayer = new Date();
    ayer.setDate(hoy.getDate() - 1);
    const ayerStr = ayer.toISOString().slice(0, 10);

    const ult7 = new Date();
    ult7.setDate(hoy.getDate() - 6);
    const ult7Str = ult7.toISOString().slice(0, 10);

    const ult14 = new Date();
    ult14.setDate(hoy.getDate() - 13);
    const ult14Str = ult14.toISOString().slice(0, 10);

    const ult30 = new Date();
    ult30.setDate(hoy.getDate() - 29);
    const ult30Str = ult30.toISOString().slice(0, 10);

    const esteMesDesde = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0, 10);
    const esteMesHasta = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).toISOString().slice(0, 10);

    const mesAntDesde = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1).toISOString().slice(0, 10);
    const mesAntHasta = new Date(hoy.getFullYear(), hoy.getMonth(), 0).toISOString().slice(0, 10);

    const anoDesde = `${hoy.getFullYear()}-01-01`;
    const anoHasta = `${hoy.getFullYear()}-12-31`;

    return [
      { id: 'hoy', label: 'Hoy', desde: hoyStr, hasta: hoyStr },
      { id: 'ayer', label: 'Ayer', desde: ayerStr, hasta: ayerStr },
      { id: 'ult7', label: 'Últimos 7 días', desde: ult7Str, hasta: hoyStr },
      { id: 'ult14', label: 'Últimos 14 días', desde: ult14Str, hasta: hoyStr },
      { id: 'ult30', label: 'Últimos 30 días', desde: ult30Str, hasta: hoyStr },
      { id: 'este_mes', label: 'Este mes', desde: esteMesDesde, hasta: esteMesHasta },
      { id: 'mes_ant', label: 'Mes pasado', desde: mesAntDesde, hasta: mesAntHasta },
      { id: 'ano', label: `Año ${hoy.getFullYear()}`, desde: anoDesde, hasta: anoHasta },
    ];
  }, []);

  const aplicarPreset = (desde: string, hasta: string) => {
    setTempDesde(desde);
    setTempHasta(hasta);
    setCalendarRange({
      from: new Date(desde + 'T00:00:00'),
      to: new Date(hasta + 'T00:00:00'),
    });
  };

  const handlePopoverOpenChange = (open: boolean) => {
    if (open) {
      setTempDesde(customDesde);
      setTempHasta(customHasta);
      setCalendarRange({
        from: customDesde ? new Date(customDesde + 'T00:00:00') : undefined,
        to: customHasta ? new Date(customHasta + 'T00:00:00') : undefined,
      });
    }
    setPopoverOpen(open);
  };

  const handleSelectCalendarRange = (range: DateRange | undefined) => {
    setCalendarRange(range);
    if (!range) return;

    if (range.from) {
      const y = range.from.getFullYear();
      const m = String(range.from.getMonth() + 1).padStart(2, '0');
      const d = String(range.from.getDate()).padStart(2, '0');
      const fromStr = `${y}-${m}-${d}`;
      setTempDesde(fromStr);

      if (range.to) {
        const y2 = range.to.getFullYear();
        const m2 = String(range.to.getMonth() + 1).padStart(2, '0');
        const d2 = String(range.to.getDate()).padStart(2, '0');
        setTempHasta(`${y2}-${m2}-${d2}`);
      } else {
        setTempHasta(fromStr);
      }
    }
  };

  const handleManualDesdeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setTempDesde(val);
    if (val && !isNaN(new Date(val + 'T00:00:00').getTime())) {
      setCalendarRange({
        from: new Date(val + 'T00:00:00'),
        to: tempHasta ? new Date(tempHasta + 'T00:00:00') : undefined,
      });
    }
  };

  const handleManualHastaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setTempHasta(val);
    if (val && !isNaN(new Date(val + 'T00:00:00').getTime())) {
      setCalendarRange({
        from: tempDesde ? new Date(tempDesde + 'T00:00:00') : undefined,
        to: new Date(val + 'T00:00:00'),
      });
    }
  };

  const aplicarRango = () => {
    if (!tempDesde || !tempHasta) return;
    const d1 = tempDesde <= tempHasta ? tempDesde : tempHasta;
    const d2 = tempDesde <= tempHasta ? tempHasta : tempDesde;
    setCustomDesde(d1);
    setCustomHasta(d2);
    setVista('personalizado');
    setPopoverOpen(false);
  };

  const tempSummaryText = useMemo(() => {
    if (!tempDesde || !tempHasta) return 'Selecciona las fechas';
    try {
      const d1 = new Date((tempDesde <= tempHasta ? tempDesde : tempHasta) + 'T00:00:00');
      const d2 = new Date((tempDesde <= tempHasta ? tempHasta : tempDesde) + 'T00:00:00');
      const diffMs = d2.getTime() - d1.getTime();
      const dias = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1);

      return `${d1.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} al ${d2.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })} (${dias} ${dias === 1 ? 'día' : 'días'})`;
    } catch {
      return `${tempDesde} → ${tempHasta}`;
    }
  }, [tempDesde, tempHasta]);

  // Referencia para cancelar peticiones previas con AbortController
  const abortControllerRef = useRef<AbortController | null>(null);

  // Cargar datos
  const cargarHistorial = useCallback(async () => {
    // Si hay una consulta previa en curso, cancelarla para evitar condiciones de carrera
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('vista', vista);
      if (vista === 'personalizado') {
        params.set('desde', customDesde);
        params.set('hasta', customHasta);
        params.set('fecha', customHasta);
      } else {
        params.set('fecha', fechaReferencia);
      }
      if (statusFilter !== 'all') params.set('status', statusFilter);

      if (selectedCompanyIds && selectedCompanyIds.length > 0) {
        selectedCompanyIds.forEach((id) => params.append('empresaIds', String(id)));
      }

      const res = await fetch(`/api/trazabilidad?${params}`, {
        signal: controller.signal,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Error ${res.status}`);
      }
      const json: HistorialData = await res.json();
      setData(json);
    } catch (e: any) {
      if (e.name === 'AbortError') return; // Cancelación intencional, no mostrar error
      setError(e.message || 'Error cargando datos de trazabilidad');
    } finally {
      if (abortControllerRef.current === controller) {
        setLoading(false);
      }
    }
  }, [vista, fechaReferencia, customDesde, customHasta, statusFilter, selectedCompanyIds]);

  useEffect(() => {
    cargarHistorial();
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [cargarHistorial]);

  // Navegar períodos (anterior / siguiente)
  const navegarPeriodo = (delta: number) => {
    if (vista === 'personalizado') {
      try {
        const d1 = new Date(customDesde + 'T00:00:00');
        const d2 = new Date(customHasta + 'T00:00:00');
        const diffDays = Math.max(1, Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24))) + 1;
        const newD1 = new Date(d1);
        newD1.setDate(d1.getDate() + delta * diffDays);
        const newD2 = new Date(d2);
        newD2.setDate(d2.getDate() + delta * diffDays);
        setCustomDesde(newD1.toISOString().slice(0, 10));
        setCustomHasta(newD2.toISOString().slice(0, 10));
      } catch {
        // ignore
      }
      return;
    }

    const d = new Date(fechaReferencia + 'T00:00:00');
    if (vista === 'diaria') d.setDate(d.getDate() + delta);
    else if (vista === 'semanal') d.setDate(d.getDate() + delta * 7);
    else d.setMonth(d.getMonth() + delta);
    setFechaReferencia(d.toISOString().slice(0, 10));
  };

  const irAHoy = () => {
    const hoyStr = new Date().toISOString().slice(0, 10);
    setFechaReferencia(hoyStr);
    if (vista === 'personalizado') {
      const d1 = new Date();
      d1.setDate(d1.getDate() - 29);
      setCustomDesde(d1.toISOString().slice(0, 10));
      setCustomHasta(hoyStr);
    }
  };

  const esHoy = vista === 'personalizado'
    ? customHasta === new Date().toISOString().slice(0, 10)
    : fechaReferencia === new Date().toISOString().slice(0, 10);

  // Formato del título del período actual
  const labelPeriodo = useMemo(() => {
    try {
      if (vista === 'personalizado') {
        if (!customDesde || !customHasta) return 'Rango personalizado';
        const d1 = new Date(customDesde + 'T00:00:00');
        const d2 = new Date(customHasta + 'T00:00:00');
        const mismoMes = d1.getMonth() === d2.getMonth() && d1.getFullYear() === d2.getFullYear();
        const mismoAno = d1.getFullYear() === d2.getFullYear();

        if (mismoMes) {
          return `${d1.getDate()} - ${d2.getDate()} de ${d1.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}`;
        }
        if (mismoAno) {
          return `${d1.getDate()} ${d1.toLocaleDateString('es-ES', { month: 'short' })} - ${d2.getDate()} ${d2.toLocaleDateString('es-ES', { month: 'short', year: 'numeric' })}`;
        }
        return `${d1.getDate()} ${d1.toLocaleDateString('es-ES', { month: 'short', year: 'numeric' })} - ${d2.getDate()} ${d2.toLocaleDateString('es-ES', { month: 'short', year: 'numeric' })}`;
      }

      const d = new Date(fechaReferencia + 'T00:00:00');
      if (vista === 'diaria') {
        return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      }
      if (vista === 'semanal') {
        const day = d.getDay();
        const diff = day === 0 ? -6 : 1 - day;
        const lun = new Date(d);
        lun.setDate(d.getDate() + diff);
        const dom = new Date(lun);
        dom.setDate(lun.getDate() + 6);
        return `Semana del ${lun.getDate()} ${lun.toLocaleDateString('es-ES', { month: 'short' })} al ${dom.getDate()} ${dom.toLocaleDateString('es-ES', { month: 'short', year: 'numeric' })}`;
      }
      return d.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    } catch {
      return fechaReferencia;
    }
  }, [fechaReferencia, vista, customDesde, customHasta]);

  // Resumen y series
  const resumen = data?.resumen;
  const series = data?.series || [];
  const maxValSerie = useMemo(() => Math.max(...series.map((s) => s.total), 0), [series]);

  // Navegación interactiva al hacer clic en las barras del gráfico
  const handleSelectSlot = useCallback((slot: SerieSlot) => {
    if (!slot.fecha) return;

    if (vista === 'mensual') {
      // De vista mensual -> saltar a la semana correspondiente
      setFechaReferencia(slot.fecha);
      setVista('semanal');
    } else if (vista === 'semanal') {
      // De vista semanal -> saltar al día específico
      setFechaReferencia(slot.fecha);
      setVista('diaria');
    } else if (vista === 'personalizado') {
      if (slot.label.includes('/')) {
        // Un día específico dentro del rango
        setFechaReferencia(slot.fecha);
        setVista('diaria');
      } else if (slot.label.startsWith('Sem')) {
        // Una semana dentro del rango
        setFechaReferencia(slot.fecha);
        setVista('semanal');
      }
    }
  }, [vista]);

  // Filtrado de batches en memoria por búsqueda
  const batchesFiltrados = useMemo(() => {
    if (!data?.batches) return [];
    if (!searchFilter.trim()) return data.batches;
    const q = searchFilter.toLowerCase();
    return data.batches.filter((b) =>
      (b.nombre_archivo && b.nombre_archivo.toLowerCase().includes(q)) ||
      b.items.some(
        (it) =>
          it.nombre.toLowerCase().includes(q) ||
          (it.mensaje && it.mensaje.toLowerCase().includes(q))
      )
    );
  }, [data?.batches, searchFilter]);

  return (
    <MainLayout>
      <div className="space-y-6 pb-12 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        {/* Cabecera Principal */}
        <PageHeader
          title="Trazabilidad de Ingesta"
          mobileTitle="Ingesta"
          icon={History}
        >
          <div className="flex items-center gap-2">
            <CompaniesHeaderSelector />
            <Button
              variant="outline"
              size="sm"
              onClick={cargarHistorial}
              disabled={loading}
              className="gap-1.5"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
              <span className="hidden sm:inline">Actualizar</span>
            </Button>
          </div>
        </PageHeader>

        {/* Banner informativo si no hay empresa seleccionada */}
        {selectedCompanyIds.length === 0 && (
          <div className="rounded-2xl border border-sky-500/30 bg-sky-500/10 p-4 text-xs text-sky-200 flex items-start gap-3">
            <Info className="h-4 w-4 text-sky-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-sky-100">Mostrando datos globales</p>
              <p className="text-sky-300/80 mt-0.5">
                Usa el selector de empresas arriba para filtrar la trazabilidad de una empresa específica.
              </p>
            </div>
          </div>
        )}

        {/* Resumen Superior */}
        {resumen && resumen.total > 0 && (() => {
          const pctSubida = resumen.pctSubida ?? Math.round(((resumen.total - resumen.fallidos) / resumen.total) * 100);
          return (
            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3 sm:gap-4">
              <FriendlyMetricCard
                title="Total Comprobantes"
                value={resumen.total}
                subtext="En el período actual"
                variant="default"
              />
              <FriendlyMetricCard
                title="Listas con éxito"
                value={resumen.procesados}
                subtext="Guardadas en el sistema"
                variant="success"
              />
              <FriendlyMetricCard
                title="En revisión"
                value={resumen.en_revision}
                subtext="Pendientes de cotejo"
                variant={resumen.en_revision > 0 ? 'warning' : 'default'}
              />
              <FriendlyMetricCard
                title="Con errores"
                value={resumen.fallidos}
                subtext={resumen.fallidos === 0 ? 'Sin incidencias' : 'Requieren atención'}
                variant={resumen.fallidos > 0 ? 'alert' : 'default'}
              />
              <FriendlyMetricCard
                title="Tasa de Subida"
                value={`${pctSubida}%`}
                subtext="Ingresadas al sistema"
                variant={pctSubida >= 90 ? 'success' : 'default'}
              />
              <FriendlyMetricCard
                title="Tasa de Éxito"
                value={`${resumen.pctExito}%`}
                subtext="Validadas sin revisión"
                variant={resumen.pctExito >= 90 ? 'success' : 'default'}
              />
              <FriendlyMetricCard
                title="Tiempo Medio"
                value={formatDuracion(resumen.tiempoMedioMs)}
                subtext="Promedio por documento"
                variant="info"
              />
            </div>
          );
        })()}

        {/* Barra de control temporal y gráfico */}
        <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-4 sm:p-5 backdrop-blur-sm space-y-4 shadow-sm">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            {/* Selector de período con Día, Semana, Mes y Desde - Hasta con calendario desplegable */}
            <div className="flex items-center gap-1 sm:gap-1.5 p-1 rounded-xl bg-slate-950/60 border border-white/10 flex-wrap">
              <Button
                size="sm"
                variant={vista === 'diaria' ? 'default' : 'ghost'}
                className="h-8 px-2.5 sm:px-3 text-xs rounded-lg font-medium transition-opacity disabled:opacity-50"
                onClick={() => setVista('diaria')}
                disabled={loading}
              >
                Día
              </Button>
              <Button
                size="sm"
                variant={vista === 'semanal' ? 'default' : 'ghost'}
                className="h-8 px-2.5 sm:px-3 text-xs rounded-lg font-medium transition-opacity disabled:opacity-50"
                onClick={() => setVista('semanal')}
                disabled={loading}
              >
                Semana
              </Button>
              <Button
                size="sm"
                variant={vista === 'mensual' ? 'default' : 'ghost'}
                className="h-8 px-2.5 sm:px-3 text-xs rounded-lg font-medium transition-opacity disabled:opacity-50"
                onClick={() => setVista('mensual')}
                disabled={loading}
              >
                Mes
              </Button>

              <div className="h-4 w-[1px] bg-white/10 mx-0.5" />

              {/* Calendario desplegable Desde - Hasta */}
              <Popover open={popoverOpen} onOpenChange={handlePopoverOpenChange}>
                <PopoverTrigger asChild>
                  <Button
                    size="sm"
                    variant={vista === 'personalizado' ? 'default' : 'ghost'}
                    disabled={loading}
                    className={cn(
                      'h-8 px-2.5 sm:px-3 text-xs rounded-lg gap-1.5 transition-colors font-medium disabled:opacity-50',
                      vista === 'personalizado'
                        ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
                        : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                    )}
                  >
                    <CalendarRange className="h-3.5 w-3.5 shrink-0" />
                    <span>Desde - Hasta</span>
                    <ChevronDown className={cn('h-3 w-3 opacity-60 transition-transform duration-200', popoverOpen && 'rotate-180')} />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  sideOffset={8}
                  className="w-[95vw] sm:w-[620px] max-w-[620px] p-0 border border-white/10 bg-slate-900/95 backdrop-blur-md shadow-2xl rounded-2xl overflow-hidden z-50 text-foreground"
                >
                  {/* Cabecera del popover */}
                  <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 bg-slate-950/50">
                    <div className="flex items-center gap-2.5">
                      <div className="h-7 w-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        <CalendarRange className="h-4 w-4" />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-foreground leading-none">Rango personalizado</h4>
                        <p className="text-[11px] text-muted-foreground mt-0.5">Selecciona el intervalo desde - hasta</p>
                      </div>
                    </div>
                    {vista === 'personalizado' && (
                      <Badge variant="outline" className="text-[10px] border-primary/30 text-primary bg-primary/10 shrink-0">
                        Filtro Activo
                      </Badge>
                    )}
                  </div>

                  {/* Cuerpo: Presets a la izquierda + Inputs y Calendario a la derecha */}
                  <div className="flex flex-col sm:flex-row divide-y sm:divide-y-0 sm:divide-x divide-white/10">
                    {/* Accesos rápidos */}
                    <div className="p-3 w-full sm:w-44 shrink-0 flex flex-col gap-1 bg-slate-950/20">
                      <span className="text-[10px] font-semibold tracking-wider uppercase text-muted-foreground px-2 py-1">
                        Accesos rápidos
                      </span>
                      <div className="grid grid-cols-2 sm:grid-cols-1 gap-1">
                        {presets.map((preset) => {
                          const isSelected = tempDesde === preset.desde && tempHasta === preset.hasta;
                          return (
                            <button
                              key={preset.id}
                              type="button"
                              onClick={() => aplicarPreset(preset.desde, preset.hasta)}
                              className={cn(
                                'text-left px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center justify-between group',
                                isSelected
                                  ? 'bg-primary/20 text-primary font-semibold'
                                  : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'
                              )}
                            >
                              <span className="truncate">{preset.label}</span>
                              <ChevronRight className={cn('h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity shrink-0', isSelected && 'opacity-100 text-primary')} />
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Inputs manuales + Calendario interactivo */}
                    <div className="p-3.5 sm:p-4 space-y-3 flex-1 flex flex-col justify-between">
                      <div className="grid grid-cols-2 gap-2.5">
                        <div className="space-y-1">
                          <label className="text-[11px] font-medium text-muted-foreground">
                            Fecha Desde
                          </label>
                          <Input
                            type="date"
                            value={tempDesde}
                            onChange={handleManualDesdeChange}
                            className="h-8 text-xs bg-slate-950/60 border-white/10 text-foreground"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[11px] font-medium text-muted-foreground">
                            Fecha Hasta
                          </label>
                          <Input
                            type="date"
                            value={tempHasta}
                            onChange={handleManualHastaChange}
                            className="h-8 text-xs bg-slate-950/60 border-white/10 text-foreground"
                          />
                        </div>
                      </div>

                      <div className="rounded-xl border border-white/5 bg-slate-950/40 p-1 flex justify-center overflow-hidden">
                        <Calendar
                          mode="range"
                          locale={es}
                          selected={calendarRange}
                          onSelect={handleSelectCalendarRange}
                          defaultMonth={calendarRange?.from || new Date()}
                          numberOfMonths={1}
                          className="p-1"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Pie del popover */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 border-t border-white/10 px-4 py-3 bg-slate-950/50">
                    <div className="text-xs text-muted-foreground font-medium truncate">
                      {tempSummaryText}
                    </div>
                    <div className="flex items-center gap-2 justify-end shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => setPopoverOpen(false)}
                      >
                        Cancelar
                      </Button>
                      <Button
                        size="sm"
                        variant="default"
                        className="h-8 text-xs gap-1.5 font-medium shadow-sm"
                        onClick={aplicarRango}
                        disabled={!tempDesde || !tempHasta}
                      >
                        <Check className="h-3.5 w-3.5" />
                        <span>Aplicar rango</span>
                      </Button>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex items-center gap-2 self-stretch sm:self-auto justify-between sm:justify-end">
              <Button
                size="sm"
                variant="outline"
                className="h-8 w-8 p-0 disabled:opacity-50"
                onClick={() => navegarPeriodo(-1)}
                disabled={loading}
                title="Período anterior"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>

              <span className="text-xs sm:text-sm font-semibold capitalize text-foreground px-2 text-center">
                {labelPeriodo}
              </span>

              <Button
                size="sm"
                variant="outline"
                className="h-8 w-8 p-0 disabled:opacity-50"
                onClick={() => navegarPeriodo(1)}
                disabled={loading}
                title="Período siguiente"
              >
                <ArrowRight className="h-4 w-4" />
              </Button>

              {!esHoy && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                  onClick={irAHoy}
                  disabled={loading}
                >
                  Hoy
                </Button>
              )}
            </div>
          </div>

          <FriendlyBarChart
            series={series}
            maxVal={maxValSerie}
            vista={vista}
            onSelectSlot={handleSelectSlot}
            loading={loading}
          />
        </div>

        {/* Filtros de la lista */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
            {[
              { id: 'all', label: 'Todos', count: resumen?.total },
              { id: 'Procesado', label: 'Con éxito', count: resumen?.procesados },
              { id: 'Revision', label: 'En revisión', count: resumen?.en_revision },
              { id: 'Fallido', label: 'Con fallos', count: resumen?.fallidos },
              { id: 'Duplicado', label: 'Duplicados', count: resumen?.duplicados },
            ].map((opt) => (
              <Button
                key={opt.id}
                size="sm"
                variant={statusFilter === opt.id ? 'default' : 'outline'}
                disabled={loading}
                className={cn(
                  'h-8 text-xs rounded-xl shrink-0 gap-1.5 disabled:opacity-50',
                  statusFilter === opt.id ? 'shadow-sm' : 'border-white/10 hover:border-white/20'
                )}
                onClick={() => setStatusFilter(opt.id as StatusFilter)}
              >
                <span>{opt.label}</span>
                {opt.count != null && opt.count > 0 && (
                  <span
                    className={cn(
                      'text-[10px] px-1.5 py-0.2 rounded-full font-semibold',
                      statusFilter === opt.id ? 'bg-white/20 text-white' : 'bg-white/10 text-muted-foreground'
                    )}
                  >
                    {opt.count}
                  </span>
                )}
              </Button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="h-3.5 w-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Buscar por archivo o mensaje..."
              className="h-8 pl-8 text-xs bg-slate-900/40 border-white/10 rounded-xl"
            />
          </div>
        </div>

        {/* Lista de envíos */}
        <div className="space-y-3">
          {loading && !data && (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin mb-3 text-primary" />
              <p className="text-sm font-medium">Cargando trazabilidad de envíos...</p>
            </div>
          )}

          {error && (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-300">
              <p className="font-semibold text-rose-200">Error al cargar datos</p>
              <p className="mt-1">{error}</p>
            </div>
          )}

          {data && batchesFiltrados.length === 0 && (
            <div className="rounded-2xl border border-white/10 bg-slate-900/30 p-12 text-center">
              <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center text-muted-foreground mx-auto mb-3">
                <FileText className="h-6 w-6 opacity-60" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">No se encontraron envíos</h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                {searchFilter
                  ? `No hay envíos que coincidan con "${searchFilter}".`
                  : 'No hay envíos registrados en el período y filtro seleccionados.'}
              </p>
              {!esHoy && !searchFilter.trim() && (
                <Button size="sm" variant="outline" className="mt-4 text-xs rounded-xl" onClick={irAHoy}>
                  Volver al día de hoy
                </Button>
              )}
            </div>
          )}

          {batchesFiltrados.map((batch) => (
            <FriendlyBatchCard
              key={batch.batch_id}
              batch={batch}
              searchFilter={searchFilter}
            />
          ))}
        </div>
      </div>
    </MainLayout>
  );
}
