'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, Loader2, AlertCircle, X, WifiOff, Minimize2, Maximize2, Archive, FileText, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ChildProgress {
  uploadId: string;
  fileName: string;
  status: string;
  step: string;
  progress: number;
  message: string;
}

interface UploadProgressData {
  status: 'processing' | 'analyzing' | 'saving' | 'completed' | 'failed' | 'waiting' | 'procesando' | 'Completado' | 'Fallido';
  step: string;
  progress: number;
  message: string;
  error?: string;
  isCompressed?: boolean;  // 🆕 Indica si es ZIP
  children?: ChildProgress[];  // 🆕 Archivos hijos
  data?: {
    error?: string;
    message?: string;
  };
}

interface UploadItem {
  uploadId: string;
  fileName: string;
  progressData: UploadProgressData;
  connectionStatus: 'polling' | 'error' | 'completed';
  isMinimized: boolean;
  isExpanded: boolean;  // 🆕 Para expandir/colapsar lista de archivos
}

export function UploadProgressManager() {
  const [uploads, setUploads] = useState<Map<string, UploadItem>>(new Map());
  const pollIntervalsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

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
          isExpanded: true  // 🆕 Expandido por defecto
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

  // 🆕 Toggle para expandir/colapsar lista de archivos
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
    };
  }, [addUpload, removeUpload]);

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
              
              console.log('📊 [Manager] Estado:', upload.uploadId, data.step, data.progress, data.children?.length || 0, 'hijos');
              
              consecutiveErrors = 0;
              
              setUploads(prev => {
                const newUploads = new Map(prev);
                const current = newUploads.get(upload.uploadId);
                
                if (current) {
                  current.progressData = data;
                  
                  // Normalizar estados
                  const normalizedStatus = data.status.toLowerCase();
                  if (normalizedStatus === 'completado' || data.status === 'completed' || 
                      normalizedStatus === 'fallido' || data.status === 'failed') {
                    console.log('🛑 [Manager] Deteniendo polling por estado final:', upload.uploadId);
                    current.connectionStatus = 'completed';
                    
                    const interval = pollIntervalsRef.current.get(upload.uploadId);
                    if (interval) {
                      clearInterval(interval);
                      pollIntervalsRef.current.delete(upload.uploadId);
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
            console.error('❌ [Manager] Error en polling:', upload.uploadId, error);
            consecutiveErrors++;
            
            if (consecutiveErrors >= maxErrors) {
              console.error('💥 [Manager] Demasiados errores, deteniendo:', upload.uploadId);
              
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
            }
          }
        };
        
        poll();
        const intervalId = setInterval(poll, 1000);
        pollIntervalsRef.current.set(upload.uploadId, intervalId);
      }
    });
  }, [uploads]);

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
    if (normalizedStatus === 'fallido' || status === 'failed') {
      return <AlertCircle className="h-5 w-5 text-red-500" />;
    }
    return <Loader2 className="h-5 w-5 animate-spin text-violet-600" />;
  };

  const getStatusColor = (status: string) => {
    const normalizedStatus = status?.toLowerCase() || '';
    
    if (normalizedStatus === 'completado' || status === 'completed') {
      return 'bg-green-500';
    }
    if (normalizedStatus === 'fallido' || status === 'failed') {
      return 'bg-red-500';
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
          {/* Barra de progreso general */}
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
          </div>

          {/* Mensaje descriptivo */}
          <p className="text-sm text-muted-foreground">
            {upload.progressData.message}
          </p>

          {/* 🆕 LISTA DE ARCHIVOS INDIVIDUALES (si es ZIP) */}
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
                  {upload.progressData.children!.map((child) => (
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
                        {getStatusIcon(child.status)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

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
                    No se pudo conectar al servidor
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
          {(upload.progressData.status === 'completed' || upload.progressData.status === 'Completado') && (
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