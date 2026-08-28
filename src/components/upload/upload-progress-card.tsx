'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, Loader2, AlertCircle, X, Minimize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useDataRefresh } from '@/context/DataRefreshProvider';

/**
 * Progreso simple: 1 barra por lote, 1 request cada BATCH_POLL_MS.
 * Sin poll por archivo. El % viene de AVG(progress) / listos÷total en actividad.
 */

interface BatchState {
  batchId: string;
  /** Nombres conocidos en cliente (mientras van llegando uploads). */
  fileNames: string[];
  totalHint: number;
  percent: number;
  completed: number;
  failed: number;
  active: number;
  total: number;
  done: boolean;
  softWarn: boolean;
  createdAt: number;
}

interface StorageData {
  userId: number;
  batches: BatchState[];
}

const STORAGE_KEY = 'active_upload_batches';
const BATCH_POLL_MS = 5000;
/** La barra no se auto-cierra: solo con la X del usuario. */

function loadBatches(userId: number | null): BatchState[] {
  if (!userId || typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const data: StorageData = JSON.parse(raw);
    if (data.userId !== userId) {
      localStorage.removeItem(STORAGE_KEY);
      return [];
    }
    return (data.batches || []).filter((b) => Date.now() - b.createdAt < 45 * 60 * 1000);
  } catch {
    return [];
  }
}

function saveBatches(userId: number | null, batches: BatchState[]) {
  if (!userId || typeof window === 'undefined') return;
  try {
    if (batches.length === 0) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ userId, batches } satisfies StorageData));
  } catch {
    /* ignore */
  }
}

export function clearUploadStorage() {
  try {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('active_uploads');
  } catch {
    /* ignore */
  }
}

interface UploadProgressManagerProps {
  userId: number | null;
}

