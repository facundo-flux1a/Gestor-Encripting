
'use server';
import { MainLayout, MainLayoutHeader } from "@/components/layout/main-layout";
import { getIncidents, getIncidentsAnalytics } from "@/services/document-service";
import { DocumentsTable } from "@/components/dashboard/documents-table";
import { IncidentsAnalytics } from "@/components/incidents/incidents-analytics";
import { AnalyzeDocumentsCard } from "@/components/incidents/analyze-documents-card";
import { revalidatePath } from "next/cache";

async function handleAnalysisComplete() {
    'use server';
    revalidatePath('/incidents');
}

export default async function IncidentsPage() {
    const [docs, analyticsData] = await Promise.all([
        getIncidents(),
        getIncidentsAnalytics(),
    ]);

  return (
    <MainLayout>
      <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
        <MainLayoutHeader>
            <div className="flex-1">
                <h2 className="text-3xl font-bold tracking-tight">Gestión de Incidencias</h2>
                <p className="text-muted-foreground">
                    Analiza, revisa y valida las incidencias de tus documentos.
                </p>
            </div>
        </MainLayoutHeader>
        <div className="space-y-6">
            <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-3">
                <div className="lg:col-span-2">
                    <IncidentsAnalytics data={analyticsData} />
                </div>
                <div>
                    <AnalyzeDocumentsCard onAnalysisComplete={handleAnalysisComplete} />
                </div>
            </div>

            <div>
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-2xl font-semibold tracking-tight">Documentos con Incidencias Pendientes</h3>
                </div>
                <DocumentsTable documents={docs} isIncidentsPage={true} filename="incidencias" />
            </div>
        </div>
      </div>
    </MainLayout>
  );
}
