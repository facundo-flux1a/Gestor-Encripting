'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useCompanyContext } from '@/context/CompanyProvider';
import { useUploadQueue } from '@/context/UploadQueueProvider';
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import {
  ServerIcon, RefreshCw, FileText, UploadCloud,
  Trash2, CheckCircle2, XCircle, Clock, Loader2,
  ChevronDown, ChevronUp, AlertCircle, Zap, X, CheckCheck,
  Search, SlidersHorizontal, Building2,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
} from '@/components/ui/sheet';
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
import { cn } from '@/lib/utils';

interface ChildSummary {
  total: number;
  completed: number;
  failed: number;
  waiting: number;
  processing: number;
  recentActive: {
    uploadId: string;
    documentId: number | null;
    nombre: string;
    status: string;
    step: string;
    progress: number;
    mensaje: string;
    createdAt?: string;
    updatedAt?: string;
  }[];
}

interface ActiveUpload {
  uploadId: string;
  batchId?: string | null;
  empresaId?: number | null;
  documentId?: number | null;
  nombre: string;
  status: string;
  step: string;
  progress: number;
  mensaje: string;
  updatedAt: string;
  createdAt: string;
  childrenSummary: ChildSummary | null;
  isNew?: boolean;
  origen?: string | null;
}

type StatusFilter = 'all' | 'active' | 'completed' | 'failed' | 'paused';
type DateFilter = 'all' | 'today' | '7d' | '30d';

function isRateLimitPaused(job: { status?: string; step?: string; mensaje?: string }) {
  const st = (job.status || '').toLowerCase();
  if (st === 'waiting_capacity') return true;
  const s = (job.step || '').toLowerCase();
  const m = (job.mensaje || '').toLowerCase();
  return s.includes('cuota') || s.includes('cupo') || s.includes('esperando') || m.includes('pausado') || m.includes('límite') || m.includes('capacidad');
}

function isDuplicate(job: { step?: string; mensaje?: string }) {
  const s = (job.step || '').toLowerCase();
  const m = (job.mensaje || '').toLowerCase();
  return s.includes('duplicado') || m.includes('duplicado');
}

function formatDuration(start?: string, end?: string) {
  if (!start || !end) return null;
  const startTime = new Date(start).getTime();
  const endTime = new Date(end).getTime();
  const diffMs = endTime - startTime;
  if (diffMs < 0) return '0s';
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s`;
  const mins = Math.floor(diffSec / 60);
  const secs = diffSec % 60;
  return `${mins}m ${secs}s`;
}

function getStatusColor(status: string, step?: string, mensaje?: string) {
  if (isRateLimitPaused({ status, step, mensaje })) return 'text-amber-400';
  if (isDuplicate({ step, mensaje })) return 'text-amber-500';
  const s = status?.toLowerCase();
  if (s === 'completed' || s === 'completado') return 'text-green-400';
  if (s === 'failed' || s === 'fallido') return 'text-red-400';
  return 'text-primary';
}

function getStatusBadgeClass(status: string, step?: string, mensaje?: string) {
  if (isRateLimitPaused({ status, step, mensaje }))
    return 'bg-amber-500/15 text-amber-400 border border-amber-500/30';
  if (isDuplicate({ step, mensaje }))
    return 'bg-amber-500/15 text-amber-500 border border-amber-500/30';
  const s = status?.toLowerCase();
  if (s === 'completed' || s === 'completado')
    return 'bg-green-500/15 text-green-400 border border-green-500/30';
  if (s === 'failed' || s === 'fallido')
    return 'bg-red-500/15 text-red-400 border border-red-500/30';
  return 'bg-primary/10 text-primary border border-primary/20';
}

function StatusIcon({ status, step, mensaje, size = 'w-5 h-5' }: { status: string; step?: string; mensaje?: string; size?: string }) {
  if (isRateLimitPaused({ status, step, mensaje })) return <Clock className={`${size} text-amber-400`} />;
  const s = status?.toLowerCase();
  if (s === 'completed' || s === 'completado') return <CheckCircle2 className={`${size} text-green-400`} />;
  if (s === 'failed' || s === 'fallido') return <XCircle className={`${size} text-red-400`} />;
  return <Loader2 className={`${size} text-primary animate-spin`} />;
}

function getProgressColor(status?: string, step?: string, mensaje?: string) {
  if (isRateLimitPaused({ status, step, mensaje })) return '[&>*]:bg-amber-400';
  return '';
}

function cleanText(text?: string) {
  if (!text) return '';
  const cleaned = text.replace(/[🍪🧠📦✅❌⚠️🔄🚀💾📊📝🏢🛒💰⏳🔑📬📄📅🎯🔧💡🌐🎫🎉🔥⛔🚫🚨❗❓✨🏥📋🔍🏆✂🖼🛑⏱️]/gu, '').trim();
  if (cleaned.includes('prisma.') || cleaned.includes('Invalid `') || cleaned.includes('invocation:') || cleaned.includes('Provided Date object is invalid')) {
    if (cleaned.includes('fecha_vencimiento') || cleaned.includes('Date')) {
      return 'Error en el formato de fecha del documento extraído.';
    }
    return 'Error interno al guardar los datos del documento.';
  }
  return cleaned;
}

