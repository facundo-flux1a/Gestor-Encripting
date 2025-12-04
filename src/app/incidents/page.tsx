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
import { AlertTriangle } from "lucide-react";

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
                <div className="flex-1 space-y-4 p-4 sm:p-6 lg:p-8">
                    <MainLayoutHeader>
                        <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
                            <AlertTriangle className="h-6 w-6 sm:h-7 sm:w-7 text-amber-500 shrink-0" />
                            <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight truncate bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
                                Gestión de Incidencias
                            </h2>
                        </div>
                    </MainLayoutHeader>
                    <div className="space-y-4 sm:space-y-6">
                        <Skeleton className="h-[250px] sm:h-[300px] w-full animate-pulse" />
                        <Skeleton className="h-[300px] sm:h-[400px] w-full animate-pulse" />
                        <Skeleton className="h-[300px] sm:h-[400px] w-full animate-pulse" />
                    </div>
                </div>
            </MainLayout>
        );
    }

    return (
        <MainLayout>
            <div className="flex-1 space-y-4 p-4 sm:p-6 lg:p-8">
                <MainLayoutHeader>
                    <div className="flex items-start sm:items-center justify-between w-full gap-2 flex-col sm:flex-row">
                        <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
                            <div className="p-2 bg-amber-500/10 rounded-xl shrink-0 animate-fade-in">
                                <AlertTriangle className="h-5 w-5 sm:h-6 sm:w-6 text-amber-500" />
                            </div>
                            <div className="flex-1 space-y-1 min-w-0">
                                <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight truncate bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
                                    Gestión de Incidencias
                                </h2>
                                <p className="text-xs sm:text-sm text-muted-foreground">
                                    Analiza, revisa y valida las incidencias de tus documentos
                                </p>
                            </div>
                        </div>
                    </div>
                </MainLayoutHeader>
                
                <div className="space-y-4 sm:space-y-6">
                    {/* Analytics y Card de Análisis - Grid Responsive con animaciones */}
                    <div className="grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-3">
                        <div className="lg:col-span-2 animate-fade-in group" style={{ animationDelay: '0ms' }}>
                            <div className="transition-all duration-300 hover:shadow-xl hover:shadow-primary/10">
                                <IncidentsAnalytics data={analyticsData} />
                            </div>
                        </div>
                        <div className="animate-fade-in group" style={{ animationDelay: '50ms' }}>
                            <div className="transition-all duration-300 hover:shadow-xl hover:shadow-primary/10">
                                <AnalyzeDocumentsCard onAnalysisComplete={handleAnalysisComplete} />
                            </div>
                        </div>
                    </div>

                    <Separator className="my-4 sm:my-6" />

                    {/* Tabla de Incidencias de IA con animación */}
                    <div className="animate-fade-in" style={{ animationDelay: '100ms' }}>
                        <AIIncidentsTable 
                            empresaIds={selectedCompanyIds} 
                            onRefresh={handleAnalysisComplete}
                        />
                    </div>

                    <Separator className="my-4 sm:my-6" />

                    {/* Tabla de Documentos con Incidencias con animación */}
                    <div className="space-y-3 sm:space-y-4 animate-fade-in" style={{ animationDelay: '150ms' }}>
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4">
                            <div className="space-y-1 min-w-0">
                                <h3 className="text-lg sm:text-xl lg:text-2xl font-semibold tracking-tight truncate bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
                                    Documentos con Incidencias Pendientes
                                </h3>
                                <p className="text-xs sm:text-sm text-muted-foreground">
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

            {/* Estilos de animación */}
            <style jsx global>{`
                @keyframes fade-in {
                    from {
                        opacity: 0;
                        transform: translateY(10px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }

                .animate-fade-in {
                    animation: fade-in 0.5s ease-out forwards;
                    opacity: 0;
                }

                @media (prefers-reduced-motion: reduce) {
                    .animate-fade-in {
                        animation: none;
                        opacity: 1;
                    }
                    
                    .transition-all {
                        transition: none !important;
                    }
                }
            `}</style>
        </MainLayout>
    );
}