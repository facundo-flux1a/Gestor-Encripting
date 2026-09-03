import { MainLayout, MainLayoutHeader } from "@/components/layout/main-layout";
import { notFound } from "next/navigation";
import { Building, BarChart3 } from "lucide-react";
import { getProviderByFiscalId, getProviderAnalytics, getCompanies } from "@/services/document-service";
import { ProviderAnalytics } from "@/components/dashboard/provider-analytics";
import { getCurrentUser } from "@/services/user-service";

export default async function ProveedorAnaliticaPage({ 
    params 
}: { 
    params: Promise<{ name: string }> 
}) {
    const resolvedParams = await params;
    const fiscalId = decodeURIComponent(resolvedParams.name);
    
    console.log('🔍 [ProveedorAnaliticaPage] Fiscal ID:', fiscalId);
    
    const user = await getCurrentUser();
    if (!user) {
        console.error('❌ [ProveedorAnaliticaPage] Usuario no autenticado');
        notFound();
    }
    
    console.log('👤 [ProveedorAnaliticaPage] Usuario:', user.id);

    const companies = await getCompanies();
    const empresaIds = companies.map(c => c.id);

    console.log('🏢 [ProveedorAnaliticaPage] Empresas del usuario:', empresaIds);
    console.log('📊 [ProveedorAnaliticaPage] Total de empresas:', companies.length);
    
    const [provider, analyticsData] = await Promise.all([
        getProviderByFiscalId(fiscalId),
        getProviderAnalytics(fiscalId, empresaIds)
    ]);
    
    if (!provider || !analyticsData) {
        console.error('❌ [ProveedorAnaliticaPage] Proveedor o analítica no encontrados');
        notFound();
    }

    console.log('✅ [ProveedorAnaliticaPage] Datos cargados correctamente');
    console.log('   - Proveedor:', provider.nombre);
    console.log('   - Total gastado:', analyticsData.totalSpent.toFixed(2), 'EUR');
    console.log('   - Documentos:', analyticsData.totalDocuments);

    return (
        <MainLayout>
            <div className="flex-1 space-y-8 p-4 pt-6 md:p-8">
                <MainLayoutHeader>
                    <div className="flex-1 min-w-0 opacity-0 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <h2 className="text-lg sm:text-3xl font-bold tracking-tight flex items-center gap-2 group min-w-0">
                            <Building className="h-5 w-5 sm:h-8 sm:w-8 text-primary shrink-0 group-hover:scale-110 transition-transform duration-300" />
                            <span className="bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text truncate">
                                {provider.nombre}
                            </span>
                        </h2>
                        <p className="text-muted-foreground mt-1 flex items-center gap-2 transition-colors duration-200 hover:text-foreground/80">
                            <BarChart3 className="h-4 w-4" />
                            Analítica de compras y rendimiento del proveedor
                        </p>
                    </div>
                </MainLayoutHeader>

                <div className="opacity-0 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-100 transition-all hover:scale-[1.002]">
                    <ProviderAnalytics data={analyticsData} />
                </div>
            </div>
        </MainLayout>
    );
}