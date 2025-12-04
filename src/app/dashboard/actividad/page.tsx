import { Suspense } from 'react';
import ActivityTable from '@/components/ActivityTable';
import { Loader2 } from 'lucide-react';

export default function ActividadPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold">Historial de Actividad</h1>
        <p className="text-xs sm:text-sm text-muted-foreground mt-1 sm:mt-2">
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
    <div className="flex items-center justify-center p-8 sm:p-12">
      <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 animate-spin text-gray-400 shrink-0" />
      <span className="ml-2 sm:ml-3 text-sm sm:text-base text-gray-600">Cargando actividad...</span>
    </div>
  );
}