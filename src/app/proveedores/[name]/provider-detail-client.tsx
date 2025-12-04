'use client';

import { useState, useEffect } from "react";
import { FileText, Package, Search, BarChart3, Loader2 } from "lucide-react";
import type { Document, DocumentLine, DocumentEntity } from "@/lib/types";
import { DocumentsTable } from "@/components/dashboard/documents-table";
import { ProductCard } from "@/components/dashboard/product-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import type { ProviderAnalyticsData } from "@/components/dashboard/provider-analytics";
import { ProviderAnalytics } from "@/components/dashboard/provider-analytics";

interface ProviderDetailClientProps {
    initialProvider: DocumentEntity;
    initialDocuments: Document[];
    initialProducts: DocumentLine[];
    initialAnalyticsData: ProviderAnalyticsData;
}

export function ProviderDetailClient({
    initialProvider,
    initialDocuments,
    initialProducts,
    initialAnalyticsData
}: ProviderDetailClientProps) {
    const [searchTerm, setSearchTerm] = useState("");
    const [filteredProducts, setFilteredProducts] = useState(initialProducts);

    useEffect(() => {
        if (searchTerm.trim() === "") {
            setFilteredProducts(initialProducts);
        } else {
            const lowerSearch = searchTerm.toLowerCase();
            setFilteredProducts(
                initialProducts.filter(
                    (p) =>
                        p.descripcion?.toLowerCase().includes(lowerSearch) ||
                        p.codigo?.toLowerCase().includes(lowerSearch)
                )
            );
        }
    }, [searchTerm, initialProducts]);

    return (
        <Tabs defaultValue="summary" className="space-y-6">
            {/* Tabs con animaciones y hover effects */}
            <TabsList className="grid w-full grid-cols-3 gap-2">
                <TabsTrigger 
                    value="summary" 
                    className="group data-[state=active]:scale-105 transition-all duration-200 hover:bg-accent/50"
                >
                    <FileText className="h-4 w-4 mr-2 group-hover:scale-110 transition-transform duration-200" />
                    Resumen
                </TabsTrigger>
                <TabsTrigger 
                    value="documents"
                    className="group data-[state=active]:scale-105 transition-all duration-200 hover:bg-accent/50"
                >
                    <FileText className="h-4 w-4 mr-2 group-hover:scale-110 transition-transform duration-200" />
                    Documentos
                </TabsTrigger>
                <TabsTrigger 
                    value="products"
                    className="group data-[state=active]:scale-105 transition-all duration-200 hover:bg-accent/50"
                >
                    <Package className="h-4 w-4 mr-2 group-hover:scale-110 transition-transform duration-200" />
                    Productos
                </TabsTrigger>
            </TabsList>

            {/* Tab Content: Summary con animación fade-in */}
            <TabsContent 
                value="summary" 
                className="space-y-6 animate-fade-in"
                style={{ animationDelay: '0ms' }}
            >
                <div className="transition-all duration-300 hover:scale-[1.005]">
                    <ProviderAnalytics data={initialAnalyticsData} />
                </div>
            </TabsContent>

            {/* Tab Content: Documents con animación fade-in */}
            <TabsContent 
                value="documents" 
                className="space-y-6 animate-fade-in"
                style={{ animationDelay: '50ms' }}
            >
                <div className="transition-all duration-300 hover:scale-[1.005]">
                    <DocumentsTable documents={initialDocuments} />
                </div>
            </TabsContent>

            {/* Tab Content: Products con animación fade-in */}
            <TabsContent 
                value="products" 
                className="space-y-6 animate-fade-in"
                style={{ animationDelay: '100ms' }}
            >
                {/* Search Input con focus ring animado */}
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground transition-transform duration-200 group-focus-within:scale-110" />
                    <Input
                        placeholder="Buscar productos por código o descripción..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10 focus:ring-2 focus:ring-primary/20 transition-all duration-200"
                    />
                </div>

                {/* Products Grid con animaciones staggered y hover */}
                {filteredProducts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground animate-fade-in">
                        <Package className="h-16 w-16 mb-4 text-muted-foreground/50 hover:scale-110 transition-transform duration-300" />
                        <p className="text-lg font-medium">
                            {searchTerm ? "No se encontraron productos" : "No hay productos disponibles"}
                        </p>
                    </div>
                ) : (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {filteredProducts.map((product, index) => (
                            <div
                                key={product.id}
                                className="animate-fade-in hover:scale-[1.02] transition-all duration-300"
                                style={{ 
                                    animationDelay: `${index * 30}ms`,
                                    opacity: 0,
                                    animation: 'fade-in-up 0.4s ease-out forwards'
                                }}
                            >
                                <ProductCard
                                    product={product}
                                    providerFiscalId={initialProvider.identificador_fiscal}
                                />
                            </div>
                        ))}
                    </div>
                )}
            </TabsContent>

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

                @keyframes fade-in-up {
                    from {
                        opacity: 0;
                        transform: translateY(20px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }

                .animate-fade-in {
                    animation: fade-in 0.5s ease-out forwards;
                }

                @media (prefers-reduced-motion: reduce) {
                    .animate-fade-in,
                    [style*="animation"] {
                        animation: none !important;
                        opacity: 1 !important;
                        transform: none !important;
                    }
                }
            `}</style>
        </Tabs>
    );
}