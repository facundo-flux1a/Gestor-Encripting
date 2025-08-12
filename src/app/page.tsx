import { MainLayout } from "@/components/layout/main-layout";
import { documents } from "@/lib/data";
import { StatsCard } from "@/components/dashboard/stats-card";
import { FinancialOverview } from "@/components/dashboard/financial-overview";
import { DocumentsTable } from "@/components/dashboard/documents-table";
import {
  FileText,
  FileWarning,
  FileType,
  UploadCloud,
  Search,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export default function Home() {
  const totalDocuments = documents.length;
  const incidentDocuments = documents.filter((doc) => doc.incidencia).length;
  
  const documentTypes = new Set(documents.map((doc) => doc.tipo_documento));
  const totalTypes = documentTypes.size;
  
  const incidents = documents.filter((doc) => doc.incidencia);

  return (
    <MainLayout>
      <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
        <div className="flex flex-col space-y-2 md:flex-row md:items-center md:justify-between">
            <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
            <div className="flex items-center space-x-2">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input placeholder="Search documents..." className="pl-9" />
                </div>
                <Button>
                    <UploadCloud className="mr-2 h-4 w-4" />
                    Upload Document
                </Button>
            </div>
        </div>

        <Tabs defaultValue="overview" className="space-y-4">
            <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="incidents">
                Incidents for Validation <Badge className="ml-2" variant="destructive">{incidents.length}</Badge>
                </TabsTrigger>
            </TabsList>
            <TabsContent value="overview" className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    <StatsCard title="Total Documents" value={totalDocuments.toString()} icon={FileText} />
                    <StatsCard title="Incidents" value={incidentDocuments.toString()} icon={FileWarning} />
                    <StatsCard title="Document Types" value={totalTypes.toString()} icon={FileType} />
                </div>

                <FinancialOverview documents={documents} />

                <div>
                    <h3 className="text-xl font-bold tracking-tight mb-4">All Documents</h3>
                    <DocumentsTable documents={documents} />
                </div>
            </TabsContent>
            <TabsContent value="incidents" className="space-y-4">
                <div>
                    <h3 className="text-xl font-bold tracking-tight mb-4">Documents with Incidents</h3>
                    <DocumentsTable documents={incidents} />
                </div>
            </TabsContent>
        </Tabs>

      </div>
    </MainLayout>
  );
}
