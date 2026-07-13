'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, Loader2, AlertCircle, X, WifiOff, Minimize2, Maximize2, Archive, FileText, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface ChildProgress {
  id: number; // 🆕
  uploadId: string;
  fileName: string;
  status: string;
  step: string;
  progress: number;
  message: string;
  retryCount: number; // 🆕
}

interface UploadProgressData {
  id: number; // 🆕
  status: 'processing' | 'analyzing' | 'saving' | 'completed' | 'failed' | 'waiting' | 'procesando' | 'Completado' | 'Fallido' | 'Reintentando';
  step: string;
  progress: number;
  message: string;
  retryCount: number; // 🆕
  error?: string;
  isCompressed?: boolean;
  hasIncidents?: boolean;
  children?: ChildProgress[];
  data?: {
    error?: string;
    message?: string;
  };
  etaSeconds?: number; // 🆕
}

interface UploadItem {
  uploadId: string;
  fileName: string;
  progressData: UploadProgressData;
  connectionStatus: 'polling' | 'error' | 'completed';
  isMinimized: boolean;
  isExpanded: boolean;
  timestamp: number;
}

interface StorageData {
  userId: number;
  uploads: [string, UploadItem][];
}

const STORAGE_KEY = 'active_uploads';
const MAX_AGE_MS = 30 * 60 * 1000; // 30 minutos
const AUTO_CLOSE_DELAY = 5000; // 5 segundos

function saveToStorage(uploads: Map<string, UploadItem>, userId: number | null) {
  if (!userId) return;

  try {
    const serialized = Array.from(uploads.entries());
    const data: StorageData = {
      userId,
      uploads: serialized
    };
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    console.log('💾 [Storage] Guardados', serialized.length, 'uploads para userId:', userId);
  } catch (error) {
    console.error('❌ [Storage] Error guardando:', error);
  }
}

function loadFromStorage(userId: number | null): Map<string, UploadItem> {
  if (!userId) return new Map();

  try {
    if (typeof window === 'undefined') return new Map();
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return new Map();

    const data: StorageData = JSON.parse(stored);

    if (data.userId !== userId) {
      console.log('🧹 [Storage] userId diferente, limpiando storage anterior');
      localStorage.removeItem(STORAGE_KEY);
      return new Map();
    }

    const uploads = new Map(data.uploads);
    console.log('📂 [Storage] Cargados', uploads.size, 'uploads para userId:', userId);
    return uploads;
  } catch (error) {
    console.error('❌ [Storage] Error cargando:', error);
    return new Map();
  }
}

function cleanOldUploads(uploads: Map<string, UploadItem>): Map<string, UploadItem> {
  const now = Date.now();
  const cleaned = new Map<string, UploadItem>();

  for (const [uploadId, upload] of uploads.entries()) {
    const normalizedStatus = upload.progressData.status?.toLowerCase() || '';
    const isFinished =
      normalizedStatus === 'completado' ||
      upload.progressData.status === 'completed' ||
      normalizedStatus === 'fallido' ||
      upload.progressData.status === 'failed';

    const age = now - upload.timestamp;

    if (isFinished && age > MAX_AGE_MS) {
      console.log('🧹 [Storage] Limpiando upload antiguo:', uploadId, `(${Math.round(age / 60000)}min)`);
      continue;
    }

    cleaned.set(uploadId, upload);
  }

  return cleaned;
}

export function clearUploadStorage() {
  try {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(STORAGE_KEY);
    console.log('🧹 [Storage] Storage limpiado al cerrar sesión');
  } catch (error) {
    console.error('❌ [Storage] Error limpiando:', error);
  }
}

interface UploadProgressManagerProps {
  userId: number | null;
}

