'use client';

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { FileText, Package, Loader2, List, Grid, Sparkles, Brain, CheckCircle2, X, Trash2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { normalizeProductDescription } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Document, DocumentLine, DocumentEntity } from "@/lib/types";
import { DocumentsTable } from "@/components/dashboard/documents-table";
import { ProductCard } from "@/components/dashboard/product-card";
import { ProductLinesTable } from "@/components/dashboard/product-lines-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { ProviderAnalyticsData } from "@/components/dashboard/provider-analytics";
import { ProviderAnalytics } from "@/components/dashboard/provider-analytics";
import { useCompanyContext } from "@/context/CompanyProvider";
import {
    getDocumentsByProviderName,
    getProductsByProviderName,
    getProviderAnalytics,
    getAllProductLinesByProviderName,
    getDocumentsByClientName,
    getProductsByClientName,
    getClientAnalytics,
    getAllProductLinesByClientName
} from "@/services/document-service";
import { ProviderFilterBar, type ProviderFilterState } from "@/components/proveedores/provider-filter-bar";

interface ProviderDetailClientProps {
    initialProvider: DocumentEntity;
    initialDocuments: Document[];
    initialProducts: DocumentLine[];
    initialAllProducts: DocumentLine[];
    initialAnalyticsData: ProviderAnalyticsData;
    isClient?: boolean;
}

