import { MainLayout } from "@/components/layout/main-layout";
import { getDocuments } from "@/services/document-service";
import { StatsCard } from "@/components/dashboard/stats-card";
import { DocumentsTable } from "@/components/dashboard/documents-table";
import {
  FileText,
  FileWarning,
  FileType,
} from "lucide-react";

export default async function Home() {
  const documents = await getDocuments();
  
  const totalDocuments = documents.length;
  const incidentDocuments = documents.filter((doc) => doc.incidencia).length;
  
  const documentTypes = new Set(documents.map((doc) => doc.tipo_documento));
  const totalTypes = documentTypes.size;
  
  return (
    <MainLayout>
      <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
        <div className="flex flex-col space-y-2 md:flex-row md:items-center md:justify-between">
            <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <StatsCard title="Total Documents" value={totalDocuments.toString()} icon={FileText} />
            <StatsCard title="Incidents" value={incidentDocuments.toString()} icon={FileWarning} />
            <StatsCard title="Document Types" value={totalTypes.toString()} icon={FileType} />
        </div>
        <div>
            <DocumentsTable documents={documents} />
        </div>
      </div>
    </MainLayout>
  );
}
