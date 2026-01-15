import { MainLayout, MainLayoutHeader } from "@/components/layout/main-layout";
import { notFound } from "next/navigation";
import { Building, BarChart3 } from "lucide-react";
import { getProviderByFiscalId, getProviderAnalytics, getCompanies } from "@/services/document-service";
import { ProviderAnalytics } from "@/components/dashboard/provider-analytics";
import { getCurrentUser } from "@/services/user-service";

// ✅ CRÍTICO: En Next.js 15, params es una Promise
export default async function ProveedorAnaliticaPage({ 
    params 
}: { 
    params: Promise<{ name: string }> 
}) {
    // ✅ PASO 1: Await params (obligatorio en Next.js 15)
    const resolvedParams = await params;
    const fiscalId = decodeURIComponent(resolvedParams.name);
    
    console.log('🔍 [ProveedorAnaliticaPage] Fiscal ID:', fiscalId);
    
    // ✅ PASO 2: Obtener usuario actual
    const user = await getCurrentUser();
    if (!user) {
        console.error('❌ [ProveedorAnaliticaPage] Usuario no autenticado');
        notFound();
    }
    
    console.log('👤 [ProveedorAnaliticaPage] Usuario:', user.id);

    // ✅ PASO 3: Obtener empresas del usuario
    const companies = await getCompanies();
    const empresaIds = companies.map(c => c.id);

    console.log('🏢 [ProveedorAnaliticaPage] Empresas del usuario:', empresaIds);
    console.log('📊 [ProveedorAnaliticaPage] Total de empresas:', companies.length);
    
    // ✅ PASO 4: Obtener datos del proveedor Y analítica (con empresaIds)
    const [provider, analyticsData] = await Promise.all([
        getProviderByFiscalId(fiscalId),
        getProviderAnalytics(fiscalId, empresaIds)  // ✅ PASANDO empresaIds
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
                    <div className="flex-1 animate-fade-in" style={{ animationDelay: '0ms' }}>
                        <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2 group">
                            <Building className="h-8 w-8 text-primary group-hover:scale-110 transition-transform duration-300" />
                            <span className="bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
                                {provider.nombre}
                            </span>
                        </h2>
                        <p className="text-muted-foreground mt-1 flex items-center gap-2 transition-colors duration-200 hover:text-foreground/80">
                            <BarChart3 className="h-4 w-4" />
                            Analítica de compras y rendimiento del proveedor
                        </p>
                    </div>
                </MainLayoutHeader>

                <div 
                    className="animate-fade-in transition-all duration-300 hover:scale-[1.002]" 
                    style={{ animationDelay: '100ms' }}
                >
                    <ProviderAnalytics data={analyticsData} />
                </div>
            </div>

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
                }
            `}</style>
        </MainLayout>
    );
}