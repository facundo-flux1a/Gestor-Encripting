'use client';

import { MainLayout, MainLayoutHeader } from "@/components/layout/main-layout";
import { DocumentsTable } from "@/components/dashboard/documents-table";
import { IncidentsAnalytics } from "@/components/incidents/incidents-analytics";
import { AnalyzeDocumentsCard } from "@/components/incidents/analyze-documents-card";
import { AIIncidentsTable } from "@/components/incidents/ai-incidents-table";
import { useCompanyContext } from "@/context/CompanyProvider";
import { useState, useEffect } from "react";
import type { Document } from "@/lib/types";
import type { IncidentsAnalyticsData } from "@/components/incidents/incidents-analytics";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";

export default function IncidentsPage() {
    const { selectedCompanyIds } = useCompanyContext();
    const [docs, setDocs] = useState<Document[]>([]);
    const [analyticsData, setAnalyticsData] = useState<IncidentsAnalyticsData>({
        totalOpen: 0,
        totalValidated: 0,
        byProvider: [],
        byType: []
    });
    const [isLoading, setIsLoading] = useState(true);

    const fetchIncidents = async () => {
        try {
            setIsLoading(true);
            console.log('🔄 [IncidentsPage] Fetching con empresas:', selectedCompanyIds);

            const params = new URLSearchParams();
            if (selectedCompanyIds.length > 0) {
                selectedCompanyIds.forEach(id => params.append('empresaIds', id.toString()));
            }

            const [docsRes, analyticsRes] = await Promise.all([
                fetch(`/api/incidents?${params.toString()}`),
                fetch(`/api/incidents/analytics?${params.toString()}`)
            ]);

            if (docsRes.ok && analyticsRes.ok) {
                const [docsData, analyticsData] = await Promise.all([
                    docsRes.json(),
                    analyticsRes.json()
                ]);
                
                setDocs(docsData);
                setAnalyticsData(analyticsData);
                console.log('✅ [IncidentsPage] Datos cargados:', {
                    docs: docsData.length,
                    totalOpen: analyticsData.totalOpen
                });
            }
        } catch (error) {
            console.error('❌ [IncidentsPage] Error:', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchIncidents();
    }, [selectedCompanyIds]);

    const handleAnalysisComplete = () => {
        console.log('🔄 [IncidentsPage] Análisis completado, recargando...');
        fetchIncidents();
    };

    if (isLoading) {
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
                        <Skeleton className="h-[300px] w-full" />
                        <Skeleton className="h-[400px] w-full" />
                        <Skeleton className="h-[400px] w-full" />
                    </div>
                </div>
            </MainLayout>
        );
    }

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
                    {/* Analytics y Card de Análisis */}
                    <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-3">
                        <div className="lg:col-span-2">
                            <IncidentsAnalytics data={analyticsData} />
                        </div>
                        <div>
                            <AnalyzeDocumentsCard onAnalysisComplete={handleAnalysisComplete} />
                        </div>
                    </div>

                    <Separator className="my-6" />

                    {/* ✅ NUEVA: Tabla de Incidencias de IA */}
                    <AIIncidentsTable 
                        empresaIds={selectedCompanyIds} 
                        onRefresh={handleAnalysisComplete}
                    />

                    <Separator className="my-6" />

                    {/* Tabla de Documentos con Incidencias (existente) */}
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h3 className="text-2xl font-semibold tracking-tight">
                                    Documentos con Incidencias Pendientes
                                </h3>
                                <p className="text-sm text-muted-foreground">
                                    Incidencias manuales y de validación
                                </p>
                            </div>
                        </div>
                        <DocumentsTable 
                            documents={docs} 
                            isIncidentsPage={true} 
                            filename="incidencias" 
                        />
                    </div>
                </div>
            </div>
        </MainLayout>
    );
}