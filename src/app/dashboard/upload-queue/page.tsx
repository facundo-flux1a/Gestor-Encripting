'use client';

import { MainLayout } from '@/components/layout/main-layout';
import { useEffect, useState } from 'react';
import { useCompanyContext } from '@/context/CompanyProvider';
import { Progress } from '@/components/ui/progress';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent } from '@/components/ui/card';
import {
  ServerIcon, RefreshCw, FileText, UploadCloud,
  Trash2, CheckCircle2, XCircle, Clock, Loader2,
  ChevronDown, ChevronUp, AlertCircle, Zap, X, CheckCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
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

interface ChildSummary {
  total: number;
  completed: number;
  failed: number;
  waiting: number;
  processing: number;
  recentActive: {
    uploadId: string;
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
  nombre: string;
  status: string;
  step: string;
  progress: number;
  mensaje: string;
  updatedAt: string;
  createdAt: string;
  childrenSummary: ChildSummary | null;
  isNew?: boolean;
}

// ─── Helpers de estado ────────────────────────────────────────────────────────

function isRateLimitPaused(job: { step?: string; mensaje?: string }) {
  const s = (job.step || '').toLowerCase();
  const m = (job.mensaje || '').toLowerCase();
  return s.includes('cuota') || s.includes('esperando') || m.includes('pausado') || m.includes('límite');
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
  if (isRateLimitPaused({ step, mensaje })) return 'text-amber-400';
  if (isDuplicate({ step, mensaje })) return 'text-amber-500';
  const s = status?.toLowerCase();
  if (s === 'completed' || s === 'completado') return 'text-green-400';
  if (s === 'failed' || s === 'fallido') return 'text-red-400';
  return 'text-primary';
}

function getStatusBadgeClass(status: string, step?: string, mensaje?: string) {
  if (isRateLimitPaused({ step, mensaje }))
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
  if (isRateLimitPaused({ step, mensaje })) return <Clock className={`${size} text-amber-400`} />;
  const s = status?.toLowerCase();
  if (s === 'completed' || s === 'completado') return <CheckCircle2 className={`${size} text-green-400`} />;
  if (s === 'failed' || s === 'fallido') return <XCircle className={`${size} text-red-400`} />;
  return <Loader2 className={`${size} text-primary animate-spin`} />;
}

function getProgressColor(step?: string, mensaje?: string) {
  if (isRateLimitPaused({ step, mensaje })) return '[&>*]:bg-amber-400';
  return '';
}

function cleanText(text?: string) {
  if (!text) return '';
  // Remover emojis comunes usados en los workers
  return text.replace(/[🍪🧠📦✅❌⚠️🔄🚀💾📊📝🏢🛒💰⏳🔑📬📄📅🎯🔧💡🌐🎫🎉🔥⛔🚫🚨❗❓✨🏥📋🔍🏆✂🖼🛑⏱️]/gu, '').trim();
}

// ─── Sub-componente: Tarjeta de Job Principal ─────────────────────────────────

function JobCard({ job, onDelete, onDismiss }: { job: ActiveUpload; onDelete: (id: string) => void; onDismiss: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const paused = isRateLimitPaused(job);
  const cs = job.childrenSummary;
  const isFinished = ['completado', 'completed', 'fallido', 'failed'].includes(job.status?.toLowerCase());
  const duration = isFinished ? formatDuration(job.createdAt, job.updatedAt) : null;

  const secondsRematch = job.mensaje?.match(/Retomando en (\d+)s/);
  const secondsLeft = secondsRematch ? parseInt(secondsRematch[1]) : null;

  return (
    <Card className={`transition-all duration-300 ${paused ? 'border-amber-500/40 shadow-amber-500/5 shadow-md' : 'border-border/50'}`}>
      <CardContent className="p-0">
        {/* Header de la tarjeta */}
        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className={`shrink-0 p-2 rounded-lg ${paused ? 'bg-amber-500/10' : 'bg-primary/10'}`}>
                <FileText className={`w-5 h-5 ${paused ? 'text-amber-400' : 'text-primary'}`} />
              </div>
              <div className="min-w-0">
                <h3 className="font-semibold text-base leading-tight line-clamp-1" title={job.nombre}>
                  {job.nombre || 'Documento sin nombre'}
                </h3>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
                  <span className="font-mono opacity-70">{job.uploadId.split('_').pop()?.slice(-8)}</span>
                  <span>•</span>
                  <span>Actualizado: {new Date(job.updatedAt).toLocaleTimeString('es-AR')}</span>
                  {duration && (
                    <>
                      <span>•</span>
                      <span className="font-medium text-foreground/80">Tomó {duration}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${getStatusBadgeClass(job.status, job.step, job.mensaje)}`}>
                <StatusIcon status={job.status} step={job.step} mensaje={job.mensaje} size="w-3 h-3" />
                {paused ? 'En pausa' : (job.status || 'Procesando')}
              </span>
              {['completado', 'completed', 'fallido', 'failed', 'error', 'permanent-fail'].includes(job.status?.toLowerCase() || '') ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground/50 hover:text-primary hover:bg-primary/10 transition-colors"
                  onClick={() => onDismiss(job.uploadId)}
                  title="Marcar como visto (ocultar de la cola)"
                >
                  <X className="h-4 w-4" />
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors"
                  onClick={() => onDelete(job.uploadId)}
                  title="Eliminar registro"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>

          {/* Barra de progreso + step */}
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className={`font-medium flex items-center gap-1.5 ${getStatusColor(job.status, job.step, job.mensaje)}`}>
                {paused && <AlertCircle className="w-3.5 h-3.5" />}
                {cleanText(job.step) || 'Iniciando'}
              </span>
              <span className="font-semibold tabular-nums">{job.progress ?? 0}%</span>
            </div>
            <Progress
              value={job.progress ?? 0}
              className={`h-2 ${getProgressColor(job.step, job.mensaje)}`}
            />
            <p className="text-xs text-muted-foreground leading-relaxed">
              {cleanText(job.mensaje) || 'En espera...'}
              {secondsLeft && (
                <span className="ml-1 text-amber-400 font-medium">({secondsLeft}s)</span>
              )}
            </p>
          </div>

          {/* Resumen de lote (si es multi-documento) */}
          {cs && cs.total > 0 && (
            <div className="mt-4 pt-4 border-t border-border/40">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Lote — {cs.total} documentos
                </span>
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {expanded ? <><ChevronUp className="w-3.5 h-3.5" /> Ocultar</> : <><ChevronDown className="w-3.5 h-3.5" /> Ver detalle</>}
                </button>
              </div>

              {/* Pills de progreso del lote */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 text-xs bg-green-500/10 text-green-400 border border-green-500/20 rounded-full px-2.5 py-1">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>{cs.completed} completados</span>
                </div>
                {cs.processing > 0 && (
                  <div className="flex items-center gap-1.5 text-xs bg-primary/10 text-primary border border-primary/20 rounded-full px-2.5 py-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>{cs.processing} procesando</span>
                  </div>
                )}
                {cs.waiting > 0 && (
                  <div className="flex items-center gap-1.5 text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-full px-2.5 py-1">
                    <Clock className="w-3 h-3" />
                    <span>{cs.waiting} en pausa (cuota)</span>
                  </div>
                )}
                {cs.failed > 0 && (
                  <div className="flex items-center gap-1.5 text-xs bg-red-500/10 text-red-400 border border-red-500/20 rounded-full px-2.5 py-1">
                    <XCircle className="w-3 h-3" />
                    <span>{cs.failed} fallidos</span>
                  </div>
                )}
              </div>

              {/* Mini-progreso global del lote */}
              <div className="mt-3">
                <Progress
                  value={cs.total > 0 ? Math.round((cs.completed / cs.total) * 100) : 0}
                  className="h-1.5 [&>*]:bg-green-400"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {cs.completed} de {cs.total} documentos guardados en DB
                </p>
              </div>

              {/* Detalle expandible de hijos activos */}
              {expanded && cs.recentActive.length > 0 && (
                <div className="mt-3 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Últimos en proceso:</p>
                  {cs.recentActive.map((child) => (
                    <div
                      key={child.uploadId}
                      className={`rounded-md border px-3 py-2 text-xs space-y-1.5 ${isRateLimitPaused(child) ? 'border-amber-500/30 bg-amber-500/5' : 'border-border/40 bg-muted/20'}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium line-clamp-1 flex-1" title={child.nombre}>
                          {child.nombre}
                        </span>
                        <div className="flex items-center gap-3 shrink-0">
                          {child.createdAt && child.updatedAt && ['completado', 'completed', 'fallido', 'failed'].includes(child.status?.toLowerCase() || '') && (
                            <span className="text-[10px] text-muted-foreground font-mono">
                              {formatDuration(child.createdAt, child.updatedAt)}
                            </span>
                          )}
                          <span className={`flex items-center gap-1 ${getStatusColor(child.status, child.step, child.mensaje)}`}>
                            <StatusIcon status={child.status} step={child.step} mensaje={child.mensaje} size="w-3 h-3" />
                            {cleanText(child.step) || child.status}
                          </span>
                        </div>
                      </div>
                      <Progress value={child.progress ?? 0} className={`h-1 ${getProgressColor(child.step, child.mensaje)}`} />
                      {child.mensaje && (
                        <p className="text-muted-foreground/80 line-clamp-1">{cleanText(child.mensaje)}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer con info de API rate limit si aplica */}
        {paused && (
          <div className="border-t border-amber-500/20 bg-amber-500/5 px-5 py-2.5 rounded-b-lg">
            <div className="flex items-center gap-2 text-xs text-amber-400">
              <Zap className="w-3.5 h-3.5 shrink-0" />
              <span>
                El procesamiento está pausado para optimizar el rendimiento del sistema.
                Retomará automáticamente cuando haya cupo disponible.
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function UploadQueuePage() {
  const [activeUploads, setActiveUploads] = useState<ActiveUpload[]>([]);
  const [etaSeconds, setEtaSeconds] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [uploadToDelete, setUploadToDelete] = useState<string | null>(null);
  const { selectedCompanyIds } = useCompanyContext();

  const fetchQueue = async () => {
    if (selectedCompanyIds.length === 0) {
      setActiveUploads([]);
      setIsLoading(false);
      return;
    }
    setIsRefreshing(true);
    try {
      const res = await fetch(`/api/activity/active-uploads?empresaId=${selectedCompanyIds.join(',')}`);
      if (res.ok) {
        const data = await res.json();
        setActiveUploads(data.activeUploads || []);
        setEtaSeconds(data.etaSeconds || 0);
      }
    } catch (error) {
      console.error('Error fetching queue:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

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

  const dismissUpload = async (uploadId: string) => {
    try {
      const res = await fetch(`/api/activity/upload/${uploadId}/dismiss`, { method: 'PATCH' });
      if (res.ok) setActiveUploads(prev => prev.filter(u => u.uploadId !== uploadId));
    } catch (error) {
      console.error('Error al descartar:', error);
    }
  };

  const dismissAll = async () => {
    if (!selectedCompanyIds.length) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/activity/upload/dismiss-all?empresaId=${selectedCompanyIds[0]}`, { method: 'PATCH' });
      if (res.ok) fetchQueue();
    } catch (error) {
      console.error('Error al descartar todos:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchQueue();
    const interval = setInterval(fetchQueue, 3000);
    return () => clearInterval(interval);
  }, [selectedCompanyIds]);

  // Contadores globales
  const pausedCount = activeUploads.filter(j => isRateLimitPaused(j)).length;
  const totalDocs = activeUploads.reduce((acc, j) => acc + (j.childrenSummary?.total || 1), 0);
  const completedDocs = activeUploads.reduce((acc, j) => acc + (j.childrenSummary?.completed || 0), 0);

  return (
    <MainLayout>
      <div className="flex-1 space-y-6 p-4 pt-6 md:p-8">
        <div className="flex items-center justify-between">
          <PageHeader
            title="Cola de Subidas"
            description="Monitorea en tiempo real los documentos procesados por la IA en background."
            icon={UploadCloud}
          />
          <div className="flex flex-col items-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchQueue}
              disabled={isRefreshing}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refrescar
            </Button>
            {etaSeconds > 0 && (
              <span className="text-[10px] text-violet-500 font-semibold bg-violet-500/10 px-2.5 py-1 rounded-full flex items-center gap-1.5">
                <Clock className="w-3 h-3" />
                ETA: ~{Math.ceil(etaSeconds / 60)} min
              </span>
            )}
            {activeUploads.some(j => ['completado', 'completed', 'fallido', 'failed', 'error', 'permanent-fail'].includes(j.status?.toLowerCase() || '')) && (
              <Button
                variant="default"
                size="sm"
                onClick={dismissAll}
                className="mt-2 bg-primary/90 hover:bg-primary transition-all shadow-sm"
              >
                <CheckCheck className="w-4 h-4 mr-2" />
                Marcar todos vistos
              </Button>
            )}
          </div>
        </div>

        {/* Barra de estadísticas globales */}
        {!isLoading && activeUploads.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-lg border border-border/50 bg-card px-4 py-3">
              <p className="text-xs text-muted-foreground">Archivos en cola</p>
              <p className="text-2xl font-bold mt-0.5">{activeUploads.length}</p>
            </div>
            <div className="rounded-lg border border-border/50 bg-card px-4 py-3">
              <p className="text-xs text-muted-foreground">Sub-documentos totales</p>
              <p className="text-2xl font-bold mt-0.5">{totalDocs > 0 ? totalDocs : '—'}</p>
            </div>
            <div className="rounded-lg border border-green-500/20 bg-green-500/5 px-4 py-3">
              <p className="text-xs text-green-400">Guardados en DB</p>
              <p className="text-2xl font-bold mt-0.5 text-green-400">{completedDocs}</p>
            </div>
            <div className={`rounded-lg border px-4 py-3 ${pausedCount > 0 ? 'border-amber-500/30 bg-amber-500/5' : 'border-border/50 bg-card'}`}>
              <p className={`text-xs ${pausedCount > 0 ? 'text-amber-400' : 'text-muted-foreground'}`}>Pausados por cuota</p>
              <p className={`text-2xl font-bold mt-0.5 ${pausedCount > 0 ? 'text-amber-400' : ''}`}>{pausedCount}</p>
            </div>
          </div>
        )}

        <div className="grid gap-4">
          {isLoading ? (
            <div className="text-center p-12 text-muted-foreground flex flex-col items-center">
              <RefreshCw className="w-8 h-8 animate-spin mb-4 text-primary" />
              <p>Cargando cola de trabajos...</p>
            </div>
          ) : activeUploads.length === 0 ? (
            <Card className="border-dashed border-2 bg-muted/10">
              <CardContent className="flex flex-col items-center justify-center p-14 text-center text-muted-foreground">
                <ServerIcon className="w-12 h-12 mb-4 opacity-30" />
                <p className="text-lg font-medium">La cola está vacía</p>
                <p className="text-sm mt-1">No hay documentos procesándose actualmente para las empresas seleccionadas.</p>
              </CardContent>
            </Card>
          ) : (
            activeUploads.map((job) => (
              <JobCard
                key={job.uploadId}
                job={job}
                onDelete={(id) => setUploadToDelete(id)}
                onDismiss={dismissUpload}
              />
            ))
          )}
        </div>
      </div>

      <AlertDialog open={!!uploadToDelete} onOpenChange={(open) => !open && setUploadToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este registro de subida?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará el registro visual de la cola de subidas, pero <strong>no borrará</strong> los documentos que ya se hayan extraído o procesado exitosamente. ¿Deseas continuar?
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
    </MainLayout>
  );
}
