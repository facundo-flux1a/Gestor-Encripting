import { Suspense } from 'react';
import ActivityTable from '@/components/ActivityTable';
import { Activity, Loader2 } from 'lucide-react';
import { ActividadProvider } from '@/context/ActividadProvider';
import { ActividadTutorialRouter } from '@/components/actividad/ActividadTutorialRouter';
import { PageHeader } from "@/components/layout/page-header";

export default function ActividadPage() {
  return (
    <ActividadProvider>
      <div className="p-4 sm:p-6 lg:p-8" data-tutorial="actividad-welcome">
        <PageHeader
          title="Registro de Actividad"
          icon={Activity}
          description="Historial completo de acciones y eventos del sistema"
          hideSidebarTrigger
        />

        <Suspense fallback={<ActivitySkeleton />}>
          <ActivityTable />
        </Suspense>

        <ActividadTutorialRouter />
      </div>
    </ActividadProvider>
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