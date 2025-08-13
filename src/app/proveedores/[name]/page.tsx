
'use client';

import { MainLayout, MainLayoutHeader } from "@/components/layout/main-layout";
import { useParams, notFound } from "next/navigation";
import { useEffect, useState } from "react";
import { Building, FileText, Package, Search } from "lucide-react";
import { getDocumentsByProviderName, getProductsByProviderName, getProviderByFiscalId } from "@/services/document-service";
import type { Document, DocumentLine, DocumentEntity } from "@/lib/types";
import { DocumentsTable } from "@/components/dashboard/documents-table";
import { ProductCard } from "@/components/dashboard/product-card";
import { Input } from "@/components/ui/input";

export default function ProveedorDetailPage() {
    const params = useParams(); // Correct way to get params in a client component
    const [provider, setProvider] = useState<DocumentEntity | null>(null);
    const [documents, setDocuments] = useState<Document[]>([]);
    const [allProducts, setAllProducts] = useState<DocumentLine[]>([]);
    const [filteredProducts, setFilteredProducts] = useState<DocumentLine[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        const fiscalIdParam = params.name; // This is now the fiscal_id
        if (fiscalIdParam) {
            const decodedFiscalId = decodeURIComponent(fiscalIdParam as string);
            
            async function fetchData() {
                setIsLoading(true);
                try {
                    const [prov, docs, prods] = await Promise.all([
                        getProviderByFiscalId(decodedFiscalId),
                        getDocumentsByProviderName(decodedFiscalId),
                        getProductsByProviderName(decodedFiscalId)
                    ]);
                    
                    if (!prov) {
                        notFound();
                        return;
                    }

                    setProvider(prov);
                    setDocuments(docs);
                    setAllProducts(prods);
                    setFilteredProducts(prods);

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
    }, [params.name]);
    
    useEffect(() => {
        const lowercasedFilter = searchTerm.toLowerCase();
        const filtered = allProducts.filter(product =>
          product.descripcion?.toLowerCase().includes(lowercasedFilter) ||
          product.codigo?.toLowerCase().includes(lowercasedFilter)
        );
        setFilteredProducts(filtered);
    }, [searchTerm, allProducts]);


    if (isLoading) {
        return (
             <MainLayout>
                <div className="flex flex-1 items-center justify-center">
                    <p>Cargando datos del proveedor...</p>
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
                    <div className="flex items-center justify-between space-y-2">
                        <div>
                             <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                                <Building className="h-8 w-8 text-primary" />
                                {provider.nombre}
                            </h2>
                            <p className="text-muted-foreground">
                                Resumen de documentos y productos del proveedor.
                            </p>
                        </div>
                    </div>
                </MainLayoutHeader>

                <section>
                     <div className="flex justify-between items-center mb-4">
                        <h3 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
                            <Package className="h-6 w-6" />
                            Productos Registrados
                        </h3>
                        <div className="relative w-full max-w-sm">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                            <Input
                                placeholder="Buscar producto..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="h-11 pl-10"
                            />
                        </div>
                    </div>
                    {filteredProducts.length > 0 ? (
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                           {filteredProducts.map((product) => (
                               <ProductCard 
                                    key={`${product.codigo}-${product.id}`} 
                                    product={product} 
                                    providerId={provider?.identificador_fiscal!} 
                                />
                           ))}
                        </div>
                    ) : (
                        <p className="text-center text-muted-foreground py-8">
                            {searchTerm ? "No se encontraron productos con ese criterio." : "No se encontraron productos para este proveedor."}
                        </p>
                    )}
                </section>

                <section>
                    <h3 className="text-2xl font-semibold tracking-tight mb-4 flex items-center gap-2">
                        <FileText className="h-6 w-6" />
                        Documentos Registrados
                    </h3>
                    <DocumentsTable documents={documents} />
                </section>
            </div>
        </MainLayout>
    );
}
