'use client';
import { MainLayout, MainLayoutHeader } from "@/components/layout/main-layout";
import { getUniqueProviders } from "@/services/document-service";
import { useEffect, useState } from "react";
import type { DocumentEntity } from "@/lib/types";
import { ProviderCard } from "@/components/dashboard/provider-card";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

export default function ProveedoresPage() {
  const [allProviders, setAllProviders] = useState<DocumentEntity[]>([]);
  const [filteredProviders, setFilteredProviders] = useState<DocumentEntity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    getUniqueProviders().then(provs => {
        setAllProviders(provs);
        setFilteredProviders(provs);
        setIsLoading(false);
    });
  }, []);

  useEffect(() => {
    const lowercasedFilter = searchTerm.toLowerCase();
    const filtered = allProviders.filter(provider =>
      provider.nombre?.toLowerCase().includes(lowercasedFilter)
    );
    setFilteredProviders(filtered);
  }, [searchTerm, allProviders]);
  
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
        <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
                placeholder="Buscar proveedor..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-12 pl-10 text-lg"
            />
        </div>
        <div>
            {isLoading ? (
                <p>Cargando proveedores...</p>
            ) : (
              filteredProviders.length > 0 ? (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {filteredProviders.map(provider => (
                        <ProviderCard key={provider.identificador_fiscal} provider={provider} />
                    ))}
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-8">
                    <Search className="mx-auto h-12 w-12 text-gray-400" />
                    <h3 className="mt-2 text-sm font-medium">No se encontraron proveedores</h3>
                    <p className="mt-1 text-sm text-gray-500">
                        Prueba con otro término de búsqueda.
                    </p>
                </div>
              )
            )}
        </div>
      </div>
    </MainLayout>
  );
}
