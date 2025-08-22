
'use client';
import { MainLayout, MainLayoutHeader } from "@/components/layout/main-layout";
import { getIncidents, getIncidentsAnalytics } from "@/services/document-service";
import { DocumentsTable } from "@/components/dashboard/documents-table";
import { useEffect, useState } from "react";
import type { Document } from "@/lib/types";
import type { IncidentsAnalyticsData } from "@/components/incidents/incidents-analytics";
import { Loader2 } from "lucide-react";
import { IncidentsAnalytics } from "@/components/incidents/incidents-analytics";
import { AnalyzeDocumentsCard } from "@/components/incidents/analyze-documents-card";

export default function IncidentsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [analytics, setAnalytics] = useState<IncidentsAnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = async () => {
    setIsLoading(true);
    try {
        const [docs, analyticsData] = await Promise.all([
            getIncidents(),
            getIncidentsAnalytics(),
        ]);
        setDocuments(docs);
        setAnalytics(analyticsData);
    } catch (error) {
        console.error("Error loading incidents data:", error);
    } finally {
        setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAnalysisComplete = () => {
    // Refresh data after analysis
    fetchData();
  };
  
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

        {isLoading ? (
             <div className="flex justify-center items-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        ) : (
            <div className="space-y-6">
                <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-3">
                    <div className="lg:col-span-2">
                       {analytics && <IncidentsAnalytics data={analytics} />}
                    </div>
                    <div>
                        <AnalyzeDocumentsCard onAnalysisComplete={handleAnalysisComplete} />
                    </div>
                </div>

                <div>
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-2xl font-semibold tracking-tight">Documentos con Incidencias Pendientes</h3>
                    </div>
                    <DocumentsTable documents={documents} isIncidentsPage={true} filename="incidencias" />
                </div>
            </div>
        )}
      </div>
    </MainLayout>
  );
}
