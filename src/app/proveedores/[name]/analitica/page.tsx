
'use client';

import { MainLayout, MainLayoutHeader } from "@/components/layout/main-layout";
import { useParams, notFound } from "next/navigation";
import { useEffect, useState } from "react";
import { Building, Loader2 } from "lucide-react";
import { getProviderByFiscalId, getProviderAnalytics } from "@/services/document-service";
import type { DocumentEntity } from "@/lib/types";
import { ProviderAnalytics, type ProviderAnalyticsData } from "@/components/dashboard/provider-analytics";

export default function ProveedorAnaliticaPage() {
    const params = useParams();
    const [provider, setProvider] = useState<DocumentEntity | null>(null);
    const [analyticsData, setAnalyticsData] = useState<ProviderAnalyticsData | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const fiscalId = params.name as string;

    useEffect(() => {
        if (fiscalId) {
            const decodedFiscalId = decodeURIComponent(fiscalId);
            
            async function fetchData() {
                setIsLoading(true);
                try {
                    const [prov, data] = await Promise.all([
                        getProviderByFiscalId(decodedFiscalId),
                        getProviderAnalytics(decodedFiscalId)
                    ]);
                    
                    if (!prov || !data) {
                        notFound();
                        return;
                    }

                    setProvider(prov);
                    setAnalyticsData(data);

                } catch (error) {
                    console.error("Failed to fetch provider analytics data", error);
                } finally {
                    setIsLoading(false);
                }
            }
            fetchData();
        } else {
            notFound();
        }
    }, [fiscalId]);

    if (isLoading) {
        return (
             <MainLayout>
                <div className="flex flex-1 items-center justify-center">
                    <Loader2 className="h-10 w-10 animate-spin text-primary" />
                </div>
            </MainLayout>
        )
    }

    if (!provider || !analyticsData) {
        return notFound();
    }

    return (
        <MainLayout>
            <div className="flex-1 space-y-8 p-4 pt-6 md:p-8">
                <MainLayoutHeader>
                    <div className="flex items-center justify-between space-y-2">
                        <div>
                             <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                                <Building className="h-8 w-8 text-primary" />
                                {provider.nombre}
                            </h2>
                            <p className="text-muted-foreground">
                                Analítica de compras y rendimiento del proveedor.
                            </p>
                        </div>
                    </div>
                </MainLayoutHeader>

                <ProviderAnalytics data={analyticsData} />
            </div>
        </MainLayout>
    );
}
