
import { MainLayout, MainLayoutHeader } from "@/components/layout/main-layout";
import { getIncidents, getIncidentsAnalytics } from "@/services/document-service";
import { DocumentsTable } from "@/components/dashboard/documents-table";
import { IncidentsAnalytics } from "@/components/incidents/incidents-analytics";
import { AnalyzeDocumentsCard } from "@/components/incidents/analyze-documents-card";
import { ClientIncidentsPage } from "./client-page";

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
        <ClientIncidentsPage initialDocs={docs} initialAnalytics={analyticsData} />
      </div>
    </MainLayout>
  );
}

