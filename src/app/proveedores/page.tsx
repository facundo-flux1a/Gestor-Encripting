'use client';

import { MainLayout } from "@/components/layout/main-layout";
import { PageHeader } from "@/components/layout/page-header";
import { ProvidersTable } from "@/components/dashboard/providers-table";
import { useCompanyContext } from "@/context/CompanyProvider";
import { useEffect, useState } from "react";
import type { ProviderWithStats } from "@/lib/types";
import { Building2 } from "lucide-react";
import { ProveedoresProvider } from "@/context/ProveedoresProvider";
import { ProveedoresTutorialRouter } from "@/components/proveedores/ProveedoresTutorialRouter";
import { Skeleton } from "@/components/ui/skeleton";

function ProveedoresPageContent() {
    const { selectedCompanyIds } = useCompanyContext();
    const [providers, setProviders] = useState<ProviderWithStats[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const showCompanyColumn = selectedCompanyIds.length > 1;

    // ✅ Función para cargar proveedores
    const fetchProviders = async () => {
        if (!selectedCompanyIds || selectedCompanyIds.length === 0) {
            setProviders([]);
            setIsLoading(false);
            return;
        }

        try {
            setIsLoading(true);
            const response = await fetch('/api/proveedores', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ companyIds: selectedCompanyIds }),
            });

            if (!response.ok) {
                setProviders([]);
                return;
            }

            const data = await response.json();
            setProviders(data.providers || []);
        } catch (error) {
            console.error('Error cargando proveedores:', error);
            setProviders([]);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchProviders();
    }, [selectedCompanyIds]);

    if (isLoading) {
        return (
            <MainLayout>
                <div className="flex-1 space-y-4 p-4 sm:p-6 lg:p-8">
                    <PageHeader
                        title="Proveedores"
                        icon={Building2}
                    />
                    <div className="space-y-4 sm:space-y-6">
                        <Skeleton className="h-[500px] w-full animate-pulse" />
                    </div>
                </div>
            </MainLayout>
        );
    }

    return (
        <MainLayout>
            <div className="flex-1 space-y-4 p-4 sm:p-6 lg:p-8">
                <PageHeader
                    title="Proveedores"
                    icon={Building2}
                    description="Explora todos tus proveedores y sus métricas clave"
                />

                <div
                    className="animate-fade-in transition-all duration-300 hover:scale-[1.005]"
                    style={{ animationDelay: '0ms' }}
                    data-tutorial="proveedores-tabla"
                >
                    <ProvidersTable
                        providers={providers}
                        showCompanyColumn={showCompanyColumn}
                        onProviderUpdated={fetchProviders} // ✅ AGREGAR ESTA LÍNEA
                    />
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
                    
                    .transition-all {
                        transition: none !important;
                    }
                    
                    .hover\\:scale-\\[1\\.005\\]:hover {
                        transform: none !important;
                    }
                }
            `}</style>
        </MainLayout>
    );
}

export default function ProveedoresPage() {
    return (
        <ProveedoresProvider>
            <ProveedoresPageContent />
            <ProveedoresTutorialRouter />
        </ProveedoresProvider>
    );
}