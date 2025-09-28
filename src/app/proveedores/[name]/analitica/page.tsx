
import { MainLayout, MainLayoutHeader } from "@/components/layout/main-layout";
import { notFound } from "next/navigation";
import { Building } from "lucide-react";
import { getProviderByFiscalId, getProviderAnalytics } from "@/services/document-service";
import { ProviderAnalytics } from "@/components/dashboard/provider-analytics";

export default async function ProveedorAnaliticaPage({ params }: { params: { name: string } }) {
    const fiscalId = decodeURIComponent(params.name);
    
    const [provider, analyticsData] = await Promise.all([
        getProviderByFiscalId(fiscalId),
        getProviderAnalytics(fiscalId)
    ]);
    
    if (!provider || !analyticsData) {
        notFound();
    }

    return (
        <MainLayout>
            <div className="flex-1 space-y-8 p-4 pt-6 md:p-8">
                <MainLayoutHeader>
                    <div className="flex-1">
                         <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                            <Building className="h-8 w-8 text-primary" />
                            {provider.nombre}
                        </h2>
                        <p className="text-muted-foreground">
                            Analítica de compras y rendimiento del proveedor.
                        </p>
                    </div>
                </MainLayoutHeader>

                <ProviderAnalytics data={analyticsData} />
            </div>
        </MainLayout>
    );
}

