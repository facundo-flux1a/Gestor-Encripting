"use client";

import { MainLayout, MainLayoutHeader } from "@/components/layout/main-layout";
import { Building, Loader2 } from "lucide-react";
import { ProviderDetailClient } from "./provider-detail-client";
import { useEffect, useState, use, Suspense } from "react";
import { 
    getProviderByFiscalId, getDocumentsByProviderName, getProductsByProviderName, getProviderAnalytics, getAllProductLinesByProviderName,
    getClientByFiscalId, getDocumentsByClientName, getProductsByClientName, getClientAnalytics, getAllProductLinesByClientName
} from "@/services/document-service";
import { useCompanyContext } from "@/context/CompanyProvider";
import { useSearchParams } from "next/navigation";
import { useDemoMode } from '@/context/DemoModeContext';
import { DEMO_PROVEEDORES, DEMO_DOCUMENTS } from '@/lib/demo-data';

function ProveedorDetailInner({ name }: { name: string }) {
    const searchParams = useSearchParams();
    const isClient = searchParams.get('type') === 'cliente';

    const { selectedCompanyIds, companies } = useCompanyContext();
    const { isDemoMode } = useDemoMode();
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function loadData() {
            if (isDemoMode) {
                const prov = DEMO_PROVEEDORES[0];
                const docs = DEMO_DOCUMENTS;
                const prods = [
                    { id: 1, codigo: 'AWS-EC2', descripcion: 'Compute Instance Usage (EC2 & Lambda)', totalSpent: 950.00, count: 1 }
                ];
                const analytics = {
                    monthlyTrend: [
                        { month: 'Jun', total: 1200 },
                        { month: 'Jul', total: 1500 },
                        { month: 'Ago', total: 1754.50 }
                    ]
                };
                setData({ prov, docs, prods, analytics, allProds: prods });
                setLoading(false);
                return;
            }

            const fiscalId = decodeURIComponent(name);

            const empresaIds = selectedCompanyIds.length > 0
                ? selectedCompanyIds
                : companies.map(c => c.id);

            console.log(`🔍 [ProveedorDetailPage] Fiscal ID: ${fiscalId}, isClient: ${isClient}`);

            const [prov, docs, prods, analytics, allProds] = await Promise.all(
                isClient ? [
                    getClientByFiscalId(fiscalId),
                    getDocumentsByClientName(fiscalId, empresaIds),
                    getProductsByClientName(fiscalId, empresaIds),
                    getClientAnalytics(fiscalId, empresaIds),
                    getAllProductLinesByClientName(fiscalId, empresaIds)
                ] : [
                    getProviderByFiscalId(fiscalId),
                    getDocumentsByProviderName(fiscalId, empresaIds),
                    getProductsByProviderName(fiscalId, empresaIds),
                    getProviderAnalytics(fiscalId, empresaIds),
                    getAllProductLinesByProviderName(fiscalId, empresaIds)
                ]
            );

            setData({ prov, docs, prods, analytics, allProds });
            setLoading(false);
        }

        if (companies.length > 0) {
            loadData();
        }
    }, [name, selectedCompanyIds, companies]);

    if (loading || companies.length === 0) {
        return (
            <MainLayout>
                <div className="flex items-center justify-center h-screen">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            </MainLayout>
        );
    }

    if (!data?.prov) {
        return (
            <MainLayout>
                <div className="flex flex-col items-center justify-center h-screen gap-4">
                    <Building className="h-16 w-16 text-muted-foreground" />
                    <p className="text-muted-foreground text-lg">Proveedor no encontrado</p>
                </div>
            </MainLayout>
        );
    }

    return (
        <MainLayout>
            <div className="flex-1 space-y-8 p-4 pt-6 md:p-8">
                <MainLayoutHeader>
                    <div className="flex-1">
                        <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                            <Building className="h-8 w-8 text-primary" />
                            {data.prov.nombre}
                        </h2>
                        <p className="text-muted-foreground font-mono">
                            {data.prov.identificador_fiscal}
                        </p>
                    </div>
                </MainLayoutHeader>

                <ProviderDetailClient
                    initialProvider={data.prov}
                    initialDocuments={data.docs}
                    initialProducts={data.prods}
                    initialAllProducts={data.allProds}
                    initialAnalyticsData={data.analytics}
                    isClient={isClient}
                />
            </div>
        </MainLayout>
    );
}

export default function ProveedorDetailPage({ params }: { params: Promise<{ name: string }> }) {
    const resolvedParams = use(params);
    return (
        <Suspense fallback={
            <MainLayout>
                <div className="flex items-center justify-center h-screen">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            </MainLayout>
        }>
            <ProveedorDetailInner name={resolvedParams.name} />
        </Suspense>
    );
}