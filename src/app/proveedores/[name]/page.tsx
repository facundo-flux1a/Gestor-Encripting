
import { MainLayout, MainLayoutHeader } from "@/components/layout/main-layout";
import { notFound } from "next/navigation";
import { Building, FileText, Package, Search, Loader2 } from "lucide-react";
import { getDocumentsByProviderName, getProductsByProviderName, getProviderByFiscalId, getProviderAnalytics } from "@/services/document-service";
import { ProviderDetailClient } from "./provider-detail-client";


export default async function ProveedorDetailPage({ params }: { params: { name: string }}) {
    const fiscalId = params.name as string;
    
    if (!fiscalId) {
        notFound();
    }
    
    const decodedFiscalId = decodeURIComponent(fiscalId);

    const [prov, docs, prods, analytics] = await Promise.all([
        getProviderByFiscalId(decodedFiscalId),
        getDocumentsByProviderName(decodedFiscalId),
        getProductsByProviderName(decodedFiscalId),
        getProviderAnalytics(decodedFiscalId)
    ]);

    if (!prov) {
        notFound();
        return null;
    }

    return (
        <MainLayout>
            <div className="flex-1 space-y-8 p-4 pt-6 md:p-8">
                <MainLayoutHeader>
                    <div className="flex-1">
                         <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                            <Building className="h-8 w-8 text-primary" />
                            {prov.nombre}
                        </h2>
                        <p className="text-muted-foreground font-mono">
                            {prov.identificador_fiscal}
                        </p>
                    </div>
                </MainLayoutHeader>

                <ProviderDetailClient
                    initialProvider={prov}
                    initialDocuments={docs}
                    initialProducts={prods}
                    initialAnalyticsData={analytics}
                />

            </div>
        </MainLayout>
    );
}
