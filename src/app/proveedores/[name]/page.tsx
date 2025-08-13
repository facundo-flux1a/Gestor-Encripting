
'use client';

import { MainLayout, MainLayoutHeader } from "@/components/layout/main-layout";
import { useParams, notFound } from "next/navigation";
import { useEffect, useState } from "react";
import { Building, FileText, Package } from "lucide-react";
import { getDocumentsByProviderName, getProductsByProviderName } from "@/services/document-service";
import type { Document, DocumentLine } from "@/lib/types";
import { DocumentsTable } from "@/components/dashboard/documents-table";
import { ProductCard } from "@/components/dashboard/product-card";

export default function ProveedorDetailPage() {
    const params = useParams();
    const [providerName, setProviderName] = useState<string | null>(null);
    const [documents, setDocuments] = useState<Document[]>([]);
    const [products, setProducts] = useState<DocumentLine[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const nameParam = params.name;
        if (nameParam) {
            const decodedName = decodeURIComponent(nameParam as string);
            setProviderName(decodedName);

            async function fetchData() {
                setIsLoading(true);
                try {
                    const [docs, prods] = await Promise.all([
                        getDocumentsByProviderName(decodedName),
                        getProductsByProviderName(decodedName)
                    ]);
                    setDocuments(docs);
                    setProducts(prods);
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

    if (isLoading) {
        return (
             <MainLayout>
                <div className="flex flex-1 items-center justify-center">
                    <p>Cargando datos del proveedor...</p>
                </div>
            </MainLayout>
        )
    }

    return (
        <MainLayout>
            <div className="flex-1 space-y-8 p-4 pt-6 md:p-8">
                <MainLayoutHeader>
                    <div className="flex items-center justify-between space-y-2">
                        <div>
                             <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                                <Building className="h-8 w-8 text-primary" />
                                {providerName}
                            </h2>
                            <p className="text-muted-foreground">
                                Resumen de documentos y productos del proveedor.
                            </p>
                        </div>
                    </div>
                </MainLayoutHeader>

                <section>
                    <h3 className="text-2xl font-semibold tracking-tight mb-4 flex items-center gap-2">
                        <Package className="h-6 w-6" />
                        Productos Registrados
                    </h3>
                    {products.length > 0 ? (
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                           {products.map((product) => (
                               <ProductCard key={`${product.id}-${product.descripcion}`} product={product} />
                           ))}
                        </div>
                    ) : (
                        <p className="text-muted-foreground">No se encontraron productos para este proveedor.</p>
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
