'use client';
import { MainLayout, MainLayoutHeader } from "@/components/layout/main-layout";
import { getUniqueProviders } from "@/services/document-service";
import { useEffect, useState } from "react";
import type { DocumentEntity } from "@/lib/types";
import { ProviderCard } from "@/components/dashboard/provider-card";

export default function ProveedoresPage() {
  const [providers, setProviders] = useState<DocumentEntity[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getUniqueProviders().then(provs => {
        setProviders(provs);
        setIsLoading(false);
    });
  }, []);
  
  return (
    <MainLayout>
      <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
        <MainLayoutHeader>
            <div className="flex items-center justify-between space-y-2">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Proveedores</h2>
                    <p className="text-muted-foreground">
                        Explora todos tus proveedores y sus productos.
                    </p>
                </div>
            </div>
        </MainLayoutHeader>
        <div>
            {isLoading ? (
                <p>Cargando proveedores...</p>
            ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {providers.map(provider => (
                        <ProviderCard key={provider.id} provider={provider} />
                    ))}
                </div>
            )}
        </div>
      </div>
    </MainLayout>
  );
}
