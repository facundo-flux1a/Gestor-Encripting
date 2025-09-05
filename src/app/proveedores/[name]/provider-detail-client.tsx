
'use client';

import { useState, useEffect } from "react";
import { FileText, Package, Search, BarChart3, Loader2 } from "lucide-react";
import type { Document, DocumentLine, DocumentEntity } from "@/lib/types";
import { DocumentsTable } from "@/components/dashboard/documents-table";
import { ProductCard } from "@/components/dashboard/product-card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProviderAnalytics, type ProviderAnalyticsData } from "@/components/dashboard/provider-analytics";

interface ProviderDetailClientProps {
    initialProvider: DocumentEntity;
    initialDocuments: Document[];
    initialProducts: DocumentLine[];
    initialAnalyticsData: ProviderAnalyticsData | null;
}

export function ProviderDetailClient({
    initialProvider,
    initialDocuments,
    initialProducts,
    initialAnalyticsData,
}: ProviderDetailClientProps) {

    const [provider, setProvider] = useState(initialProvider);
    const [documents, setDocuments] = useState(initialDocuments);
    const [allProducts, setAllProducts] = useState(initialProducts);
    const [filteredProducts, setFilteredProducts] = useState(initialProducts);
    const [analyticsData, setAnalyticsData] = useState(initialAnalyticsData);
    
    const [currentSearch, setCurrentSearch] = useState('');

    useEffect(() => {
        if (currentSearch.trim() === '') {
            setFilteredProducts(allProducts);
            return;
        }

        const filtered = allProducts.filter(product => {
            const lowercasedFilter = currentSearch.toLowerCase();
            return (
                product.descripcion?.toLowerCase().includes(lowercasedFilter) ||
                product.codigo?.toLowerCase().includes(lowercasedFilter)
            );
        });
        setFilteredProducts(filtered);
    }, [currentSearch, allProducts]);


    return (
        <Tabs defaultValue="analytics" className="space-y-6">
            <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="analytics"><BarChart3 className="mr-2"/>Analítica</TabsTrigger>
                <TabsTrigger value="products"><Package className="mr-2"/>Productos ({filteredProducts.length})</TabsTrigger>
                <TabsTrigger value="documents"><FileText className="mr-2"/>Documentos ({documents.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="analytics">
                {analyticsData ? (
                    <ProviderAnalytics data={analyticsData} />
                ) : (
                   <div className="flex justify-center items-center py-16">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                )}
            </TabsContent>

            <TabsContent value="products">
                 <div className="space-y-4">
                    <div className="flex justify-between items-center">
                        <div className="relative w-full max-w-sm">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                            <Input
                                placeholder="Buscar producto..."
                                value={currentSearch}
                                onChange={(e) => setCurrentSearch(e.target.value)}
                                className="h-11 pl-10"
                            />
                        </div>
                    </div>
                </div>

                {filteredProducts.length > 0 ? (
                    <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                       {filteredProducts.map((product) => (
                           <ProductCard 
                                key={`${product.codigo}-${product.id}`} 
                                product={product} 
                                providerId={provider?.identificador_fiscal!} 
                            />
                       ))}
                    </div>
                ) : (
                    <div className="text-center text-muted-foreground py-8">
                        <Search className="mx-auto h-12 w-12 text-gray-400" />
                        <h3 className="mt-2 text-sm font-medium">
                            {currentSearch ? "No se encontraron productos" : "No hay productos registrados"}
                        </h3>
                        <p className="mt-1 text-sm text-gray-500">
                            {currentSearch ? "Prueba a buscar con otro término." : "Este proveedor aún no tiene productos asociados."}
                        </p>
                    </div>
                )}
            </TabsContent>
            
            <TabsContent value="documents">
                <div className="space-y-4">
                    <DocumentsTable documents={documents} filename={`documentos_${provider.identificador_fiscal}`} />
                </div>
            </TabsContent>
        </Tabs>
    );
}

