
'use client';

import { MainLayout, MainLayoutHeader } from "@/components/layout/main-layout";
import { useParams, notFound } from "next/navigation";
import { useEffect, useState, KeyboardEvent } from "react";
import { Building, FileText, Package, Search, BarChart3, Loader2, X } from "lucide-react";
import { getDocumentsByProviderName, getProductsByProviderName, getProviderByFiscalId, getProviderAnalytics } from "@/services/document-service";
import type { Document, DocumentLine, DocumentEntity } from "@/lib/types";
import { DocumentsTable } from "@/components/dashboard/documents-table";
import { ProductCard } from "@/components/dashboard/product-card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProviderAnalytics, type ProviderAnalyticsData } from "@/components/dashboard/provider-analytics";
import { ExportButton } from "@/components/dashboard/export-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function ProveedorDetailPage() {
    const params = useParams();
    const [provider, setProvider] = useState<DocumentEntity | null>(null);
    const [documents, setDocuments] = useState<Document[]>([]);
    const [allProducts, setAllProducts] = useState<DocumentLine[]>([]);
    const [filteredProducts, setFilteredProducts] = useState<DocumentLine[]>([]);
    const [analyticsData, setAnalyticsData] = useState<ProviderAnalyticsData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    
    const [currentSearch, setCurrentSearch] = useState('');

    const fiscalId = params.name as string;

    useEffect(() => {
        if (fiscalId) {
            const decodedFiscalId = decodeURIComponent(fiscalId);
            
            async function fetchData() {
                setIsLoading(true);
                try {
                    const [prov, docs, prods, analytics] = await Promise.all([
                        getProviderByFiscalId(decodedFiscalId),
                        getDocumentsByProviderName(decodedFiscalId),
                        getProductsByProviderName(decodedFiscalId),
                        getProviderAnalytics(decodedFiscalId)
                    ]);
                    
                    if (!prov) {
                        notFound();
                        return;
                    }

                    setProvider(prov);
                    setDocuments(docs);
                    setAllProducts(prods);
                    setFilteredProducts(prods);
                    setAnalyticsData(analytics);

                } catch (error) {
                    console.error("Failed to fetch provider data", error);
                } finally {
                    setIsLoading(false);
                }
            }
            fetchData();
        } else {
            notFound();
        }
    }, [fiscalId]);
    
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


    if (isLoading) {
        return (
             <MainLayout>
                <div className="flex flex-1 items-center justify-center">
                    <Loader2 className="h-10 w-10 animate-spin text-primary" />
                </div>
            </MainLayout>
        )
    }

    if (!provider) {
        return notFound();
    }

    return (
        <MainLayout>
            <div className="flex-1 space-y-8 p-4 pt-6 md:p-8">
                <MainLayoutHeader>
                    <div className="flex-1">
                         <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                            <Building className="h-8 w-8 text-primary" />
                            {provider.nombre}
                        </h2>
                        <p className="text-muted-foreground font-mono">
                            {provider.identificador_fiscal}
                        </p>
                    </div>
                </MainLayoutHeader>

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
            </div>
        </MainLayout>
    );
}
