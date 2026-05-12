'use client';

import { useState, useEffect, useCallback } from 'react';

export type UploadProgress = {
  status: 'idle' | 'processing' | 'analyzing' | 'completed' | 'error';
  step: string;
  progress: number;
  message: string;
  data?: any;
};

export function useUploadProgress(uploadId: string | null) {
  const [progress, setProgress] = useState<UploadProgress>({
    status: 'idle',
    step: '',
    progress: 0,
    message: '',
  });

  useEffect(() => {
    if (!uploadId) return;

    console.log('🔌 [useUploadProgress] Conectando SSE para:', uploadId);

    const eventSource = new EventSource(`/api/upload-progress?uploadId=${uploadId}`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('📨 [useUploadProgress] Progreso recibido:', data);
        
        setProgress({
          status: data.status || 'processing',
          step: data.step || '',
          progress: data.progress || 0,
          message: data.message || '',
          data: data.data,
        });
      } catch (error) {
        console.error('❌ [useUploadProgress] Error al parsear:', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('❌ [useUploadProgress] Error SSE:', error);
      eventSource.close();
    };

    return () => {
      console.log('🔌 [useUploadProgress] Cerrando SSE');
      eventSource.close();
    };
  }, [uploadId]);

  const reset = useCallback(() => {
    setProgress({
      status: 'idle',
      step: '',
      progress: 0,
      message: '',
    });
  }, []);

  return { progress, reset };
}