function JobCard({ job, onDelete, onDismiss, onRemoveLocally, onNavigate }: { job: ActiveUpload; onDelete: (id: string) => void; onDismiss: (id: string) => Promise<void>; onRemoveLocally: (id: string) => void; onNavigate: (documentId: number) => void }) {
  const [expanded, setExpanded] = useState(false);
  const paused = isRateLimitPaused(job);
  const cs = job.childrenSummary;
  const isFinished = ['completado', 'completed', 'fallido', 'failed'].includes(job.status?.toLowerCase());
  const isCompleted = ['completado', 'completed'].includes(job.status?.toLowerCase());
  const isBatch = cs && cs.total > 0;
  const duration = isFinished ? formatDuration(job.createdAt, job.updatedAt) : null;
  const secondsRematch = job.mensaje?.match(/Retomando en (\d+)s/);
  const secondsLeft = secondsRematch ? parseInt(secondsRematch[1]) : null;

  // Navegación: solo completados; batch expande, suelto navega
  const handleCardClick = () => {
    if (!isCompleted || dismissState !== 'idle') return;
    if (isBatch) {
      setExpanded(e => !e);
    } else if (job.documentId) {
      onNavigate(job.documentId);
    }
  };

  const [dismissState, setDismissState] = useState<'idle' | 'loading' | 'success'>('idle');

  const handleDismiss = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (dismissState !== 'idle') return;
    
    setDismissState('loading');
    try {
      await onDismiss(job.uploadId);
      setDismissState('success');
      setTimeout(() => {
        onRemoveLocally(job.uploadId);
      }, 500); // Darle tiempo a la animación final de terminar (500ms)
    } catch (error) {
      console.error(error);
      setDismissState('idle'); // Revert
    }
  };

  return (
    <div
      className={cn(
        "transition-all grid w-full min-w-0",
        dismissState === 'success' ? "duration-500 ease-in-out" : "duration-300",
        dismissState === 'idle' ? "grid-rows-[1fr]" : "",
        dismissState === 'loading' ? "grid-rows-[1fr]" : "",
        dismissState === 'success' ? "grid-rows-[0fr]" : ""
      )}
    >
      <div 
        className={cn(
           "transition-all flex flex-col",
           dismissState === 'success' ? "overflow-hidden" : "overflow-visible",
           dismissState === 'idle' ? "translate-x-0 opacity-100 duration-300 ease-in-out" : "",
           dismissState === 'loading' ? "translate-x-[25%] opacity-80 duration-[1200ms] ease-linear pointer-events-none" : "",
           dismissState === 'success' ? "translate-x-[50%] opacity-0 duration-500 ease-in-out pointer-events-none" : ""
        )}
      >
        <Card className={cn(
          'transition-all duration-300 w-full overflow-hidden',
          paused ? 'border-amber-500/40 shadow-amber-500/5 shadow-md' : 'border-border/50',
          isCompleted && !isBatch && job.documentId ? 'cursor-pointer hover:border-primary/50 hover:shadow-primary/5 hover:shadow-md' : '',
          isCompleted && isBatch ? 'cursor-pointer hover:border-primary/30' : ''
        )} onClick={handleCardClick}>
      <CardContent className="p-0">
        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className={cn('shrink-0 p-2 rounded-lg', paused ? 'bg-amber-500/10' : 'bg-primary/10')}>
                <FileText className={cn('w-4 h-4', paused ? 'text-amber-400' : 'text-primary')} />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-sm leading-tight line-clamp-1 break-all" title={job.nombre}>
                  {job.nombre || 'Documento sin nombre'}
                </h3>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5 flex-wrap">
                  <span className="font-mono opacity-70">{job.uploadId.split('_').pop()?.slice(-8)}</span>
                  {job.batchId && (
                    <>
                      <span>•</span>
                      <span className="font-mono text-primary/90" title={job.batchId}>
                        lote {job.batchId.split('_').pop()?.slice(0, 8)}
                      </span>
                    </>
                  )}
                  <span>•</span>
                  <span>{new Date(job.createdAt).toLocaleDateString('es-AR')} {new Date(job.createdAt).toLocaleTimeString('es-AR', {hour: '2-digit', minute:'2-digit'})}</span>
                  {duration && (
                    <>
                      <span>•</span>
                      <span className="font-medium text-foreground/80">{duration}</span>
                    </>
                  )}
                  {job.origen && job.origen !== 'dashboard' && (
                    <>
                      <span>•</span>
                      <span className={cn(
                        'inline-flex items-center rounded-full px-1.5 py-0.5 font-semibold',
                        job.origen === 'api'
                          ? 'bg-purple-500/15 text-purple-400'
                          : 'bg-green-500/15 text-green-400'
                      )}>
                        {job.origen === 'api' ? 'API' : 'Correo'}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium', getStatusBadgeClass(job.status, job.step, job.mensaje))}>
                <StatusIcon status={job.status} step={job.step} mensaje={job.mensaje} size="w-3 h-3" />
                {paused ? 'Esperando' : (job.status || 'Procesando')}
              </span>
              {['completado', 'completed', 'fallido', 'failed', 'error', 'permanent-fail'].includes(job.status?.toLowerCase() || '') ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground/50 hover:text-primary hover:bg-primary/10"
                  onClick={handleDismiss}
                  title="Marcar como visto"
                >
                  <X className="h-4 w-4" />
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(job.uploadId);
                  }}
                  title="Eliminar registro"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>

          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className={cn('font-medium flex items-center gap-1.5 text-xs', getStatusColor(job.status, job.step, job.mensaje))}>
                {paused && <AlertCircle className="w-3.5 h-3.5" />}
                {cleanText(job.step) || 'Iniciando'}
              </span>
              <span className="font-semibold tabular-nums text-xs">{job.progress ?? 0}%</span>
            </div>
            <Progress
              value={job.progress ?? 0}
              className={cn('h-1.5', getProgressColor(job.status, job.step, job.mensaje))}
            />
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {cleanText(job.mensaje) || 'En espera...'}
              {secondsLeft != null && (
                <span className="ml-1 text-amber-400 font-medium">({secondsLeft}s)</span>
              )}
            </p>
          </div>

          {cs && cs.total > 0 && (
            <div className="mt-3 pt-3 border-t border-border/40">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Lote — {cs.total} docs
                </span>
                <button
                  type="button"
                  onClick={() => setExpanded(!expanded)}
                  className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  {expanded ? <><ChevronUp className="w-3.5 h-3.5" /> Ocultar</> : <><ChevronDown className="w-3.5 h-3.5" /> Ver detalle</>}
                </button>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                <div className="flex items-center gap-1 text-[11px] bg-green-500/10 text-green-400 border border-green-500/20 rounded-full px-2 py-0.5">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>{cs.completed}</span>
                </div>
                {cs.processing > 0 && (
                  <div className="flex items-center gap-1 text-[11px] bg-primary/10 text-primary border border-primary/20 rounded-full px-2 py-0.5">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>{cs.processing}</span>
                  </div>
                )}
                {cs.waiting > 0 && (
                  <div className="flex items-center gap-1 text-[11px] bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-full px-2 py-0.5">
                    <Clock className="w-3 h-3" />
                    <span>{cs.waiting}</span>
                  </div>
                )}
                {cs.failed > 0 && (
                  <div className="flex items-center gap-1 text-[11px] bg-red-500/10 text-red-400 border border-red-500/20 rounded-full px-2 py-0.5">
                    <XCircle className="w-3 h-3" />
                    <span>{cs.failed}</span>
                  </div>
                )}
              </div>

              <div className="mt-2">
                <Progress
                  value={cs.total > 0 ? Math.round((cs.completed / cs.total) * 100) : 0}
                  className="h-1 [&>*]:bg-green-400"
                />
              </div>

              {expanded && cs.recentActive.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {cs.recentActive.map((child) => {
                    const childCompleted = ['completado', 'completed'].includes(child.status?.toLowerCase());
                    return (
                      <div
                        key={child.uploadId}
                        className={cn(
                          'rounded-md border px-2.5 py-1.5 text-[11px] space-y-1',
                          isRateLimitPaused(child) ? 'border-amber-500/30 bg-amber-500/5' : 'border-border/40 bg-muted/20',
                          childCompleted && child.documentId ? 'cursor-pointer hover:border-primary/50 hover:bg-primary/5' : ''
                        )}
                        onClick={(e) => {
                          if (childCompleted && child.documentId) {
                            e.stopPropagation();
                            onNavigate(child.documentId);
                          }
                        }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium line-clamp-1 flex-1" title={child.nombre}>
                            {child.nombre}
                          </span>
                          <span className={cn('flex items-center gap-1 shrink-0', getStatusColor(child.status, child.step, child.mensaje))}>
                            <StatusIcon status={child.status} step={child.step} mensaje={child.mensaje} size="w-3 h-3" />
                            {cleanText(child.step) || child.status}
                          </span>
                        </div>
                        <Progress value={child.progress ?? 0} className={cn('h-1', getProgressColor(child.status, child.step, child.mensaje))} />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {paused && (
          <div className="border-t border-amber-500/20 bg-amber-500/5 px-4 py-2 rounded-b-lg mt-auto">
            <div className="flex items-center gap-2 text-[11px] text-amber-400">
              <Zap className="w-3.5 h-3.5 shrink-0" />
              <span>Pausado por cuota — retomará automáticamente.</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
      </div>
    </div>
  );
}

const POLL_MS_OPEN = 3000;
const POLL_MS_IDLE = 15000;

export function UploadQueuePanel() {
  const { isOpen, closeQueue, openQueue } = useUploadQueue();
  const router = useRouter();
  const { toast } = useToast();
  const [activeUploads, setActiveUploads] = useState<ActiveUpload[]>([]);
  const [etaSeconds, setEtaSeconds] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [uploadToDelete, setUploadToDelete] = useState<string | null>(null);
  const { selectedCompanyIds, companies } = useCompanyContext();
  const hasActiveRef = useRef(false);

  // ── Filtros client-side ──────────────────────────────────────────────────
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  
  // Guardamos el default basado en la primera carga
  const [empresaFilter, setEmpresaFilter] = useState<number | 'all'>(
    selectedCompanyIds.length === 1 ? selectedCompanyIds[0] : 'all'
  );
  const [showFilters, setShowFilters] = useState(false);

  // Sync empresaFilter with selectedCompanyIds when it changes globally
  useEffect(() => {
    if (selectedCompanyIds.length === 1) {
      setEmpresaFilter(selectedCompanyIds[0]);
    } else {
      setEmpresaFilter('all');
    }
  }, [selectedCompanyIds]);

  // Empresas únicas presentes en los datos
  const availableEmpresas = Array.from(
    new Map(
      activeUploads
        .filter(u => u.empresaId != null)
        .map(u => [u.empresaId, u.empresaId])
    ).values()
  ) as number[];

  const filteredUploads = activeUploads.filter(job => {
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const matchNombre = job.nombre?.toLowerCase().includes(term);
      const matchId = job.uploadId.toLowerCase().includes(term);
      if (!matchNombre && !matchId) return false;
    }

    if (empresaFilter !== 'all' && job.empresaId !== empresaFilter) return false;

    if (statusFilter !== 'all') {
      const s = job.status?.toLowerCase() ?? '';
      if (statusFilter === 'active' && !['processing', 'procesando', 'waiting', 'pending'].includes(s) && !isRateLimitPaused(job) && !['completed','completado','failed','fallido','error','permanent-fail'].includes(s)) {
      } else if (statusFilter === 'active') {
        const finished = ['completed','completado','failed','fallido','error','permanent-fail'].includes(s);
        const paused = isRateLimitPaused(job);
        if (finished || paused) return false;
      } else if (statusFilter === 'completed' && !['completed','completado'].includes(s)) {
        return false;
      } else if (statusFilter === 'failed' && !['failed','fallido','error','permanent-fail'].includes(s)) {
        return false;
      } else if (statusFilter === 'paused' && !isRateLimitPaused(job)) {
        return false;
      }
    }

    if (dateFilter !== 'all') {
      const created = new Date(job.createdAt).getTime();
      const now = Date.now();
      if (dateFilter === 'today') {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        if (created < startOfDay.getTime()) return false;
      } else if (dateFilter === '7d') {
        if (created < now - 7 * 24 * 60 * 60 * 1000) return false;
      } else if (dateFilter === '30d') {
        if (created < now - 30 * 24 * 60 * 60 * 1000) return false;
      }
    }

    return true;
  });

  const activeFilterCount = [
    statusFilter !== 'all',
    dateFilter !== 'all',
    empresaFilter !== 'all' && empresaFilter !== selectedCompanyIds[0],
    searchTerm !== '',
  ].filter(Boolean).length;

  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setDateFilter('all');
    setEmpresaFilter(selectedCompanyIds.length === 1 ? selectedCompanyIds[0] : 'all');
  };

  const fetchQueue = useCallback(async (silent = false) => {
    if (!silent) setIsRefreshing(true);
    try {
      // Obtenemos TODAS las subidas de todas las empresas del usuario
      const res = await fetch(`/api/activity/active-uploads`);
      if (res.ok) {
        const data = await res.json();
        const uploads: ActiveUpload[] = data.activeUploads || [];
        setActiveUploads(uploads);
        setEtaSeconds(data.etaSeconds || 0);
        setFetchError(null);
        hasActiveRef.current = uploads.some(
          (j) => !['completado', 'completed', 'fallido', 'failed', 'error', 'permanent-fail'].includes(j.status?.toLowerCase() || '')
        );
      } else {
        const data = await res.json().catch(() => ({}));
        setFetchError(data.error || `Error ${res.status} al cargar la cola`);
      }
    } catch (error) {
      console.error('Error fetching queue:', error);
      setFetchError('No se pudo conectar con la cola de subidas');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      fetchQueue();
      const interval = setInterval(() => fetchQueue(true), POLL_MS_OPEN);
      return () => clearInterval(interval);
    }

    const softPoll = () => {
      if (hasActiveRef.current && document.visibilityState === 'visible') {
        fetchQueue(true);
      }
    };
    const interval = setInterval(softPoll, POLL_MS_IDLE);
    return () => clearInterval(interval);
  }, [isOpen, fetchQueue]);

  useEffect(() => {
    const onUploaded = () => {
      hasActiveRef.current = true;
      fetchQueue(true);
    };
    window.addEventListener('documentUploaded', onUploaded);
    return () => window.removeEventListener('documentUploaded', onUploaded);
  }, [fetchQueue]);

  useEffect(() => {
    const onOpen = () => openQueue();
    window.addEventListener('openUploadQueue', onOpen);
    return () => window.removeEventListener('openUploadQueue', onOpen);
  }, [openQueue]);

  const confirmDelete = async () => {
    if (!uploadToDelete) return;
    try {
      const res = await fetch(`/api/activity/upload/${uploadToDelete}`, { method: 'DELETE' });
      if (res.ok) setActiveUploads(prev => prev.filter(u => u.uploadId !== uploadToDelete));
    } catch (error) {
      console.error('Error calling delete:', error);
    } finally {
      setUploadToDelete(null);
    }
  };

  const dismissUpload = async (uploadId: string): Promise<void> => {
    const res = await fetch(`/api/activity/upload/${uploadId}/dismiss`, { method: 'PATCH' });
    if (!res.ok) throw new Error('Error al descartar');
  };

  const removeUploadLocally = (uploadId: string) => {
    setActiveUploads(prev => prev.filter(u => u.uploadId !== uploadId));
  };

  const dismissAll = async () => {
    if (!selectedCompanyIds.length) return;
    setIsLoading(true);
    try {
      const targetEmpresa = empresaFilter === 'all' ? selectedCompanyIds[0] : empresaFilter;
      const res = await fetch(`/api/activity/upload/dismiss-all?empresaId=${targetEmpresa}`, { method: 'PATCH' });
      if (res.ok) fetchQueue();
    } catch (error) {
      console.error('Error al descartar todos:', error);
    } finally {
      setIsLoading(false);
    }
  };

  let enColaDocs = 0;
  let completedDocs = 0;
  let pausedDocs = 0;

  const totalDocs = activeUploads.reduce((acc, j) => acc + (j.childrenSummary?.total || 1), 0);

  // Calculamos los contadores basados en los elementos FILTRADOS
  filteredUploads.forEach(j => {
    if (j.childrenSummary && j.childrenSummary.total > 0) {
       enColaDocs += j.childrenSummary.waiting + j.childrenSummary.processing;
       completedDocs += j.childrenSummary.completed;
       pausedDocs += j.childrenSummary.waiting;
    } else {
       const isCompleted = ['completado', 'completed'].includes(j.status?.toLowerCase() || '');
       const isFinished = isCompleted || ['fallido', 'failed', 'error', 'permanent-fail'].includes(j.status?.toLowerCase() || '');
       const isPaused = isRateLimitPaused(j);

       if (isCompleted) completedDocs++;
       else if (isPaused) pausedDocs++;
       else if (!isFinished) enColaDocs++;
    }
  });

  const hasFinished = filteredUploads.some(j =>
    ['completado', 'completed', 'fallido', 'failed', 'error', 'permanent-fail'].includes(j.status?.toLowerCase() || '')
  );

  return (
    <>
      <Sheet open={isOpen} onOpenChange={(open) => (open ? openQueue() : closeQueue())}>
        <SheetContent
          side="left"
          className={cn(
            'w-full sm:max-w-md md:max-w-lg p-0 flex flex-col gap-0',
            'data-[state=open]:duration-300 data-[state=closed]:duration-200',
            'data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left'
          )}
        >
          <SheetHeader className="px-5 pt-5 pb-4 border-b shrink-0 space-y-1 text-left">
            <div className="flex items-start justify-between gap-3 pr-6">
              <div className="flex items-center gap-2.5 min-w-0" data-tutorial="queue-header">
                <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                  <UploadCloud className="w-5 h-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-foreground">Cola de Subidas</h2>
                  <p className="text-xs text-muted-foreground">
                    Progreso en tiempo real de la IA
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {etaSeconds > 0 && (
                  <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary">
                    <Clock className="w-3 h-3" />
                    ~{Math.ceil(etaSeconds / 60)} min
                  </span>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => fetchQueue()}
                  disabled={isRefreshing}
                  title="Refrescar"
                  data-tutorial="queue-refresh"
                >
                  <RefreshCw className={cn('w-4 h-4', isRefreshing && 'animate-spin')} />
                </Button>
              </div>
            </div>

            {!isLoading && activeUploads.length > 0 && (
              <div className="grid grid-cols-3 gap-2 pt-2" data-tutorial="queue-stats">
                <div className="rounded-md border border-border/50 bg-muted/30 px-2.5 py-2">
                  <p className="text-[10px] text-muted-foreground">En cola</p>
                  <p className="text-lg font-bold leading-none mt-0.5">{enColaDocs}</p>
                </div>
                <div className="rounded-md border border-green-500/20 bg-green-500/5 px-2.5 py-2">
                  <p className="text-[10px] text-green-400">Guardados</p>
                  <p className="text-lg font-bold leading-none mt-0.5 text-green-400">{completedDocs}</p>
                </div>
                <div className={cn(
                  'rounded-md border px-2.5 py-2',
                  pausedDocs > 0 ? 'border-amber-500/30 bg-amber-500/5' : 'border-border/50 bg-muted/30'
                )}>
                  <p className={cn('text-[10px]', pausedDocs > 0 ? 'text-amber-400' : 'text-muted-foreground')}>Pausados</p>
                  <p className={cn('text-lg font-bold leading-none mt-0.5', pausedDocs > 0 && 'text-amber-400')}>{pausedDocs}</p>
                </div>
              </div>
            )}

            {/* ── Barra de búsqueda + toggle filtros ── */}
            {!isLoading && activeUploads.length > 0 && (
              <div className="pt-2 space-y-2" data-tutorial="queue-search">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Buscar por nombre o ID..."
                      className="pl-8 h-8 text-xs bg-muted/40 border-border/50 focus-visible:ring-primary"
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                    />
                  </div>
                  <Button
                    variant={showFilters ? 'secondary' : 'outline'}
                    size="icon"
                    className="h-8 w-8 shrink-0 relative"
                    onClick={() => setShowFilters(v => !v)}
                    title="Mostrar filtros"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    {activeFilterCount > 0 && (
                      <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-primary text-[9px] font-bold text-primary-foreground flex items-center justify-center">
                        {activeFilterCount}
                      </span>
                    )}
                  </Button>
                </div>

                {showFilters && (
                  <div className="space-y-2 pb-1 animate-in fade-in slide-in-from-top-1 duration-200">
                    {/* Status */}
                    <div>
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Estado</p>
                      <div className="flex flex-wrap gap-1">
                        {(['all','active','completed','failed','paused'] as StatusFilter[]).map(s => (
                          <button
                            key={s}
                            onClick={() => setStatusFilter(s)}
                            className={cn(
                              'px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors',
                              statusFilter === s
                                ? 'bg-primary text-primary-foreground border-primary'
                                : 'bg-muted/40 text-muted-foreground border-border/50 hover:border-primary/40'
                            )}
                          >
                            {s === 'all' ? 'Todos' : s === 'active' ? 'En proceso' : s === 'completed' ? 'Completado' : s === 'failed' ? 'Fallido' : 'Pausado'}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Fecha */}
                    <div>
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Fecha</p>
                      <div className="flex flex-wrap gap-1">
                        {(['all','today','7d','30d'] as DateFilter[]).map(d => (
                          <button
                            key={d}
                            onClick={() => setDateFilter(d)}
                            className={cn(
                              'px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors',
                              dateFilter === d
                                ? 'bg-primary text-primary-foreground border-primary'
                                : 'bg-muted/40 text-muted-foreground border-border/50 hover:border-primary/40'
                            )}
                          >
                            {d === 'all' ? 'Todas' : d === 'today' ? 'Hoy' : d === '7d' ? 'Últimos 7 días' : 'Últimos 30 días'}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Empresa — solo si hay más de una */}
                    {availableEmpresas.length > 1 && (
                      <div>
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Empresa</p>
                        <div className="flex flex-wrap gap-1">
                          <button
                            onClick={() => setEmpresaFilter('all')}
                            className={cn(
                              'px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors',
                              empresaFilter === 'all'
                                ? 'bg-primary text-primary-foreground border-primary'
                                : 'bg-muted/40 text-muted-foreground border-border/50 hover:border-primary/40'
                            )}
                          >
                            Todas
                          </button>
                          {availableEmpresas.map(eid => {
                            const company = companies.find(c => c.id === eid);
                            const name = company?.name || `#${eid}`;
                            return (
                              <button
                                key={eid}
                                onClick={() => setEmpresaFilter(eid)}
                                className={cn(
                                  'flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors',
                                  empresaFilter === eid
                                    ? 'bg-primary text-primary-foreground border-primary'
                                    : 'bg-muted/40 text-muted-foreground border-border/50 hover:border-primary/40'
                                )}
                              >
                                <Building2 className="w-3 h-3 shrink-0" />
                                <span className="line-clamp-1 max-w-[120px]" title={name}>{name}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {activeFilterCount > 0 && (
                      <button
                        onClick={clearFilters}
                        className="text-[11px] text-primary hover:underline"
                      >
                        Limpiar filtros
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {hasFinished && (
              <Button
                variant="outline"
                size="sm"
                onClick={dismissAll}
                className="mt-2 w-full h-8 text-xs"
              >
                <CheckCheck className="w-3.5 h-3.5 mr-1.5" />
                Marcar todos vistos
              </Button>
            )}
          </SheetHeader>

          <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 space-y-3" data-tutorial="queue-jobs">
            {selectedCompanyIds.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground px-4">
                <AlertCircle className="w-10 h-10 mb-3 opacity-40" />
                <p className="text-sm font-medium">Seleccioná una empresa</p>
                <p className="text-xs mt-1">La cola muestra subidas de las empresas activas en el selector.</p>
              </div>
            ) : isLoading ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <RefreshCw className="w-7 h-7 animate-spin mb-3 text-primary" />
                <p className="text-sm">Cargando cola...</p>
              </div>
            ) : fetchError ? (
              <Card className="border-destructive/40 bg-destructive/5">
                <CardContent className="flex flex-col items-center justify-center p-8 text-center gap-2">
                  <AlertCircle className="w-8 h-8 text-destructive opacity-80" />
                  <p className="text-sm font-medium text-destructive">No se pudo cargar</p>
                  <p className="text-xs text-muted-foreground">{fetchError}</p>
                  <Button variant="outline" size="sm" onClick={() => fetchQueue()}>
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                    Reintentar
                  </Button>
                </CardContent>
              </Card>
            ) : activeUploads.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 text-center text-muted-foreground border border-dashed rounded-lg">
                <ServerIcon className="w-10 h-10 mb-3 opacity-30" />
                <p className="text-sm font-medium">La cola está vacía</p>
                <p className="text-xs mt-1 px-6">No hay documentos procesándose para las empresas seleccionadas.</p>
                {totalDocs > 0 && (
                  <p className="text-[11px] mt-2 opacity-60">{totalDocs} sub-docs rastreados</p>
                )}
              </div>
            ) : filteredUploads.length === 0 && activeFilterCount > 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground border border-dashed rounded-lg">
                <Search className="w-8 h-8 mb-3 opacity-30" />
                <p className="text-sm font-medium">Sin resultados</p>
                <p className="text-xs mt-1 px-4">Ningún registro coincide con los filtros activos.</p>
                <button onClick={clearFilters} className="mt-3 text-xs text-primary hover:underline">Limpiar filtros</button>
              </div>
            ) : (
              filteredUploads.map((job) => (
                <JobCard
                  key={job.uploadId}
                  job={job}
                  onDelete={(id) => setUploadToDelete(id)}
                  onDismiss={dismissUpload}
                  onRemoveLocally={removeUploadLocally}
                  onNavigate={async (docId) => {
                    try {
                      const res = await fetch(`/api/documents/${docId}`);
                      if (res.ok) {
                        closeQueue();
                        router.push(`/documento/${docId}`);
                      } else {
                        toast({
                          title: 'Documento no encontrado',
                          description: 'El documento puede haber sido eliminado recientemente.',
                          variant: 'destructive',
                        });
                        // Opcionalmente podemos descartarlo de la lista
                        try {
                           await dismissUpload(job.uploadId);
                           removeUploadLocally(job.uploadId);
                        } catch (err) {}
                      }
                    } catch (error) {
                      console.error('Error verificando documento:', error);
                    }
                  }}
                />
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!uploadToDelete} onOpenChange={(open) => !open && setUploadToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este registro de subida?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará el registro visual de la cola, pero <strong>no borrará</strong> los documentos ya procesados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar Registro
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
