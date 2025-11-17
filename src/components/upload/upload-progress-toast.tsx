'use client';

import { useEffect } from 'react';
import { useUploadProgress } from '@/hooks/use-upload-progress';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle2, Loader2, AlertCircle } from 'lucide-react';

interface UploadProgressToastProps {
  uploadId: string | null;
  onComplete?: () => void;
}

export function UploadProgressToast({ uploadId, onComplete }: UploadProgressToastProps) {
  const { progress } = useUploadProgress(uploadId);
  const { toast } = useToast();

  useEffect(() => {
    if (!uploadId || progress.status === 'idle') return;

    const statusConfig = {
      processing: {
        title: '📤 Subiendo archivo...',
        icon: <Loader2 className="h-5 w-5 animate-spin" />,
        variant: 'default' as const,
      },
      analyzing: {
        title: '🔍 Analizando documento...',
        icon: <Loader2 className="h-5 w-5 animate-spin" />,
        variant: 'default' as const,
      },
      completed: {
        title: '✅ Documento procesado',
        icon: <CheckCircle2 className="h-5 w-5 text-green-500" />,
        variant: 'default' as const,
      },
      error: {
        title: '❌ Error al procesar',
        icon: <AlertCircle className="h-5 w-5 text-red-500" />,
        variant: 'destructive' as const,
      },
    };

    const config = statusConfig[progress.status];

    toast({
      title: config.title,
      description: (
        <div className="space-y-2">
          <p className="text-sm">{progress.message}</p>
          {progress.status !== 'completed' && progress.status !== 'error' && (
            <div className="w-full bg-secondary rounded-full h-2">
              <div
                className="bg-primary h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress.progress}%` }}
              />
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Paso: {progress.step} • {progress.progress}%
          </p>
        </div>
      ),
      duration: progress.status === 'completed' || progress.status === 'error' ? 5000 : Infinity,
    });

    if (progress.status === 'completed' && onComplete) {
      onComplete();
    }
  }, [progress, uploadId, toast, onComplete]);

  return null;
}