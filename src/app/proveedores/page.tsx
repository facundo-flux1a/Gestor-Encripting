'use client';
import { MainLayout, MainLayoutHeader } from "@/components/layout/main-layout";
import { getProvidersWithStats } from "@/services/document-service";
import { useEffect, useState } from "react";
import type { ProviderWithStats } from "@/lib/types";
import { Loader2 } from "lucide-react";
import { ProvidersTable } from "@/components/dashboard/providers-table";

export default function ProveedoresPage() {
  const [providers, setProviders] = useState<ProviderWithStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getProvidersWithStats().then(provs => {
        setProviders(provs);
        setIsLoading(false);
    });
  }, []);

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
                <div className="flex justify-center items-center py-16">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            ) : (
                <ProvidersTable providers={providers} />
            )}
        </div>
      </div>
    </MainLayout>
  );
}
