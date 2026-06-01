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
    const [activeTab, setActiveTab] = useState<'proveedores' | 'clientes'>('proveedores');

    const showCompanyColumn = selectedCompanyIds.length > 1;

    // ✅ Carga proveedores o clientes según el tab activo
    const fetchData = async (tab: 'proveedores' | 'clientes') => {
        if (!selectedCompanyIds || selectedCompanyIds.length === 0) {
            setProviders([]);
            setIsLoading(false);
            return;
        }

        try {
            setIsLoading(true);
            const endpoint = tab === 'clientes' ? '/api/clientes' : '/api/proveedores';
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ companyIds: selectedCompanyIds }),
            });

            if (!response.ok) {
                setProviders([]);
                return;
            }

            const data = await response.json();
            // proveedores => { providers: [] }, clientes => { clients: [] }
            setProviders(data.providers || data.clients || []);
        } catch (error) {
            console.error('Error cargando entidades:', error);
            setProviders([]);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData(activeTab);
    }, [selectedCompanyIds, activeTab]);

    const tabSelector = (
        <div
            data-tutorial="proveedores-tabs"
            style={{
            display: 'inline-flex',
            background: 'rgba(255,255,255,0.06)',
            borderRadius: '9999px',
            padding: '4px',
            gap: '2px',
        }}>
            {(['proveedores', 'clientes'] as const).map((tab) => (
                <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    style={{
                        padding: '6px 20px',
                        borderRadius: '9999px',
                        border: 'none',
                        cursor: 'pointer',
                        fontWeight: 600,
                        fontSize: '13px',
                        letterSpacing: '0.03em',
                        textTransform: 'uppercase',
                        transition: 'all 0.2s ease',
                        background: activeTab === tab
                            ? 'hsl(var(--primary))'
                            : 'transparent',
                        color: activeTab === tab
                            ? 'hsl(var(--primary-foreground))'
                            : 'hsl(var(--muted-foreground))',
                    }}
                >
                    {tab === 'proveedores' ? 'Proveedores' : 'Clientes'}
                </button>
            ))}
        </div>
    );

    if (isLoading) {
        return (
            <MainLayout>
                <div className="flex-1 space-y-4 p-4 sm:p-6 lg:p-8">
                    <div className="flex items-center justify-between flex-wrap gap-3">
                        <PageHeader
                            title="Entidades"
                            icon={Building2}
                        />
                        {tabSelector}
                    </div>
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
                <div className="flex items-center justify-between flex-wrap gap-3">
                    <PageHeader
                        title="Entidades"
                        icon={Building2}
                        description={
                            activeTab === 'proveedores'
                                ? 'Explora todos tus proveedores y sus métricas clave'
                                : 'Explora todos tus clientes y sus métricas clave'
                        }
                    />
                    {tabSelector}
                </div>

                <div
                    className="animate-fade-in transition-all duration-300 hover:scale-[1.005]"
                    style={{ animationDelay: '0ms' }}
                    data-tutorial="proveedores-tabla"
                >
                    <ProvidersTable
                        providers={providers}
                        showCompanyColumn={showCompanyColumn}
                        onProviderUpdated={() => fetchData(activeTab)}
                        companyId={selectedCompanyIds?.length === 1 ? selectedCompanyIds[0] : undefined}
                    />
                </div>
            </div>

            <style jsx global>{`
                @keyframes fade-in {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .animate-fade-in {
                    animation: fade-in 0.5s ease-out forwards;
                    opacity: 0;
                }
                @media (prefers-reduced-motion: reduce) {
                    .animate-fade-in { animation: none; opacity: 1; transform: none; }
                    .transition-all { transition: none !important; }
                    .hover\\:scale-\\[1\\.005\\]:hover { transform: none !important; }
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