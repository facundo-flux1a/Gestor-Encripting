'use client';

import { useState, useEffect, useMemo } from "react";
import { FileText, Package, Loader2, List, Grid } from "lucide-react";
import type { Document, DocumentLine, DocumentEntity } from "@/lib/types";
import { DocumentsTable } from "@/components/dashboard/documents-table";
import { ProductCard } from "@/components/dashboard/product-card";
import { ProductLinesTable } from "@/components/dashboard/product-lines-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ProviderAnalyticsData } from "@/components/dashboard/provider-analytics";
import { ProviderAnalytics } from "@/components/dashboard/provider-analytics";
import { useCompanyContext } from "@/context/CompanyProvider";
import {
    getDocumentsByProviderName,
    getProductsByProviderName,
    getProviderAnalytics,
    getAllProductLinesByProviderName
} from "@/services/document-service";
import { ProviderFilterBar, type ProviderFilterState } from "@/components/proveedores/provider-filter-bar";

interface ProviderDetailClientProps {
    initialProvider: DocumentEntity;
    initialDocuments: Document[];
    initialProducts: DocumentLine[];
    initialAllProducts: DocumentLine[];
    initialAnalyticsData: ProviderAnalyticsData;
}

export function ProviderDetailClient({
    initialProvider,
    initialDocuments,
    initialProducts,
    initialAllProducts,
    initialAnalyticsData
}: ProviderDetailClientProps) {
    const { selectedCompanyIds, companies } = useCompanyContext();

    const [documents, setDocuments] = useState(initialDocuments);
    const [products, setProducts] = useState(initialProducts);
    const [allProducts, setAllProducts] = useState(initialAllProducts);
    const [analyticsData, setAnalyticsData] = useState(initialAnalyticsData);
    const [isLoadingData, setIsLoadingData] = useState(false);

    const [filters, setFilters] = useState<ProviderFilterState>({
        searchText: '',
        fechaDesde: '',
        fechaHasta: '',
        precioMin: '',
        precioMax: '',
        trimestre: 'all',
        anio: 'all',
        tipoPrecio: 'unitario' // ✅ Valor inicial
    });

    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

    useEffect(() => {
        async function reloadData() {
            if (companies.length === 0) return;
            setIsLoadingData(true);
            try {
                const empresaIds = selectedCompanyIds.length > 0 ? selectedCompanyIds : companies.map(c => c.id);
                const fiscalId = initialProvider.identificador_fiscal || '';
                const [newDocs, newProds, newAnalytics, newAllProds] = await Promise.all([
                    getDocumentsByProviderName(fiscalId, empresaIds),
                    getProductsByProviderName(fiscalId, empresaIds),
                    getProviderAnalytics(fiscalId, empresaIds),
                    getAllProductLinesByProviderName(fiscalId, empresaIds)
                ]);
                setDocuments(newDocs);
                setProducts(newProds);
                setAllProducts(newAllProds);
                setAnalyticsData(newAnalytics);
            } catch (error) {
                console.error('❌ Error recargando datos:', error);
            } finally {
                setIsLoadingData(false);
            }
        }
        reloadData();
    }, [selectedCompanyIds, companies, initialProvider.identificador_fiscal]);

    // ✅ REEMPLAZAMOS useEffect POR useMemo PARA EL FILTRADO
    const { filteredProducts, filteredAllProducts } = useMemo(() => {
        let resProducts = [...products];
        let resAllProducts = [...allProducts];

        // 1. Busqueda Texto
        if (filters.searchText.trim() !== "") {
            const low = filters.searchText.toLowerCase();
            const textFilter = (p: DocumentLine) =>
                p.descripcion?.toLowerCase().includes(low) ||
                p.codigo?.toLowerCase().includes(low);
            resProducts = resProducts.filter(textFilter);
            resAllProducts = resAllProducts.filter(textFilter);
        }

        // 2. Fechas / Trimestre / Año
        const dateFilter = (p: DocumentLine) => {
            if (!p.fecha_emision) return true;
            const d = new Date(p.fecha_emision);
            const m = d.getMonth() + 1;
            const y = d.getFullYear().toString();
            let pass = true;

            if (filters.fechaDesde) pass = pass && d >= new Date(filters.fechaDesde);
            if (filters.fechaHasta) pass = pass && d <= new Date(filters.fechaHasta);
            if (filters.trimestre && filters.trimestre !== 'all') {
                const t = Number(filters.trimestre);
                pass = pass && (m >= (t - 1) * 3 + 1 && m <= t * 3);
            }
            if (filters.anio && filters.anio !== 'all') pass = pass && y === filters.anio;

            return pass;
        };
        resProducts = resProducts.filter(dateFilter);
        resAllProducts = resAllProducts.filter(dateFilter);

        // 3. Precios (Dinámico: Unitario o Total)
        if (filters.precioMin || filters.precioMax) {
            const min = filters.precioMin ? parseFloat(filters.precioMin) : -Infinity;
            const max = filters.precioMax ? parseFloat(filters.precioMax) : Infinity;

            const priceFilter = (p: DocumentLine) => {
                const val = filters.tipoPrecio === 'total'
                    ? Number(p.importe_linea)
                    : Number(p.precio_unitario);
                return val >= min && val <= max;
            };
            resProducts = resProducts.filter(priceFilter);
            resAllProducts = resAllProducts.filter(priceFilter);
        }

        // 4. Orden
        const sortFn = (a: DocumentLine, b: DocumentLine) => (b.fecha_emision || '').localeCompare(a.fecha_emision || '');
        resProducts.sort(sortFn);
        resAllProducts.sort(sortFn);

        return { filteredProducts: resProducts, filteredAllProducts: resAllProducts };
    }, [filters, products, allProducts]);

    return (
        <>
            {isLoadingData && (
                <div className="fixed inset-0 z-[9999] bg-background/80 backdrop-blur-sm flex items-center justify-center">
                    <div className="flex flex-col items-center gap-3 bg-card p-6 rounded-xl border-2 shadow-2xl">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        <p className="text-sm font-medium">Actualizando datos...</p>
                    </div>
                </div>
            )}

            <Tabs defaultValue="summary" className="space-y-6">
                <TabsList className="grid w-full grid-cols-3 gap-2">
                    <TabsTrigger value="summary">Resumen</TabsTrigger>
                    <TabsTrigger value="documents" disabled={isLoadingData}>Documentos ({documents.length})</TabsTrigger>
                    <TabsTrigger value="products" disabled={isLoadingData}>Productos ({products.length})</TabsTrigger>
                </TabsList>

                <TabsContent value="summary" className="space-y-6 animate-fade-in">
                    <ProviderAnalytics data={analyticsData} />
                </TabsContent>

                <TabsContent value="documents" className="space-y-6 animate-fade-in">
                    <DocumentsTable documents={documents} />
                </TabsContent>

                <TabsContent value="products" className="space-y-6 animate-fade-in">
                    <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4 border-b pb-4 border-border/50">
                        <div className="w-full xl:flex-1 relative z-20">
                            <ProviderFilterBar filters={filters} onFiltersChange={setFilters} />
                        </div>
                        <div className="flex border rounded-md overflow-hidden bg-background">
                            <button
                                onClick={() => setViewMode('grid')}
                                className={`px-4 py-2 text-sm font-medium transition-colors ${viewMode === 'grid' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                            >
                                Gráfico
                            </button>
                            <button
                                onClick={() => setViewMode('list')}
                                className={`px-4 py-2 text-sm font-medium transition-colors border-l ${viewMode === 'list' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                            >
                                Tabla
                            </button>
                        </div>
                    </div>

                    {viewMode === 'grid' ? (
                        filteredProducts.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                                <Package className="h-16 w-16 mb-4 text-muted-foreground/50" />
                                <p className="text-lg font-medium">No se encontraron productos</p>
                            </div>
                        ) : (
                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                {filteredProducts.map((product) => (
                                    <ProductCard
                                        key={product.id}
                                        product={product}
                                        providerFiscalId={initialProvider.identificador_fiscal || ''}
                                    />
                                ))}
                            </div>
                        )
                    ) : (
                        <div className="animate-fade-in">
                            <ProductLinesTable
                                lines={filteredAllProducts}
                                providerFiscalId={initialProvider.identificador_fiscal || ''}
                            />
                        </div>
                    )}
                </TabsContent>
            </Tabs>
        </>
    );
}