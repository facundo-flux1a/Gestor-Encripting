"use client";

import { MainLayout, MainLayoutHeader } from "@/components/layout/main-layout";
import { Building, Loader2 } from "lucide-react";
import { ProviderDetailClient } from "./provider-detail-client";
import { useEffect, useState, use } from "react";
import { getProviderByFiscalId, getDocumentsByProviderName, getProductsByProviderName, getProviderAnalytics, getAllProductLinesByProviderName } from "@/services/document-service";
import { useCompanyContext } from "@/context/CompanyProvider";

export default function ProveedorDetailPage({ params }: { params: Promise<{ name: string }> }) {
    // ✅ Unwrap params usando React.use()
    const resolvedParams = use(params);

    const { selectedCompanyIds, companies } = useCompanyContext();
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function loadData() {
            const fiscalId = decodeURIComponent(resolvedParams.name);

            // 🎯 Usar las empresas seleccionadas del contexto
            // Si no hay selección, usar TODAS las empresas del usuario
            const empresaIds = selectedCompanyIds.length > 0
                ? selectedCompanyIds
                : companies.map(c => c.id);

            console.log(`🔍 [ProveedorDetailPage] Fiscal ID: ${fiscalId}`);
            console.log(`🏢 [ProveedorDetailPage] Empresas del contexto:`, companies.map(c => c.id));
            console.log(`✅ [ProveedorDetailPage] Empresas seleccionadas:`, selectedCompanyIds);
            console.log(`📊 [ProveedorDetailPage] Empresas a filtrar:`, empresaIds);

            const [prov, docs, prods, analytics, allProds] = await Promise.all([
                getProviderByFiscalId(fiscalId),
                getDocumentsByProviderName(fiscalId, empresaIds),
                getProductsByProviderName(fiscalId, empresaIds),
                getProviderAnalytics(fiscalId, empresaIds),
                getAllProductLinesByProviderName(fiscalId, empresaIds)
            ]);

            console.log(`✅ [ProveedorDetailPage] Datos cargados:`);
            console.log(`   - Proveedor: ${prov?.nombre}`);
            console.log(`   - Documentos: ${docs.length}`);
            console.log(`   - Productos: ${prods.length}`);
            console.log(`   - Total gastado: ${analytics.totalGastado} ${analytics.moneda}`);
            console.log(`   - Datos gráfico:`, analytics.comprasPorMes);

            setData({ prov, docs, prods, analytics, allProds });
            setLoading(false);
        }

        // Solo cargar cuando companies esté disponible
        if (companies.length > 0) {
            loadData();
        }
    }, [resolvedParams.name, selectedCompanyIds, companies]);

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
                />
            </div>
        </MainLayout>
    );
}