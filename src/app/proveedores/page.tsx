
'use server';

import { MainLayout, MainLayoutHeader } from "@/components/layout/main-layout";
import { getProvidersWithStats } from "@/services/document-service";
import { ProvidersTable } from "@/components/dashboard/providers-table";

/**
 * Página para mostrar la lista de todos los proveedores y sus estadísticas.
 * Este es un Server Component, lo que permite la obtención de datos asíncrona
 * directamente en el servidor para un rendimiento óptimo.
 */
export default async function ProveedoresPage() {
  // Se obtienen los datos de los proveedores con sus estadísticas.
  // Esta llamada se ejecuta en el servidor antes de renderizar la página.
  const providers = await getProvidersWithStats();

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
            {/* 
              El componente ProvidersTable recibe los datos ya procesados
              y se encarga de renderizar la tabla interactiva.
            */}
            <ProvidersTable providers={providers} />
        </div>
      </div>
    </MainLayout>
  );
}
