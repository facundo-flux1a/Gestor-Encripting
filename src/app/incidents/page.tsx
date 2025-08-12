import { MainLayout, MainLayoutHeader } from "@/components/layout/main-layout";
import { getIncidents } from "@/services/document-service";
import { DocumentsTable } from "@/components/dashboard/documents-table";

export default async function IncidentsPage() {
  const documents = await getIncidents();
  
  return (
    <MainLayout>
      <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
        <MainLayoutHeader>
            <div className="flex items-center justify-between space-y-2">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Incidencias</h2>
                    <p className="text-muted-foreground">
                        Documentos con incidencias pendientes de revisar.
                    </p>
                </div>
            </div>
        </MainLayoutHeader>
        <div>
            <DocumentsTable documents={documents} />
        </div>
      </div>
    </MainLayout>
  );
}
