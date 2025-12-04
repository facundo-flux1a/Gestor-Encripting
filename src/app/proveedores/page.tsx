'use client';

import { MainLayout, MainLayoutHeader } from "@/components/layout/main-layout";
import { ProvidersTable } from "@/components/dashboard/providers-table";
import { useCompanyContext } from "@/context/CompanyProvider";
import { useEffect, useState } from "react";
import type { ProviderWithStats } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2 } from "lucide-react";

export default function ProveedoresPage() {
  const { selectedCompanyIds } = useCompanyContext();
  const [providers, setProviders] = useState<ProviderWithStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Determinar si mostrar la columna de empresa
  const showCompanyColumn = selectedCompanyIds.length > 1;

  useEffect(() => {
    async function loadProviders() {
      if (!selectedCompanyIds || selectedCompanyIds.length === 0) {
        setProviders([]);
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        const res = await fetch('/api/proveedores', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ companyIds: selectedCompanyIds }),
        });

        if (!res.ok) {
          setProviders([]);
          return;
        }

        const data = await res.json();
        setProviders(data.providers || []);
      } catch (error) {
        console.error("Error cargando proveedores:", error);
        setProviders([]);
      } finally {
        setIsLoading(false);
      }
    }

    loadProviders();
  }, [selectedCompanyIds]);

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex-1 space-y-4 p-4 sm:p-6 lg:p-8">
          <MainLayoutHeader>
            <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
              <Building2 className="h-6 w-6 sm:h-7 sm:w-7 text-violet-500 shrink-0" />
              <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight truncate bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
                Proveedores
              </h2>
            </div>
          </MainLayoutHeader>
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
        <MainLayoutHeader>
          <div className="flex items-start sm:items-center justify-between w-full gap-2 flex-col sm:flex-row">
            <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
              <div className="p-2 bg-blue-500/10 rounded-xl shrink-0 animate-fade-in">
                <Building2 className="h-5 w-5 sm:h-6 sm:w-6 text-violet-500" />
              </div>
              <div className="flex-1 space-y-1 min-w-0">
                <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight truncate bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
                  Proveedores
                </h2>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Explora todos tus proveedores y sus métricas clave
                </p>
              </div>
            </div>
          </div>
        </MainLayoutHeader>

        <div className="animate-fade-in transition-all duration-300 hover:scale-[1.005]" style={{ animationDelay: '0ms' }}>
          <ProvidersTable 
            providers={providers} 
            showCompanyColumn={showCompanyColumn}
          />
        </div>
      </div>

      {/* Estilos de animación */}
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
          
          .hover\:scale-\[1\.005\]:hover {
            transform: none !important;
          }
        }
      `}</style>
    </MainLayout>
  );
}