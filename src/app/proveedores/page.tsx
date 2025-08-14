
'use client';
import { MainLayout, MainLayoutHeader } from "@/components/layout/main-layout";
import { getProvidersWithStats } from "@/services/document-service";
import { useEffect, useState, KeyboardEvent } from "react";
import type { ProviderWithStats } from "@/lib/types";
import { ProviderCard } from "@/components/dashboard/provider-card";
import { Input } from "@/components/ui/input";
import { Search, X, Loader2 } from "lucide-react";
import { ExportButton } from "@/components/dashboard/export-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function ProveedoresPage() {
  const [allProviders, setAllProviders] = useState<ProviderWithStats[]>([]);
  const [filteredProviders, setFilteredProviders] = useState<ProviderWithStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [filters, setFilters] = useState<string[]>([]);
  const [currentSearch, setCurrentSearch] = useState('');

  useEffect(() => {
    getProvidersWithStats().then(provs => {
        setAllProviders(provs);
        setFilteredProviders(provs);
        setIsLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!allProviders) return;
    
    if (filters.length === 0) {
      setFilteredProviders(allProviders);
      return;
    }
    
    const filtered = allProviders.filter(provider => {
        return filters.every(filter => {
            const lowercasedFilter = filter.toLowerCase();
            return (
                provider.nombre?.toLowerCase().includes(lowercasedFilter) ||
                provider.identificador_fiscal?.toLowerCase().includes(lowercasedFilter)
            );
        });
    });
    setFilteredProviders(filtered);
  }, [filters, allProviders]);

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && currentSearch.trim() !== '') {
      setFilters([...filters, currentSearch.trim()]);
      setCurrentSearch('');
    }
  };

  const removeFilter = (filterToRemove: string) => {
    setFilters(filters.filter(f => f !== filterToRemove));
  };
  
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
             <div className="flex items-center space-x-2">
                <ExportButton data={filteredProviders} filename="proveedores" />
            </div>
        </MainLayoutHeader>
        <div className="space-y-4">
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                    placeholder="Buscar por nombre o CIF y presionar Enter..."
                    value={currentSearch}
                    onChange={(e) => setCurrentSearch(e.target.value)}
                    onKeyDown={handleSearchKeyDown}
                    className="h-12 pl-10 text-lg"
                />
            </div>

            {filters.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">Filtros aplicados:</span>
                    {filters.map((filter) => (
                        <Badge key={filter} variant="secondary" className="pl-2">
                            {filter}
                            <Button
                                variant="ghost"
                                size="icon"
                                className="ml-1 h-5 w-5 p-0"
                                onClick={() => removeFilter(filter)}
                            >
                                <X className="h-3 w-3" />
                                <span className="sr-only">Remover filtro</span>
                            </Button>
                        </Badge>
                    ))}
                </div>
            )}
        </div>
        
        <div>
            {isLoading ? (
                <div className="flex justify-center items-center py-16">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
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
                        {filters.length > 0 ? "Prueba con otro término o limpia los filtros." : "No hay proveedores para mostrar."}
                    </p>
                </div>
              )
            )}
        </div>
      </div>
    </MainLayout>
  );
}
