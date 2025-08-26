
'use client';
import { useState, useEffect } from "react";
import { DocumentsTable } from "@/components/dashboard/documents-table";
import type { Document } from "@/lib/types";
import type { IncidentsAnalyticsData } from "@/components/incidents/incidents-analytics";
import { IncidentsAnalytics } from "@/components/incidents/incidents-analytics";
import { AnalyzeDocumentsCard } from "@/components/incidents/analyze-documents-card";
import { getIncidents, getIncidentsAnalytics } from "@/services/document-service";

interface ClientIncidentsPageProps {
    initialDocs: Document[];
    initialAnalytics: IncidentsAnalyticsData;
}

export function ClientIncidentsPage({ initialDocs, initialAnalytics }: ClientIncidentsPageProps) {
    const [documents, setDocuments] = useState<Document[]>(initialDocs);
    const [analytics, setAnalytics] = useState<IncidentsAnalyticsData>(initialAnalytics);

    const fetchData = async () => {
        const [docs, analyticsData] = await Promise.all([
            getIncidents(),
            getIncidentsAnalytics(),
        ]);
        setDocuments(docs);
        setAnalytics(analyticsData);
    };

    const handleAnalysisComplete = () => {
        fetchData();
    };

    return (
        <div className="space-y-6">
            <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-3">
                <div className="lg:col-span-2">
                    <IncidentsAnalytics data={analytics} />
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
    );
}