export function UploadProgressManager({ userId }: UploadProgressManagerProps) {
  const { toast } = useToast();
  const [uploads, setUploads] = useState<Map<string, UploadItem>>(() => {
    if (userId) {
      const stored = loadFromStorage(userId);
      const cleaned = cleanOldUploads(stored);
      console.log('🎬 [Manager] Inicialización - Cargados', cleaned.size, 'uploads');
      return cleaned;
    }
    return new Map();
  });
  const pollIntervalsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const autoCloseTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const prevUserIdRef = useRef<number | null>(userId);
  const hasLoadedRef = useRef(userId ? true : false);

  useEffect(() => {
    const prevUserId = prevUserIdRef.current;

    if (prevUserId !== null && prevUserId !== userId) {
      console.log('🧹 [Manager] Usuario cambió o cerró sesión, limpiando estado:', { prevUserId, newUserId: userId });

      pollIntervalsRef.current.forEach(interval => clearInterval(interval));
      pollIntervalsRef.current.clear();

      // 🔥 Limpiar timers de auto-close
      autoCloseTimersRef.current.forEach(timer => clearTimeout(timer));
      autoCloseTimersRef.current.clear();

      setUploads(new Map());
      hasLoadedRef.current = false;
    }

    prevUserIdRef.current = userId;
  }, [userId]);

  useEffect(() => {
    if (userId && !hasLoadedRef.current) {
      console.log('🚀 [Manager] Cargando uploads para userId:', userId);
      hasLoadedRef.current = true;

      const storedUploads = loadFromStorage(userId);
      const cleanedUploads = cleanOldUploads(storedUploads);

      if (cleanedUploads.size > 0) {
        console.log('📥 [Manager] Restaurando', cleanedUploads.size, 'uploads');
        setUploads(cleanedUploads);
      }
    }
  }, [userId]);

  useEffect(() => {
    if (uploads.size > 0 && userId) {
      saveToStorage(uploads, userId);
    } else if (uploads.size === 0 && userId && typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [uploads, userId]);

  const addUpload = useCallback((uploadId: string, fileName: string) => {
    console.log('➕ [Manager] Agregando upload:', uploadId, fileName);

    setUploads(prev => {
      const newUploads = new Map(prev);
      if (!newUploads.has(uploadId)) {
        newUploads.set(uploadId, {
          uploadId,
          fileName,
          progressData: {
            status: 'waiting',
            step: 'Iniciando...',
            progress: 0,
            message: 'Preparando archivo...',
            isCompressed: false,
            children: []
          },
          connectionStatus: 'polling',
          isMinimized: false,
          isExpanded: true,
          timestamp: Date.now()
        });
      }
      return newUploads;
    });
  }, []);

  const removeUpload = useCallback((uploadId: string) => {
    console.log('➖ [Manager] Eliminando upload:', uploadId);

    const interval = pollIntervalsRef.current.get(uploadId);
    if (interval) {
      clearInterval(interval);
      pollIntervalsRef.current.delete(uploadId);
    }

    // 🔥 Limpiar timer de auto-close si existe
    const autoCloseTimer = autoCloseTimersRef.current.get(uploadId);
    if (autoCloseTimer) {
      clearTimeout(autoCloseTimer);
      autoCloseTimersRef.current.delete(uploadId);
    }

    setUploads(prev => {
      const newUploads = new Map(prev);
      newUploads.delete(uploadId);
      return newUploads;
    });
  }, []);

  const toggleMinimize = useCallback((uploadId: string) => {
    setUploads(prev => {
      const newUploads = new Map(prev);
      const upload = newUploads.get(uploadId);
      if (upload) {
        upload.isMinimized = !upload.isMinimized;
        newUploads.set(uploadId, upload);
      }
      return newUploads;
    });
  }, []);

  const toggleExpand = useCallback((uploadId: string) => {
    setUploads(prev => {
      const newUploads = new Map(prev);
      const upload = newUploads.get(uploadId);
      if (upload) {
        upload.isExpanded = !upload.isExpanded;
        newUploads.set(uploadId, upload);
      }
      return newUploads;
    });
  }, []);

  useEffect(() => {
    (window as any).__uploadProgressManager = {
      addUpload,
      removeUpload
    };

    return () => {
      delete (window as any).__uploadProgressManager;
      pollIntervalsRef.current.forEach(interval => clearInterval(interval));
      pollIntervalsRef.current.clear();
      autoCloseTimersRef.current.forEach(timer => clearTimeout(timer));
      autoCloseTimersRef.current.clear();
    };
  }, [addUpload, removeUpload]);

  // 🆕 Los reintentos automáticos ahora se gestionan en <RetryMonitor />,
  // un componente totalmente independiente. Ver: src/components/upload/retry-monitor.tsx

  useEffect(() => {
    uploads.forEach((upload) => {
      if (upload.connectionStatus === 'polling' && !pollIntervalsRef.current.has(upload.uploadId)) {
        console.log('🔄 [Manager] Iniciando polling para:', upload.uploadId);

        let consecutiveErrors = 0;
        const maxErrors = 5;

        const poll = async () => {
          try {
            const response = await fetch(
              `/api/upload-progress?uploadId=${encodeURIComponent(upload.uploadId)}`,
              {
                method: 'GET',
                headers: { 'Cache-Control': 'no-cache' }
              }
            );

            if (response.ok) {
              const data: UploadProgressData = await response.json();
              consecutiveErrors = 0;

              console.log('📦 [Manager] Datos recibidos:', {
                uploadId: upload.uploadId,
                status: data.status,
                hasIncidents: data.hasIncidents,
                progress: data.progress
              });

              setUploads(prev => {
                const newUploads = new Map(prev);
                const current = newUploads.get(upload.uploadId);

                if (current) {
                  current.progressData = data;

                  const normalizedStatus = data.status.toLowerCase();
                  const isFinished = normalizedStatus === 'completado' ||
                    normalizedStatus === 'completed' ||
                    normalizedStatus === 'fallido' ||
                    normalizedStatus === 'failed' ||
                    normalizedStatus === 'permanent-fail' ||
                    normalizedStatus === 'error';

                  const isLastFailure = (normalizedStatus === 'fallido' || normalizedStatus === 'failed' || normalizedStatus === 'error') && (data.retryCount ?? 0) >= 3;
                  const isPermanentFail = normalizedStatus === 'permanent-fail';
                  
                  // 🔥 SMART TIMEOUT: Si lleva más de 5 minutos (300s) procesando, delegar al Sidebar
                  const elapsed = Date.now() - upload.timestamp;
                  const DELEGATE_MS = 300000; // 5 minutos
                  const WARN_MS = 270000; // 4m 30s

                  const isLongRunning = elapsed > DELEGATE_MS;
                  const isAboutToDelegate = !isLongRunning && elapsed > WARN_MS;
                  const shouldDelegateToSidebar = isLongRunning && !isFinished;

                  // ⚠️ PRE-AVISO: 30s antes del timeout, cambiar el mensaje
                  if (isAboutToDelegate && !isFinished && current.connectionStatus === 'polling') {
                    const prevMsg = current.progressData?.message || '';
                    const warnMsg = '⏳ Este lote tomará un tiempo. Podrás seguir su progreso en "Subidas en proceso" (menú lateral).';
                    if (prevMsg !== warnMsg) {
                      current.progressData = {
                        ...current.progressData,
                        message: warnMsg
                      };
                    }
                  }

                  if (shouldDelegateToSidebar && current.connectionStatus === 'polling') {
                    console.log('⏳ [Manager] Upload tardando mucho, delegando a Sidebar:', upload.uploadId);
                    
                    // Actualizar mensaje para avisar al usuario
                    current.progressData = {
                      ...current.progressData,
                      message: '✅ Procesando en segundo plano. Seguí el progreso en "Subidas en proceso" del menú lateral.'
                    };
                    current.connectionStatus = 'completed'; // Detener polling en este card

                    const interval = pollIntervalsRef.current.get(upload.uploadId);
                    if (interval) {
                      clearInterval(interval);
                      pollIntervalsRef.current.delete(upload.uploadId);
                    }

                    // Auto-cerrar en 8s para que el usuario alcance a leer
                    if (!autoCloseTimersRef.current.has(upload.uploadId)) {
                      const timer = setTimeout(() => {
                        removeUpload(upload.uploadId);
                      }, 8000);
                      autoCloseTimersRef.current.set(upload.uploadId, timer);
                    }
                  }
                  
                  // Auto-cerrar si: completado, es el último fallo de los 3 reintentos, o es un fallo permanente.
                  const shouldAutoClose = normalizedStatus === 'completado' || 
                                       normalizedStatus === 'completed' || 
                                       normalizedStatus === 'fallido' || 
                                       normalizedStatus === 'failed' || 
                                       normalizedStatus === 'error' ||
                                       isPermanentFail;

                  if (isFinished) {
                    console.log('🛑 [Manager] Deteniendo polling por estado final:', upload.uploadId);
                    current.connectionStatus = 'completed';

                    const interval = pollIntervalsRef.current.get(upload.uploadId);
                    if (interval) {
                      clearInterval(interval);
                      pollIntervalsRef.current.delete(upload.uploadId);
                    }

                    // 🔥 INICIAR TIMER DE AUTO-CLOSE
                    if (shouldAutoClose && !autoCloseTimersRef.current.has(upload.uploadId)) {
                      // Si tiene incidencias, dar más tiempo (15s). 
                      // Si es un fallo, cerrar rápido (3s) para no estorbar.
                      // Si es éxito limpio, usar delay normal (5s).
                      const isError = normalizedStatus === 'fallido' || normalizedStatus === 'failed' || normalizedStatus === 'error' || normalizedStatus === 'permanent-fail';
                      const closeDelay = data.hasIncidents ? 15000 : (isError ? 3000 : AUTO_CLOSE_DELAY);

                      console.log(`⏲️ [Manager] Auto-close programado en ${closeDelay / 1000}s para:`, upload.uploadId, data.hasIncidents ? '(CON INCIDENCIAS)' : (isError ? '(ERROR)' : ''));
                      const timer = setTimeout(() => {
                        console.log('🔄 [Manager] Auto-close ejecutado para:', upload.uploadId);
                        removeUpload(upload.uploadId);
                      }, closeDelay);
                      autoCloseTimersRef.current.set(upload.uploadId, timer);
                    }
                  }

                  newUploads.set(upload.uploadId, current);
                }
                return newUploads;
              });
            } else {
              throw new Error(`HTTP ${response.status}`);
            }
          } catch (error) {
            consecutiveErrors++;
            console.warn('⚠️ [Manager] Error en polling:', error);

            if (consecutiveErrors >= maxErrors) {
              console.error('❌ [Manager] Demasiados errores consecutivos, deteniendo polling');

              setUploads(prev => {
                const newUploads = new Map(prev);
                const current = newUploads.get(upload.uploadId);

                if (current) {
                  current.connectionStatus = 'error';
                  current.progressData = {
                    status: 'failed',
                    step: 'Error',
                    progress: 0,
                    message: 'Error de conexión con el servidor',
                    error: 'No se pudo obtener el estado del procesamiento'
                  };
                  newUploads.set(upload.uploadId, current);
                }
                return newUploads;
              });

              const interval = pollIntervalsRef.current.get(upload.uploadId);
              if (interval) {
                clearInterval(interval);
                pollIntervalsRef.current.delete(upload.uploadId);
              }

              // 🔥 AUTO-CLOSE también para errores de conexión
              if (!autoCloseTimersRef.current.has(upload.uploadId)) {
                console.log(`⏲️ [Manager] Auto-close programado (error) en ${AUTO_CLOSE_DELAY / 1000}s para:`, upload.uploadId);
                const timer = setTimeout(() => {
                  console.log('🔄 [Manager] Auto-close ejecutado (error) para:', upload.uploadId);
                  removeUpload(upload.uploadId);
                }, AUTO_CLOSE_DELAY);
                autoCloseTimersRef.current.set(upload.uploadId, timer);
              }
            }
          }
        };

        poll();
        const intervalId = setInterval(poll, 1000);
        pollIntervalsRef.current.set(upload.uploadId, intervalId);
      }
    });
  }, [uploads, removeUpload]);

  if (uploads.size === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2 max-w-md w-full">
      {Array.from(uploads.values()).map((upload) => (
        <UploadCard
          key={upload.uploadId}
          upload={upload}
          onClose={() => removeUpload(upload.uploadId)}
          onToggleMinimize={() => toggleMinimize(upload.uploadId)}
          onToggleExpand={() => toggleExpand(upload.uploadId)}
        />
      ))}
    </div>
  );
}

function UploadCard({
  upload,
  onClose,
  onToggleMinimize,
  onToggleExpand
}: {
  upload: UploadItem;
  onClose: () => void;
  onToggleMinimize: () => void;
  onToggleExpand: () => void;
}) {
  const getStatusIcon = (status: string) => {
    const normalizedStatus = status?.toLowerCase() || '';

    if (normalizedStatus === 'completado' || status === 'completed') {
      return <CheckCircle2 className="h-5 w-5 text-green-500" />;
    }
    if (normalizedStatus === 'fallido' || status === 'failed' || normalizedStatus === 'interrumpido') {
      return <AlertCircle className="h-5 w-5 text-red-500" />;
    }
    if (normalizedStatus === 'reintentando') {
      return <RefreshCw className="h-5 w-5 animate-spin text-indigo-600" />;
    }
    return <Loader2 className="h-5 w-5 animate-spin text-violet-600" />;
  };

  const getStatusColor = (status: string) => {
    const normalizedStatus = status?.toLowerCase() || '';

    if (normalizedStatus === 'completado' || status === 'completed') {
      return 'bg-green-500';
    }
    if (normalizedStatus === 'fallido' || status === 'failed' || normalizedStatus === 'interrumpido') {
      return 'bg-red-500';
    }
    if (normalizedStatus === 'reintentando') {
      return 'bg-indigo-500';
    }
    return 'bg-violet-600';
  };

  const isCompressed = upload.progressData.isCompressed && upload.progressData.children && upload.progressData.children.length > 0;

  return (
    <Card className={cn(
      "w-full shadow-lg border-2 border-violet-200 dark:border-violet-700 transition-all duration-200",
      upload.isMinimized && "max-h-16"
    )}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {isCompressed ? (
              <Archive className="h-5 w-5 text-violet-600" />
            ) : (
              getStatusIcon(upload.progressData.status)
            )}
            <div className="flex-1 min-w-0">
              <CardTitle className="text-base font-medium truncate">
                {upload.fileName}
              </CardTitle>
              {isCompressed && (
                <p className="text-xs text-muted-foreground">
                  {upload.progressData.children!.length} archivos
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={onToggleMinimize}
              title={upload.isMinimized ? "Maximizar" : "Minimizar"}
            >
              {upload.isMinimized ? (
                <Maximize2 className="h-4 w-4" />
              ) : (
                <Minimize2 className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={onClose}
              title="Cerrar"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>

      {!upload.isMinimized && (
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Progress
              value={upload.progressData.progress}
              className="h-2"
              indicatorClassName={getStatusColor(upload.progressData.status)}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span className="truncate max-w-[70%]">{upload.progressData.step}</span>
              <span className="font-medium">{upload.progressData.progress}%</span>
            </div>
            {upload.progressData.etaSeconds !== undefined && upload.progressData.etaSeconds > 0 && upload.progressData.status !== 'Completado' && upload.progressData.status !== 'completed' && (
              <div className="text-xs text-violet-600 dark:text-violet-400 mt-1">
                Tiempo estimado: ~{Math.ceil(upload.progressData.etaSeconds / 60)} min
              </div>
            )}
          </div>

          {/* 🆕 INDICADOR DE REINTENTOS */}
          {(upload.progressData.retryCount || 0) > 0 && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 w-fit">
              <RefreshCw className="h-3 w-3 text-indigo-600 dark:text-indigo-400" />
              <span className="text-[10px] font-medium text-indigo-600 dark:text-indigo-400">
                Reintento {upload.progressData.retryCount}/3
              </span>
            </div>
          )}

          <p className="text-sm text-muted-foreground">
            {upload.progressData.message}
          </p>

          {isCompressed && (
            <div className="border border-violet-200 dark:border-violet-700 rounded-md overflow-hidden">
              <button
                onClick={onToggleExpand}
                className="w-full flex items-center justify-between p-2 bg-violet-50 dark:bg-violet-950/30 hover:bg-violet-100 dark:hover:bg-violet-900/40 transition-colors"
              >
                <span className="text-xs font-medium text-violet-700 dark:text-violet-300">
                  Archivos individuales ({upload.progressData.children!.length})
                </span>
                {upload.isExpanded ? (
                  <ChevronUp className="h-4 w-4 text-violet-600" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-violet-600" />
                )}
              </button>

              {upload.isExpanded && (
                <div className="max-h-48 overflow-y-auto divide-y divide-violet-100 dark:divide-violet-800">
                  {upload.progressData.children!.map((child) => {
                    const childNormalizedStatus = child.status?.toLowerCase() || '';
                    const isChildCompleted = childNormalizedStatus === 'completado' || child.status === 'completed';
                    const isChildFailed = childNormalizedStatus === 'fallido' || child.status === 'failed' || childNormalizedStatus === 'interrumpido';

                    return (
                      <div key={child.uploadId} className="p-2 hover:bg-violet-50/50 dark:hover:bg-violet-950/20 transition-colors">
                        <div className="flex items-start gap-2">
                          <FileText className="h-4 w-4 text-violet-400 mt-0.5 shrink-0" />
                          <div className="flex-1 min-w-0 space-y-1">
                            <p className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">
                              {child.fileName}
                            </p>
                            <div className="flex items-center gap-2">
                              <Progress
                                value={child.progress}
                                className="h-1 flex-1"
                                indicatorClassName={getStatusColor(child.status)}
                              />
                              <span className="text-[10px] font-medium text-muted-foreground shrink-0">
                                {child.progress}%
                              </span>
                            </div>
                            <p className="text-[10px] text-muted-foreground truncate">
                              {child.step}
                            </p>
                          </div>
                          <div className="shrink-0">
                            {isChildCompleted ? (
                              <CheckCircle2 className="h-4 w-4 text-green-500" />
                            ) : isChildFailed ? (
                              <X className="h-4 w-4 text-red-500" />
                            ) : (
                              <Loader2 className="h-4 w-4 animate-spin text-violet-600" />
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {upload.connectionStatus === 'error' && upload.progressData.status !== 'failed' && upload.progressData.status !== 'completed' && (
            <div className="bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 rounded-md p-3">
              <div className="flex items-start gap-2">
                <WifiOff className="h-4 w-4 text-orange-600 dark:text-orange-400 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-orange-600 dark:text-orange-400 font-medium">
                    Error de conexión
                  </p>
                  <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                    No se pudo conectar al servidor
                  </p>
                </div>
              </div>
            </div>
          )}

          {upload.progressData.status === 'failed' && (
            <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-md p-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-red-600 dark:text-red-400 font-medium">
                    Error en el procesamiento
                  </p>
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1 break-words">
                    {upload.progressData.error || upload.progressData.data?.error || upload.progressData.data?.message || 'Ocurrió un error desconocido'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {(upload.progressData.status === 'completed' || upload.progressData.status === 'Completado') && (
            <div className={cn(
              "border rounded-md p-3",
              upload.progressData.hasIncidents
                ? "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800"
                : "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800"
            )}>
              <div className="flex items-start gap-2">
                {upload.progressData.hasIncidents ? (
                  <>
                    <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-xs text-red-600 dark:text-red-400 font-medium">
                        ⚠️ Documento procesado con incidencias
                      </p>
                      <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                        Visita la sección de <span className="font-semibold">Incidencias</span> para revisarlas
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
                    <p className="text-xs text-green-600 dark:text-green-400 font-medium">
                      ✅ Documento procesado exitosamente
                    </p>
                  </>
                )}
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}