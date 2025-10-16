'use client';

import { MainLayout, MainLayoutHeader } from "@/components/layout/main-layout";
import { ProvidersTable } from "@/components/dashboard/providers-table";
import { useCompanyContext } from "@/context/CompanyProvider";
import { useEffect, useState } from "react";
import type { ProviderWithStats } from "@/lib/types";

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

  return (
    <MainLayout>
      <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
        <MainLayoutHeader>
          <div className="flex-1">
            <h2 className="text-3xl font-bold tracking-tight">Proveedores</h2>
            <p className="text-muted-foreground">
              Explora todos tus proveedores y sus métricas clave.
            </p>
          </div>
        </MainLayoutHeader>

        <div className="mt-6">
          {isLoading ? (
            <p>Cargando proveedores...</p>
          ) : (
            <ProvidersTable 
              providers={providers} 
              showCompanyColumn={showCompanyColumn}
            />
          )}
        </div>
      </div>
    </MainLayout>
  );
}