export function ProviderDetailClient({
    initialProvider,
    initialDocuments,
    initialProducts,
    initialAllProducts,
    initialAnalyticsData,
    isClient = false
}: ProviderDetailClientProps) {
    const { selectedCompanyIds, companies } = useCompanyContext();

    const router = useRouter();
    const searchParams = useSearchParams();
    const pathname = usePathname();

    const mainEmpresaId = useMemo(() => {
        return selectedCompanyIds.length === 1 ? selectedCompanyIds[0] : (companies.length > 0 ? companies[0].id : undefined);
    }, [selectedCompanyIds, companies]);


    const [documents, setDocuments] = useState(initialDocuments);
    const [products, setProducts] = useState(initialProducts);
    const [allProducts, setAllProducts] = useState(initialAllProducts);
    const [analyticsData, setAnalyticsData] = useState(initialAnalyticsData);
    const [latestReasoning, setLatestReasoning] = useState<string | null>(null);
    const stopScanningRef = useRef(false);
    const [isLoadingData, setIsLoadingData] = useState(false);
    const { toast } = useToast();

    // ✅ Estados para Escaneo e IA
    const [selectedGroupKeys, setSelectedGroupKeys] = useState<string[]>([]);
    const [isScanning, setIsScanning] = useState(false);
    const [scanProgress, setScanProgress] = useState(0);
    const [aiSuggestions, setAiSuggestions] = useState<Record<string, { account: string; justification: string; normalizedDescription?: string }>>({});
    const [isSavingSuggestions, setIsSavingSuggestions] = useState(false);
    const [reloadTrigger, setReloadTrigger] = useState(0);

    const triggerReload = () => setReloadTrigger(prev => prev + 1);

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

    // ✅ ESTADO PERSISTENTE EN URL (Pestaña y Modo de Vista)
    const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'summary');
    const [viewMode, setViewMode] = useState<'grid' | 'list'>((searchParams.get('view') as 'grid' | 'list') || 'grid');

    // Sincronizar estado cuando la URL cambia (ej. botón atrás)
    useEffect(() => {
        const tab = searchParams.get('tab');
        if (tab && tab !== activeTab) setActiveTab(tab);

        const view = searchParams.get('view');
        if (view && (view === 'grid' || view === 'list') && view !== viewMode) setViewMode(view as any);
    }, [searchParams]);

    const updateUrl = (tab: string, view: string) => {
        const params = new URLSearchParams(searchParams);
        params.set('tab', tab);
        params.set('view', view);
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    };

    const handleTabChange = (val: string) => {
        setActiveTab(val);
        updateUrl(val, viewMode);
    };

    const handleViewModeChange = (val: 'grid' | 'list') => {
        setViewMode(val);
        updateUrl(activeTab, val);
    };

    // Stable ref so companies can be read inside the effect without being a dep
    const companiesRef = useRef(companies);
    useEffect(() => { companiesRef.current = companies; }, [companies]);

    useEffect(() => {
        async function reloadData() {
            const currentCompanies = companiesRef.current;
            if (currentCompanies.length === 0) return;
            setIsLoadingData(true);
            try {
                const empresaIds = selectedCompanyIds.length > 0 ? selectedCompanyIds : currentCompanies.map(c => c.id);
                const fiscalId = initialProvider.identificador_fiscal || '';
                const [newDocs, newProds, newAnalytics, newAllProds] = await Promise.all(
                    isClient ? [
                        getDocumentsByClientName(fiscalId, empresaIds),
                        getProductsByClientName(fiscalId, empresaIds),
                        getClientAnalytics(fiscalId, empresaIds),
                        getAllProductLinesByClientName(fiscalId, empresaIds)
                    ] : [
                        getDocumentsByProviderName(fiscalId, empresaIds),
                        getProductsByProviderName(fiscalId, empresaIds),
                        getProviderAnalytics(fiscalId, empresaIds),
                        getAllProductLinesByProviderName(fiscalId, empresaIds)
                    ]
                );

                // ✅ CARGAR SUGERENCIAS IA PERSISTENTES
                if (empresaIds.length === 1) {
                    try {
                        const rulesRes = await fetch(`/api/productos-config?empresaId=${empresaIds[0]}&proveedorCif=${fiscalId}`);
                        if (rulesRes.ok) {
                            const rules = await rulesRes.json();
                            const suggestions: Record<string, { account: string; justification: string; normalizedDescription?: string }> = {};
                            rules.forEach((r: any) => {
                                if (r.is_ai_suggested === 1) {
                                    suggestions[r.patron] = {
                                        account: r.cuenta_contable,
                                        justification: r.justification || 'Sugerencia automática de I.A.',
                                        normalizedDescription: r.patron
                                    };
                                }
                            });
                            // Si ya hay sugerencias de la sesión actual, las mezclamos (o priorizamos las de la sesión si el usuario sigue escaneando)
                            setAiSuggestions(prev => ({ ...suggestions, ...prev }));
                        }
                    } catch (rulesErr) {
                        console.error('Error loading AI suggestions:', rulesErr);
                    }
                }

                setDocuments(newDocs);
                setProducts(newProds);
                setAllProducts(newAllProds);
                if (newAnalytics) setAnalyticsData(newAnalytics);
            } catch (error) {
                console.error('❌ Error recargando datos:', error);
            } finally {
                setIsLoadingData(false);
            }
        }
        reloadData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedCompanyIds, initialProvider.identificador_fiscal, reloadTrigger]);


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

    // ✅ LÓGICA DE ESCANEO POR LOTES
    const handleScanAI = async () => {
        if (selectedGroupKeys.length === 0) return;

        setIsScanning(true);
        setScanProgress(0);

        // Agrupar items seleccionados (description + code)
        const itemsToScanMap = new Map<string, { description: string, code?: string }>();
        filteredAllProducts.forEach(p => {
            const normDesc = normalizeProductDescription(p.descripcion || '');
            const key = p.codigo ? `${p.codigo}::${normDesc}` : normDesc;
            if (selectedGroupKeys.includes(key)) {
                itemsToScanMap.set(key, { description: p.descripcion || '', code: p.codigo || undefined });
            }
        });

        const itemsToScan = Array.from(itemsToScanMap.entries());
        const totalItems = itemsToScan.length;
        const batchSize = 4; // Lote aún más pequeño para evitar timeouts/rate limits
        let processedCount = 0;
        let successfulCount = 0;
        let errorCount = 0;
        stopScanningRef.current = false;

        const newSuggestions = { ...aiSuggestions };

        try {
            for (let i = 0; i < itemsToScan.length; i += batchSize) {
                if (stopScanningRef.current) break;

                const batch = itemsToScan.slice(i, i + batchSize);
                const itemsBatch = batch.map(([key, data], idx) => ({
                    description: data.description,
                    code: data.code,
                    index: idx
                }));

                setLatestReasoning(`Analizando lote ${Math.floor(i / batchSize) + 1} de ${Math.ceil(totalItems / batchSize)}...`);

                let retryCount = 0;
                let success = false;
                let responseData;

                while (retryCount < 3 && !success && !stopScanningRef.current) {
                    try {
                        const empresaId = selectedCompanyIds.length === 1 ? selectedCompanyIds[0] : (companies[0]?.id);
                        const fiscalId = initialProvider.identificador_fiscal || '';

                        const response = await fetch(`/api/productos/classify?empresaId=${empresaId}&proveedorCif=${fiscalId}`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ items: itemsBatch }),
                        });

                        if (response.status === 429) {
                            console.warn(`⚠️ Rate limit (429). Reintentando en ${8 * (retryCount + 1)}s...`);
                            setLatestReasoning(`Límite de velocidad OpenAI (429). Esperando ${8 * (retryCount + 1)}s para reintentar...`);
                            await new Promise(r => setTimeout(r, 8000 * (retryCount + 1)));
                            retryCount++;
                            continue;
                        }

                        if (!response.ok) {
                            const errorData = await response.json().catch(() => ({}));
                            throw new Error(errorData.error || `Error API: ${response.status}`);
                        }

                        responseData = await response.json();
                        success = true;
                    } catch (err: any) {
                        console.error('Batch error:', err);
                        retryCount++;
                        if (retryCount >= 3) {
                            setLatestReasoning(`Lote fallido tras 3 intentos: ${err.message}`);
                            break;
                        }
                        await new Promise(r => setTimeout(r, 3000));
                    }
                }

                if (success && responseData?.classifications) {
                    successfulCount += responseData.classifications.length;
                    const lastCls = responseData.classifications[responseData.classifications.length - 1];
                    if (lastCls) setLatestReasoning(lastCls.justificacion);

                    responseData.classifications.forEach((cls: any, idx: number) => {
                        const itemData = batch[idx][1];
                        const normDesc = normalizeProductDescription(itemData.description || '');
                        newSuggestions[normDesc] = {
                            account: cls.cuenta_contable,
                            justification: cls.justificacion,
                            normalizedDescription: normDesc
                        };
                    });
                } else {
                    errorCount += batch.length;
                }

                processedCount += batch.length;
                setScanProgress(Math.round((processedCount / totalItems) * 100));
                setAiSuggestions({ ...newSuggestions });

                // Throttling: Pequeño respiro entre batches (3 segundos)
                if (i + batchSize < itemsToScan.length && !stopScanningRef.current) {
                    await new Promise(resolve => setTimeout(resolve, 3000));
                }
            }

            if (successfulCount > 0) {
                toast({
                    title: "Escaneo finalizado",
                    description: `Clasificados ${successfulCount} productos. ${errorCount > 0 ? `(${errorCount} fallaron)` : ''} Revisa las sugerencias amarillas.`,
                });
            } else {
                toast({
                    variant: "destructive",
                    title: "Escaneo fallido",
                    description: "No se pudo clasificar ningún producto. Revisa los límites de OpenAI o inténtalo más tarde.",
                });
            }
        } catch (error) {
            console.error('Error during scan:', error);
            toast({
                variant: "destructive",
                title: "Error crítico",
                description: "Hubo un problema inesperado en el escaneo.",
            });
        } finally {
            setIsScanning(false);
            setScanProgress(100);
        }
    };

    const handleSaveAISuggestions = async () => {
        const suggestionEntries = Object.entries(aiSuggestions);
        if (suggestionEntries.length === 0) return;

        setIsSavingSuggestions(true);
        try {
            const empresaId = selectedCompanyIds.length === 1 ? selectedCompanyIds[0] : companies[0].id;
            const itemsToSave = suggestionEntries.map(([key, data]) => {
                const parts = key.split('::');
                const code = parts.length > 1 ? parts[0] : undefined;
                const rawDescription = parts.length > 1 ? parts[1] : parts[0];
                const normalizedDescription = normalizeProductDescription(rawDescription);
                return {
                    description: rawDescription,
                    normalizedDescription,
                    code,
                    cuenta_contable: data.account,
                    proveedor_cif: initialProvider.identificador_fiscal
                };
            });

            const response = await fetch('/api/productos-config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'save_rules',
                    empresaId,
                    items: itemsToSave
                }),
            });

            if (!response.ok) throw new Error('Error al guardar sugerencias');

            setAiSuggestions({});
            setSelectedGroupKeys([]);
            triggerReload();
            router.refresh();

            toast({
                title: "Clasificaciones guardadas",
                description: "Se han actualizado los productos y las reglas automáticas.",
            });
        } catch (error) {
            console.error('Error saving:', error);
            toast({
                variant: "destructive",
                title: "Error al guardar",
                description: "No se pudieron persistir las clasificaciones.",
            });
        } finally {
            setIsSavingSuggestions(false);
        }
    };

    const handleBatchClear = async () => {
        if (selectedGroupKeys.length === 0) return;

        setIsLoadingData(true);
        try {
            const empresaId = selectedCompanyIds.length === 1 ? selectedCompanyIds[0] : companies[0].id;
            const itemsToClearMap = new Map<string, { description: string, normalizedDescription: string, code?: string }>();
            filteredAllProducts.forEach(p => {
                const normDesc = normalizeProductDescription(p.descripcion || '');
                const key = p.codigo ? `${p.codigo}::${normDesc}` : normDesc;
                if (selectedGroupKeys.includes(key)) {
                    itemsToClearMap.set(key, {
                        description: p.descripcion || '',
                        normalizedDescription: normDesc,
                        code: p.codigo || undefined
                    });
                }
            });

            const itemsToClear = Array.from(itemsToClearMap.values());

            const response = await fetch('/api/productos-config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'clear_accounts',
                    empresaId,
                    items: itemsToClear
                }),
            });

            if (!response.ok) throw new Error('Error al limpiar cuentas');

            setSelectedGroupKeys([]);
            triggerReload();
            router.refresh();

            toast({
                title: "Cuentas limpiadas",
                description: "Se han reseteado las clasificaciones seleccionadas.",
            });
        } catch (error) {
            console.error('Error clearing:', error);
        } finally {
            setIsLoadingData(false);
        }
    };

    const handleManualAccountSave = async (data: { description: string, normalizedDescription: string, code?: string, account: string }) => {
        const empresaId = selectedCompanyIds.length === 1 ? selectedCompanyIds[0] : companies[0].id;
        const response = await fetch('/api/productos-config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'save_rules',
                empresaId,
                items: [{
                    description: data.description,
                    normalizedDescription: data.normalizedDescription,
                    code: data.code,
                    cuenta_contable: data.account,
                    proveedor_cif: initialProvider.identificador_fiscal
                }]
            }),
        });

        if (!response.ok) throw new Error('Error al guardar cuenta');

        toast({
            title: "Cuenta guardada",
            description: `Se ha asignado la cuenta ${data.account} al producto.`,
        });

        // Limpiar sugerencia de IA si existía para este item en el estado local
        const normDesc = data.normalizedDescription;
        const key = data.code ? `${data.code}::${normDesc}` : normDesc;

        setAiSuggestions(prev => {
            if (!prev[key]) return prev;
            const next = { ...prev };
            delete next[key];
            return next;
        });

        triggerReload();
        router.refresh();
    };

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

            <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
                <TabsList className="grid w-full grid-cols-3 gap-2">
                    <TabsTrigger value="summary">Resumen</TabsTrigger>
                    <TabsTrigger value="documents" disabled={isLoadingData}>Documentos ({documents.length})</TabsTrigger>
                    <TabsTrigger value="products" disabled={isLoadingData}>Productos ({products.length})</TabsTrigger>
                </TabsList>

                <TabsContent value="summary" className="space-y-6 animate-fade-in">
                    <ProviderAnalytics data={analyticsData} isClient={isClient} />
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
                                onClick={() => handleViewModeChange('grid')}
                                className={`px-4 py-2 text-sm font-medium transition-colors ${viewMode === 'grid' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                            >
                                Gráfico
                            </button>
                            <button
                                onClick={() => handleViewModeChange('list')}
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
                        <div className="animate-fade-in relative">
                            {/* Toolbar flotante para acciones masivas */}
                            {selectedGroupKeys.length > 0 && (
                                <div className="sticky top-4 z-30 mb-4 bg-card/95 backdrop-blur-md border-2 border-primary/20 rounded-xl p-3 shadow-2xl flex items-center justify-between animate-in slide-in-from-top-4 duration-300">
                                    <div className="flex items-center gap-4">
                                        <div className="bg-primary/10 px-3 py-1.5 rounded-lg flex items-center gap-2">
                                            <Package className="w-4 h-4 text-primary" />
                                            <span className="text-sm font-bold text-primary">
                                                {selectedGroupKeys.length} seleccionados
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2 border-l pl-4">
                                            <Button
                                                onClick={handleScanAI}
                                                disabled={isScanning || selectedGroupKeys.length === 0}
                                                className="bg-primary text-primary-foreground hover:bg-primary/90 transition-all font-bold gap-2 shadow-lg shadow-primary/20"
                                            >
                                                <Brain className="w-4 h-4" />
                                                Detección Cuentas
                                            </Button>

                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <Button
                                                        variant="outline"
                                                        disabled={isScanning || selectedGroupKeys.length === 0}
                                                        className="border-destructive/20 text-destructive hover:bg-destructive/5 font-medium flex items-center gap-2"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                        Eliminar múltiples
                                                    </Button>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>¿Eliminar múltiples clasificaciones?</AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                            Se borrarán las cuentas contables y las reglas automáticas de los {selectedGroupKeys.length} grupos seleccionados. Esta acción no se puede deshacer.
                                                        </AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                        <AlertDialogAction onClick={handleBatchClear} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                                            Confirmar eliminación masiva
                                                        </AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>

                                            {Object.keys(aiSuggestions).length > 0 && (
                                                <Button
                                                    size="sm"
                                                    onClick={handleSaveAISuggestions}
                                                    disabled={isSavingSuggestions}
                                                    className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                                                >
                                                    <CheckCircle2 className="w-4 h-4" />
                                                    {isSavingSuggestions ? 'Guardando...' : 'Confirmar Todo'}
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            <ProductLinesTable
                                lines={filteredAllProducts}
                                providerFiscalId={initialProvider.identificador_fiscal || ''}
                                selectedGroupKeys={selectedGroupKeys}
                                onSelectionChange={setSelectedGroupKeys}
                                aiSuggestions={aiSuggestions}
                                onClassificationUpdate={() => {
                                    triggerReload();
                                    router.refresh();
                                }}
                                onAccountUpdate={handleManualAccountSave}
                                currentEmpresaId={mainEmpresaId}
                                isClient={isClient}
                                highlightKey={searchParams.get('highlight') || undefined}
                            />
                        </div>
                    )}
                </TabsContent>
            </Tabs>

            {/* Background Scan Progress Modal */}
            {isScanning && (
                <div className="fixed bottom-6 right-6 z-[60] w-80 bg-card border shadow-2xl rounded-xl p-4 animate-in slide-in-from-right-8 duration-500">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2 text-primary">
                            <div className="relative">
                                <Brain className="w-5 h-5 animate-pulse" />
                                <Sparkles className="w-3 h-3 absolute -top-1 -right-1 text-amber-500" />
                            </div>
                            <span className="text-sm font-bold">I.A. Clasificando...</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded-full">{scanProgress}%</span>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                onClick={() => stopScanningRef.current = true}
                                title="Detener escaneo"
                            >
                                <X className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>
                    <Progress value={scanProgress} className="h-2 mb-2" />
                    {latestReasoning && (
                        <div className="bg-primary/5 rounded-lg p-2 border border-primary/10 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <p className="text-[9px] font-bold text-primary uppercase tracking-wider mb-1 flex items-center gap-1">
                                <Sparkles className="w-2.5 h-2.5" /> Razonamiento I.A.
                            </p>
                            <p className="text-[10px] text-foreground font-medium leading-relaxed italic line-clamp-2">
                                "{latestReasoning}"
                            </p>
                        </div>
                    )}
                    <p className="text-[10px] text-muted-foreground mt-3 italic">
                        No cierres esta pestaña. El progreso se guarda en tiempo real.
                    </p>
                </div>
            )}
        </>
    );
}