'use client'
import { MainLayout, MainLayoutHeader } from "@/components/layout/main-layout";
import { notFound } from "next/navigation";
import { Building, BarChart3 } from "lucide-react";
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
                {/* Header con animación fade-in y hover effects */}
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

                {/* Content con animación fade-in delayed y hover effect */}
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