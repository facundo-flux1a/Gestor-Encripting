'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, Loader2, AlertCircle, X, WifiOff, Minimize2, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface UploadProgressData {
  status: 'processing' | 'analyzing' | 'saving' | 'completed' | 'failed';
  step: string;
  progress: number;
  message: string;
  error?: string;
  data?: {
    error?: string;
    message?: string;
  };
}

interface UploadItem {
  uploadId: string;
  fileName: string;
  progressData: UploadProgressData;
  connectionStatus: 'connecting' | 'connected' | 'error';
  isMinimized: boolean;
  eventSource: EventSource | null;
}

// ============================================
// UPLOAD PROGRESS MANAGER
// Sistema de gestión de múltiples uploads
// con tarjetas minimizables
// ============================================

export function UploadProgressManager() {
  const [uploads, setUploads] = useState<Map<string, UploadItem>>(new Map());

  // Función para agregar un nuevo upload
  const addUpload = useCallback((uploadId: string, fileName: string) => {
    setUploads(prev => {
      const newUploads = new Map(prev);
      if (!newUploads.has(uploadId)) {
        newUploads.set(uploadId, {
          uploadId,
          fileName,
          progressData: {
            status: 'processing',
            step: 'Iniciando...',
            progress: 0,
            message: 'Preparando archivo para subir'
          },
          connectionStatus: 'connecting',
          isMinimized: false,
          eventSource: null
        });
      }
      return newUploads;
    });
  }, []);

  // Función para eliminar un upload
  const removeUpload = useCallback((uploadId: string) => {
    setUploads(prev => {
      const newUploads = new Map(prev);
      const upload = newUploads.get(uploadId);
      if (upload?.eventSource) {
        upload.eventSource.close();
      }
      newUploads.delete(uploadId);
      return newUploads;
    });
  }, []);

  // Función para minimizar/maximizar
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

  // Exponer funciones globalmente para que otros componentes puedan usarlas
  useEffect(() => {
    (window as any).__uploadProgressManager = {
      addUpload,
      removeUpload
    };

    return () => {
      delete (window as any).__uploadProgressManager;
    };
  }, [addUpload, removeUpload]);

  // Conectar SSE para cada upload
  useEffect(() => {
    uploads.forEach((upload) => {
      if (!upload.eventSource && upload.connectionStatus !== 'error') {
        const eventSource = new EventSource(`/api/upload-progress?uploadId=${encodeURIComponent(upload.uploadId)}`);

        eventSource.onopen = () => {
          setUploads(prev => {
            const newUploads = new Map(prev);
            const current = newUploads.get(upload.uploadId);
            if (current) {
              current.connectionStatus = 'connected';
              newUploads.set(upload.uploadId, current);
            }
            return newUploads;
          });
        };

        eventSource.onmessage = (event) => {
          try {
            if (event.data === 'heartbeat' || event.data === '{}' || event.data === '') {
              return;
            }

            const data: UploadProgressData = JSON.parse(event.data);
            
            setUploads(prev => {
              const newUploads = new Map(prev);
              const current = newUploads.get(upload.uploadId);
              if (current) {
                current.progressData = data;
                
                // Cerrar conexión si completó o falló
                if (data.status === 'completed' || data.status === 'failed') {
                  current.eventSource?.close();
                  current.eventSource = null;
                }
                
                newUploads.set(upload.uploadId, current);
              }
              return newUploads;
            });
          } catch (err) {
            console.error('❌ Error parseando datos:', err);
          }
        };

        eventSource.onerror = () => {
          setUploads(prev => {
            const newUploads = new Map(prev);
            const current = newUploads.get(upload.uploadId);
            if (current) {
              current.connectionStatus = 'error';
              current.eventSource?.close();
              current.eventSource = null;
              newUploads.set(upload.uploadId, current);
            }
            return newUploads;
          });
        };

        setUploads(prev => {
          const newUploads = new Map(prev);
          const current = newUploads.get(upload.uploadId);
          if (current) {
            current.eventSource = eventSource;
            newUploads.set(upload.uploadId, current);
          }
          return newUploads;
        });
      }
    });
  }, [uploads.size]);

  if (uploads.size === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2 max-w-md w-full">
      {Array.from(uploads.values()).map((upload) => (
        <UploadCard
          key={upload.uploadId}
          upload={upload}
          onClose={() => removeUpload(upload.uploadId)}
          onToggleMinimize={() => toggleMinimize(upload.uploadId)}
        />
      ))}
    </div>
  );
}

function UploadCard({ 
  upload, 
  onClose, 
  onToggleMinimize 
}: { 
  upload: UploadItem; 
  onClose: () => void;
  onToggleMinimize: () => void;
}) {
  const getStatusIcon = () => {
    if (upload.connectionStatus === 'error' && upload.progressData.status !== 'failed') {
      return <WifiOff className="h-5 w-5 text-orange-500" />;
    }
    
    switch (upload.progressData.status) {
      case 'completed':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'failed':
        return <AlertCircle className="h-5 w-5 text-red-500" />;
      default:
        return <Loader2 className="h-5 w-5 animate-spin text-purple-600" />;
    }
  };

  const getStatusColor = () => {
    switch (upload.progressData.status) {
      case 'completed':
        return 'bg-green-500';
      case 'failed':
        return 'bg-red-500';
      default:
        return 'bg-purple-600';
    }
  };

  return (
    <Card className={cn(
      "w-full shadow-lg border-2 dark:border-gray-700 transition-all duration-200",
      upload.isMinimized && "max-h-16"
    )}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {getStatusIcon()}
            <CardTitle className="text-base font-medium truncate">
              {upload.fileName}
            </CardTitle>
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
        
        {/* Indicador de conexión */}
        {upload.connectionStatus === 'connecting' && upload.progressData.status !== 'completed' && (
          <div className="flex items-center gap-1 text-xs text-orange-500 mt-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>Conectando...</span>
          </div>
        )}
      </CardHeader>
      
      {!upload.isMinimized && (
        <CardContent className="space-y-3">
          {/* Barra de progreso */}
          <div className="space-y-1">
            <Progress 
              value={upload.progressData.progress} 
              className="h-2"
              indicatorClassName={getStatusColor()}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span className="truncate max-w-[70%]">{upload.progressData.step}</span>
              <span className="font-medium">{upload.progressData.progress}%</span>
            </div>
          </div>

          {/* Mensaje descriptivo */}
          <p className="text-sm text-muted-foreground">
            {upload.progressData.message}
          </p>

          {/* Error de conexión */}
          {upload.connectionStatus === 'error' && upload.progressData.status !== 'failed' && upload.progressData.status !== 'completed' && (
            <div className="bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 rounded-md p-3">
              <div className="flex items-start gap-2">
                <WifiOff className="h-4 w-4 text-orange-600 dark:text-orange-400 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-orange-600 dark:text-orange-400 font-medium">
                    Error de conexión
                  </p>
                  <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                    No se pudo conectar al servidor.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Error de procesamiento */}
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

          {/* Mensaje de éxito */}
          {upload.progressData.status === 'completed' && (
            <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-md p-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
                <p className="text-xs text-green-600 dark:text-green-400 font-medium">
                  ✅ Documento procesado exitosamente
                </p>
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}