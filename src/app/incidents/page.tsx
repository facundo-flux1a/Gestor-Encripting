'use client';

import { MainLayout } from "@/components/layout/main-layout";
import { PageHeader } from "@/components/layout/page-header";
import { DocumentsTable } from "@/components/dashboard/documents-table";
import { IncidentsAnalytics } from "@/components/incidents/incidents-analytics";
import { AnalyzeDocumentsCard } from "@/components/incidents/analyze-documents-card";
import { GroupedAIIncidentsTable } from "@/components/incidents/grouped-ai-incidents-table";
import { useCompanyContext } from "@/context/CompanyProvider";
import { useDataRefresh } from '@/context/DataRefreshProvider';
import { useState, useEffect } from "react";
import type { Document } from "@/lib/types";
import type { IncidentsAnalyticsData } from "@/components/incidents/incidents-analytics";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { AlertTriangle } from "lucide-react";
import { IncidenciasProvider } from "@/context/IncidenciasProvider";
import { IncidenciasTutorialRouter } from "@/components/incidencias/IncidenciasTutorialRouter";

function IncidentsPageContent() {
    const { selectedCompanyIds } = useCompanyContext();
    const { refreshKey } = useDataRefresh();
    const [docs, setDocs] = useState<Document[]>([]);
    const [analyticsData, setAnalyticsData] = useState<IncidentsAnalyticsData>({
        totalOpen: 0,
        totalValidated: 0,
        byProvider: [],
        byType: []
    });
    const [isLoading, setIsLoading] = useState(true);
    const [activeTypeFilter, setActiveTypeFilter] = useState<string | null>(null);

    // IDs de docs que pertenecen al tipo activo (null = sin filtro)
    const filteredDocIds = activeTypeFilter && analyticsData.docIdsByType
        ? new Set<number>(analyticsData.docIdsByType[activeTypeFilter] ?? [])
        : null;

    const filteredDocs = filteredDocIds
        ? docs.filter(d => filteredDocIds.has(Number(d.id_documento)))
        : docs;

    // DEBUG LOGS FOR FILTERING
    if (activeTypeFilter) {
        console.log(`[IncidentsFilter] Tipo Activo: "${activeTypeFilter}"`);
        console.log(`[IncidentsFilter] IDs en docIdsByType:`, analyticsData.docIdsByType?.[activeTypeFilter]);
        console.log(`[IncidentsFilter] IDs en filteredDocIds (Set):`, filteredDocIds ? Array.from(filteredDocIds) : null);
        console.log(`[IncidentsFilter] Docs totales: ${docs.length}, Docs filtrados: ${filteredDocs.length}`);
        
        if (docs.length > 0 && filteredDocs.length === 0) {
            console.log(`[IncidentsFilter] ⚠️ CERO COINCIDENCIAS. Ejemplo de doc en la tabla:`, {
                id_documento: docs[0].id_documento,
                id_type: typeof docs[0].id_documento
            });
        }
    }

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
    }, [selectedCompanyIds, refreshKey]);

    const handleAnalysisComplete = async () => {
        console.log('🔄 [IncidentsPage] Análisis completado, recargando...');
        await fetchIncidents();
    };

    if (isLoading) {
        return (
            <MainLayout>
                <div className="flex-1 space-y-4 p-4 sm:p-6 lg:p-8">
                    <PageHeader
                        title="Gestión de Incidencias"
                        icon={AlertTriangle}
                    />
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
                <div data-tutorial="incidencias-header">
                    <PageHeader
                        title="Gestión de Incidencias"
                        icon={AlertTriangle}
                        description="Analiza, revisa y valida las incidencias de tus documentos"
                    />
                </div>

                <div className="space-y-4 sm:space-y-6">
                    {/* Analytics y Card de Análisis - Grid Responsive con animaciones */}
                    <div className="grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-3">
                        {/* 🎯 data-tutorial="incidencias-analytics" */}
                        <div className="lg:col-span-2 animate-fade-in" style={{ animationDelay: '0ms' }} data-tutorial="incidencias-analytics">
                            <div className="transition-all duration-300 hover:scale-[1.01] hover:shadow-xl hover:shadow-primary/10">
                            <IncidentsAnalytics 
                                data={analyticsData} 
                                onTypeClick={setActiveTypeFilter}
                                activeType={activeTypeFilter}
                            />
                            </div>
                        </div>
                        {/* 🎯 data-tutorial="incidencias-analizar" */}
                        <div className="animate-fade-in" style={{ animationDelay: '50ms' }} data-tutorial="incidencias-analizar">
                            <div className="transition-all duration-300 hover:scale-[1.01] hover:shadow-xl hover:shadow-primary/10">
                                <AnalyzeDocumentsCard onAnalysisComplete={handleAnalysisComplete} />
                            </div>
                        </div>
                    </div>

                    <Separator className="my-4 sm:my-6" />

                    {/* Tabla de Incidencias de IA Agrupada con animación y hover */}
                    {/* 🎯 data-tutorial="incidencias-ai-table" */}
                    <div className="animate-fade-in transition-all duration-300 hover:scale-[1.005]" style={{ animationDelay: '100ms' }} data-tutorial="incidencias-ai-table">
                        <GroupedAIIncidentsTable
                            empresaIds={selectedCompanyIds}
                            onRefresh={handleAnalysisComplete}
                            typeFilter={activeTypeFilter}
                        />
                    </div>

                    <Separator className="my-4 sm:my-6" />

                    {/* Tabla de Documentos con Incidencias con animación y hover */}
                    {/* 🎯 data-tutorial="incidencias-documentos" */}
                    <div className="space-y-3 sm:space-y-4 animate-fade-in transition-all duration-300 hover:scale-[1.005]" style={{ animationDelay: '150ms' }} data-tutorial="incidencias-documentos">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4">
                            <div className="space-y-1 min-w-0">
                                <h3 className="text-lg sm:text-xl lg:text-2xl font-semibold tracking-tight truncate bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
                                    Documentos con Incidencias Pendientes
                                </h3>
                                <p className="text-xs sm:text-sm text-muted-foreground">
                                    Incidencias manuales y de validación
                                </p>
                            </div>
                            {activeTypeFilter && (
                                <div className="flex items-center gap-2 mt-2 px-3 py-2 rounded-lg bg-primary/10 border border-primary/20 text-sm shrink-0">
                                    <span className="text-muted-foreground">Filtrando:</span>
                                    <span className="font-semibold text-primary">{activeTypeFilter}</span>
                                    <span className="text-xs text-muted-foreground">({filteredDocs.length} doc{filteredDocs.length !== 1 ? 's' : ''})</span>
                                    <button onClick={() => setActiveTypeFilter(null)} className="ml-2 text-xs underline text-muted-foreground hover:text-foreground">limpiar</button>
                                </div>
                            )}
                        </div>
                        <DocumentsTable
                            documents={filteredDocs}
                            isIncidentsPage={true}
                            filename="incidencias"
                            onDocumentChanged={fetchIncidents}
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
                        transform: none;
                    }
                    
                    .transition-all {
                        transition: none !important;
                    }
                    
                    .hover\:scale-\[1\.01\]:hover,
                    .hover\:scale-\[1\.005\]:hover {
                        transform: none !important;
                    }
                }
            `}</style>
        </MainLayout>
    );
}

// 🎯 WRAPPER CON PROVIDER Y TUTORIAL
export default function IncidentsPage() {
    return (
        <IncidenciasProvider>
            <IncidentsPageContent />
            <IncidenciasTutorialRouter />
        </IncidenciasProvider>
    );
}