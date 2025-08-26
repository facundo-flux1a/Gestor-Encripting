
import { MainLayout, MainLayoutHeader } from "@/components/layout/main-layout";
import { getProvidersWithStats } from "@/services/document-service";
import { ProvidersTable } from "@/components/dashboard/providers-table";

export default async function ProveedoresPage() {
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
            <ProvidersTable providers={providers} />
        </div>
      </div>
    </MainLayout>
  );
}