export function UploadProgressManager({ userId }: UploadProgressManagerProps) {
  const { toast } = useToast();
  const { refresh } = useDataRefresh();
  const [batches, setBatches] = useState<BatchState[]>(() => loadBatches(userId));
  const [panelOpen, setPanelOpen] = useState(true);
  const batchesRef = useRef(batches);
  const pollInFlight = useRef(false);
  // Track previous allDone to only fire refresh on the false→true transition
  const prevAllDoneRef = useRef<boolean>(loadBatches(userId).every((b) => b.done));

  batchesRef.current = batches;

  useEffect(() => {
    setBatches(loadBatches(userId));
  }, [userId]);

  useEffect(() => {
    saveBatches(userId, batches);
  }, [batches, userId]);

  // Auto-refresh de datos cuando el lote termina (transicion false→true solamente)
  const allDoneForEffect = batches.length > 0 && batches.every((b) => b.done);
  useEffect(() => {
    if (allDoneForEffect && !prevAllDoneRef.current) {
      refresh('cola-terminada');
    }
    prevAllDoneRef.current = allDoneForEffect;
  }, [allDoneForEffect, refresh]);

  const dismissBatch = useCallback((batchId: string) => {
    setBatches((prev) => prev.filter((b) => b.batchId !== batchId));
  }, []);

  const addUpload = useCallback((uploadId: string, fileName: string, batchId?: string | null) => {
    const id = (batchId && String(batchId).trim()) || `solo_${uploadId}`;
    setBatches((prev) => {
      const next = [...prev];
      const idx = next.findIndex((b) => b.batchId === id);
      if (idx >= 0) {
        const b = { ...next[idx] };
        if (!b.fileNames.includes(fileName)) b.fileNames = [...b.fileNames, fileName];
        b.totalHint = Math.max(b.totalHint, b.fileNames.length);
        b.done = false;
        next[idx] = b;
      } else {
        next.push({
          batchId: id,
          fileNames: [fileName],
          totalHint: 1,
          percent: 5,
          completed: 0,
          failed: 0,
          active: 1,
          total: 1,
          done: false,
          softWarn: false,
          createdAt: Date.now(),
        });
      }
      return next;
    });
    setPanelOpen(true);
  }, []);

  const removeUpload = useCallback((_uploadId: string) => {
    /* API legacy: el lote se limpia con dismissBatch (X) */
  }, []);

  useEffect(() => {
    (window as any).__uploadProgressManager = { addUpload, removeUpload, dismissBatch };
    return () => {
      delete (window as any).__uploadProgressManager;
    };
  }, [addUpload, removeUpload, dismissBatch]);

  // Reanudar cola IndexedDB tras refresh
  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const syncGuard = (e: BeforeUnloadEvent) => {
      const pending = (window as any).__gestorUploadPendingCount;
      if (typeof pending === 'number' && pending > 0) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    (async () => {
      try {
        const { resumeClientUploadQueue, getPendingUploadCount } = await import(
          '@/lib/client-upload-queue'
        );
        const n = await resumeClientUploadQueue();
        if (!cancelled && n > 0) {
          toast({
            title: 'Reanudando subidas',
            description: `${n} archivo(s) pendientes se están subiendo de nuevo.`,
          });
        }
        const refreshPendingFlag = async () => {
          try {
            (window as any).__gestorUploadPendingCount = await getPendingUploadCount();
          } catch {
            (window as any).__gestorUploadPendingCount = 0;
          }
        };
        await refreshPendingFlag();
        intervalId = setInterval(refreshPendingFlag, 2000);
        window.addEventListener('beforeunload', syncGuard);
      } catch (e) {
        console.warn('[Manager] No se pudo init cola cliente:', e);
      }
    })();

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
      window.removeEventListener('beforeunload', syncGuard);
    };
  }, [toast]);

  // Un poll por lote activo (no por archivo)
  useEffect(() => {
    const tick = async () => {
      if (pollInFlight.current) return;
      const toPoll = batchesRef.current.filter((b) => !b.done && !b.batchId.startsWith('solo_'));
      if (toPoll.length === 0) return;

      pollInFlight.current = true;
      try {
        await Promise.all(
          toPoll.map(async (batch) => {
            try {
              const res = await fetch(
                `/api/upload-progress/batch?batchId=${encodeURIComponent(batch.batchId)}`,
                { headers: { 'Cache-Control': 'no-cache' } }
              );
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              const data = await res.json();

              setBatches((prev) =>
                prev.map((b) => {
                  if (b.batchId !== batch.batchId) return b;
                  const serverTotal = Number(data.total) || 0;
                  const total = Math.max(serverTotal, b.totalHint, b.fileNames.length);
                  const incoming =
                    serverTotal === 0
                      ? Math.min(15, Math.max(b.percent, 5))
                      : typeof data.percent === 'number'
                        ? data.percent
                        : b.percent;
                  // Nunca bajar el % (paginate/reintentos no deben “rebobinar” la barra)
                  const percent = Math.max(b.percent, incoming);
                  const done = serverTotal > 0 && Boolean(data.done);
                  return {
                    ...b,
                    total,
                    completed: data.completed || 0,
                    failed: data.failed || 0,
                    active: data.active ?? Math.max(0, total - (data.finished || 0)),
                    percent: done ? 100 : percent,
                    done,
                    softWarn: false,
                  };
                })
              );
            } catch (err) {
              console.warn('⚠️ [batch-progress]', batch.batchId, err);
              setBatches((prev) =>
                prev.map((b) => (b.batchId === batch.batchId ? { ...b, softWarn: true } : b))
              );
            }
          })
        );
      } finally {
        pollInFlight.current = false;
      }
    };

    const id = setInterval(tick, BATCH_POLL_MS);
    tick();
    return () => clearInterval(id);
  }, []);

  if (batches.length === 0) return null;

  // Unificar en una sola barra si hay varios lotes concurrentes
  const total = batches.reduce((a, b) => a + (b.total || b.totalHint || 0), 0);
  const completed = batches.reduce((a, b) => a + b.completed, 0);
  const failed = batches.reduce((a, b) => a + b.failed, 0);
  const active = batches.reduce((a, b) => a + (b.done ? 0 : b.active || Math.max(0, (b.total || b.totalHint) - b.completed - b.failed)), 0);
  const percent =
    batches.length === 1
      ? batches[0].percent
      : total > 0
        ? Math.round(batches.reduce((a, b) => a + b.percent * (b.total || b.totalHint || 1), 0) / total)
        : 0;
  const allDone = batches.every((b) => b.done);
  const softWarn = batches.some((b) => b.softWarn);
  const names = batches.flatMap((b) => b.fileNames).slice(0, 40);

  const chipLabel = allDone
    ? failed > 0
      ? `${completed} listos · ${failed} con error`
      : `${completed} listos`
    : `${completed}/${total || names.length} listos · ${percent}%`;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[min(100vw-2rem,22rem)]">
      {!panelOpen ? (
        <button
          type="button"
          onClick={() => setPanelOpen(true)}
          className={cn(
            'w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 shadow-lg',
            'border-primary/60 bg-card text-left hover:ring-1 hover:ring-primary/40'
          )}
        >
          {allDone && failed === 0 ? (
            <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
          ) : failed > 0 && allDone ? (
            <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
          ) : (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
          )}
          <div className="flex-1 min-w-0 space-y-1">
            <span className="text-sm font-medium block truncate">{chipLabel}</span>
            <Progress
              value={percent}
              className="h-1.5"
              indicatorClassName={failed > 0 && allDone ? 'bg-red-500' : allDone ? 'bg-green-500' : 'bg-primary'}
            />
          </div>
        </button>
      ) : (
        <Card className="border-2 border-primary/20 bg-card shadow-lg dark:border-primary/50">
          <CardHeader className="pb-2 pt-3 px-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <CardTitle className="text-base font-medium">Progreso del lote</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {completed} listos
                  {active > 0 ? ` · ${active} en curso` : ''}
                  {failed > 0 ? ` · ${failed} error${failed === 1 ? '' : 'es'}` : ''}
                  {` · ${total || names.length} en total`}
                </p>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPanelOpen(false)} title="Minimizar">
                  <Minimize2 className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => batches.forEach((b) => dismissBatch(b.batchId))}
                  title="Cerrar"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-3 pb-3 space-y-3 bg-card">
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{allDone ? 'Terminado — cerrá con la X cuando quieras' : 'Procesando documentos…'}</span>
                <span className="font-medium tabular-nums">{percent}%</span>
              </div>
              <Progress
                value={percent}
                className="h-2.5"
                indicatorClassName={failed > 0 && allDone ? 'bg-red-500' : allDone ? 'bg-green-500' : 'bg-primary'}
              />
              <p className="text-xs text-muted-foreground">
                {softWarn
                  ? 'Estado lento (DB remota); el procesamiento sigue.'
                  : 'Una barra para todo el lote. El detalle está en la cola de subidas.'}
              </p>
            </div>

            {names.length > 0 && (
              <div className="max-h-36 space-y-0.5 overflow-y-auto rounded-md border border-primary/15 bg-background p-2 text-[11px] text-muted-foreground dark:border-primary/40">
                {names.map((n) => (
                  <div key={n} className="truncate">
                    {n}
                  </div>
                ))}
                {batches.some((b) => b.fileNames.length > 40) && (
                  <div className="italic">…y más</div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
