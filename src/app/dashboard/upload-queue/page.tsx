'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUploadQueueOptional } from '@/context/UploadQueueProvider';
import { Loader2 } from 'lucide-react';

/**
 * Ruta legacy: abre el panel global de cola y redirige al dashboard.
 * La cola ya no es una página aparte.
 */
export default function UploadQueuePage() {
  const router = useRouter();
  const uploadQueue = useUploadQueueOptional();

  useEffect(() => {
    uploadQueue?.openQueue();
    router.replace('/documents');
  }, [uploadQueue, router]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center gap-2 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" />
      <span className="text-sm">Abriendo cola de subidas…</span>
    </div>
  );
}
