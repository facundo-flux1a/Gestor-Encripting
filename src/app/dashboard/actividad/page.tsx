import { Suspense } from 'react';
import ActivityTable from '@/components/ActivityTable';
import { Loader2 } from 'lucide-react';

export default function ActividadPage() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Historial de Actividad</h1>
        <p className="text-muted-foreground mt-2">
          Seguimiento de todos los documentos subidos y su estado de procesamiento
        </p>
      </div>

      <Suspense fallback={<ActivitySkeleton />}>
        <ActivityTable />
      </Suspense>
    </div>
  );
}

function ActivitySkeleton() {
  return (
    <div className="flex items-center justify-center p-12">
      <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      <span className="ml-3 text-gray-600">Cargando actividad...</span>
    </div>
  );
}