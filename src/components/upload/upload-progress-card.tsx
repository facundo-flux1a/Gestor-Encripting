'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, Loader2, AlertCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface UploadProgressData {
  status: 'processing' | 'analyzing' | 'saving' | 'completed' | 'error';
  step: string;
  progress: number;
  message: string;
  error?: string;
}

interface UploadProgressCardProps {
  uploadId: string;
  fileName: string;
  onComplete?: () => void;
  onError?: (error: string) => void;
  onClose?: () => void;
}

export function UploadProgressCard({
  uploadId,
  fileName,
  onComplete,
  onError,
  onClose
}: UploadProgressCardProps) {
  const [progressData, setProgressData] = useState<UploadProgressData>({
    status: 'processing',
    step: 'Iniciando...',
    progress: 0,
    message: 'Preparando archivo para subir'
  });

  useEffect(() => {
    console.log('🔌 [UploadProgressCard] Conectando SSE para:', uploadId);

    const eventSource = new EventSource(`/api/upload-progress?uploadId=${uploadId}`);

    eventSource.onmessage = (event) => {
      try {
        const data: UploadProgressData = JSON.parse(event.data);
        console.log('📨 [UploadProgressCard] Progreso recibido:', data);
        
        setProgressData(data);

        // Si completó, cerrar después de 2 segundos
        if (data.status === 'completed') {
          console.log('✅ [UploadProgressCard] Upload completado');
          setTimeout(() => {
            onComplete?.();
          }, 2000);
        }

        // Si hubo error, notificar
        if (data.status === 'error') {
          console.error('❌ [UploadProgressCard] Error:', data.error);
          onError?.(data.error || 'Error desconocido');
        }
      } catch (err) {
        console.error('❌ [UploadProgressCard] Error parseando datos:', err);
      }
    };

    eventSource.onerror = (error) => {
      console.error('❌ [UploadProgressCard] Error en SSE:', error);
      eventSource.close();
    };

    return () => {
      console.log('🔌 [UploadProgressCard] Cerrando SSE');
      eventSource.close();
    };
  }, [uploadId, onComplete, onError]);

  const getStatusIcon = () => {
    switch (progressData.status) {
      case 'completed':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'error':
        return <AlertCircle className="h-5 w-5 text-red-500" />;
      default:
        return <Loader2 className="h-5 w-5 animate-spin text-blue-500" />;
    }
  };

  const getStatusColor = () => {
    switch (progressData.status) {
      case 'completed':
        return 'bg-green-500';
      case 'error':
        return 'bg-red-500';
      default:
        return 'bg-blue-500';
    }
  };

  return (
    <Card className="w-full max-w-md shadow-lg border-2">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2 flex-1">
            {getStatusIcon()}
            <CardTitle className="text-base font-medium truncate">
              {fileName}
            </CardTitle>
          </div>
          {progressData.status === 'completed' && onClose && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 -mt-1"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Barra de progreso */}
        <div className="space-y-1">
          <Progress 
            value={progressData.progress} 
            className="h-2"
            indicatorClassName={getStatusColor()}
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{progressData.step}</span>
            <span>{progressData.progress}%</span>
          </div>
        </div>

        {/* Mensaje descriptivo */}
        <p className="text-sm text-muted-foreground">
          {progressData.message}
        </p>

        {/* Error message si existe */}
        {progressData.error && (
          <div className="bg-red-50 border border-red-200 rounded-md p-2">
            <p className="text-xs text-red-600">{progressData.error}</p>
          </div>
        )}

        {/* Mensaje de éxito */}
        {progressData.status === 'completed' && (
          <div className="bg-green-50 border border-green-200 rounded-md p-2">
            <p className="text-xs text-green-600 font-medium">
              ✅ Documento procesado exitosamente
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}