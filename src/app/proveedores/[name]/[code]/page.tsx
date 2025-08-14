
'use client';

import { MainLayout, MainLayoutHeader } from "@/components/layout/main-layout";
import { useParams, notFound } from "next/navigation";
import { useEffect, useState, useMemo } from "react";
import { getProductHistory } from "@/services/document-service";
import type { DocumentLine } from "@/lib/types";
import { 
    Loader2, Package, Tag, FileText, Calendar, Link as LinkIcon, Euro, 
    ShoppingCart, TrendingUp, BarChart3, PieChart, Activity, AlertTriangle,
    Target, Clock, Zap, Award
} from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StatsCard } from "@/components/dashboard/stats-card";
import { ProductHistoryCharts } from "@/components/dashboard/product-history-charts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";

const formatCurrency = (amount: number | string | null | undefined, currency: string = 'EUR') => {
    if (amount === null || amount === undefined) return 'N/A';
    let numericAmount: number;
    if (typeof amount === 'string') {
        numericAmount = parseFloat(amount);
    } else {
        numericAmount = amount;
    }
    if (isNaN(numericAmount)) return 'N/A';
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency }).format(numericAmount);
};

const formatDate = (date: string | null | undefined) => {
    if (!date) return 'N/A';
    try {
        const d = new Date(date);
        const utcDate = new Date(d.valueOf() + d.getTimezoneOffset() * 60 * 1000);
        return new Intl.DateTimeFormat('es-ES', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(utcDate);
    } catch {
        return 'Fecha inválida';
    }
}

export default function ProductDetailPage() {
    const params = useParams();
    const [productInfo, setProductInfo] = useState<DocumentLine | null>(null);
    const [history, setHistory] = useState<DocumentLine[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const providerId = params.name as string;
    const productCode = params.code as string;

    useEffect(() => {
        if (providerId && productCode) {
            async function fetchData() {
                setIsLoading(true);
                try {
                    const decodedProviderId = decodeURIComponent(providerId);
                    const decodedProductCode = decodeURIComponent(productCode);

                    const { productInfo, history } = await getProductHistory(decodedProviderId, decodedProductCode);
                    
                    if (!productInfo) {
                        notFound();
                        return;
                    }
 
                    setProductInfo(productInfo);
                    setHistory(history);

                } catch (error) {
                    console.error("Failed to fetch product history", error);
                } finally {
                    setIsLoading(false);
                }
            }
            fetchData();
        } else {
            notFound();
        }
    }, [providerId, productCode]);
    
    const advancedStats = useMemo(() => {
        if (history.length === 0) {
            return {
                basicStats: { averagePurchaseValue: 0, totalSpent: 0, totalQuantity: 0 },
                priceAnalysis: { minPrice: 0, maxPrice: 0, priceVariation: 0, currentTrend: 'stable' },
                purchasePatterns: { avgOrderSize: 0, frequencyDays: 0, lastPurchase: null },
                performance: { totalTransactions: 0, avgMargin: 0, costEfficiency: 100 },
                alerts: []
            };
        }
        
        // Estadísticas básicas
        const totalSpent = history.reduce((acc, item) => acc + (Number(item.importe_linea) || 0), 0);
        const totalQuantity = history.reduce((acc, item) => acc + (Number(item.cantidad) || 0), 0);
        const averagePurchaseValue = history.length > 0 ? totalSpent / history.length : 0;
        
        // Análisis de precios
        const prices = history.map(item => parseFloat(item.precio_unitario || '0')).filter(p => p > 0);
        const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
        const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;
        const priceVariation = minPrice > 0 ? ((maxPrice - minPrice) / minPrice * 100) : 0;
        
        // Tendencia de precios (últimas 3 vs primeras 3 compras)
        const recentPrices = prices.slice(-3);
        const oldPrices = prices.slice(0, 3);
        const recentAvg = recentPrices.length > 0 ? recentPrices.reduce((a, b) => a + b, 0) / recentPrices.length : 0;
        const oldAvg = oldPrices.length > 0 ? oldPrices.reduce((a, b) => a + b, 0) / oldPrices.length : 0;
        const currentTrend = recentAvg > oldAvg * 1.05 ? 'rising' : 
                           recentAvg < oldAvg * 0.95 ? 'falling' : 'stable';
        
        // Patrones de compra
        const quantities = history.map(item => parseFloat(item.cantidad || '0'));
        const avgOrderSize = quantities.length > 0 ? quantities.reduce((a, b) => a + b, 0) / quantities.length : 0;
        
        // Frecuencia de compra
        const dates = history.map(item => new Date(item.fecha_emision || '')).sort((a, b) => a.getTime() - b.getTime());
        let totalDaysBetween = 0;
        for (let i = 1; i < dates.length; i++) {
            totalDaysBetween += Math.abs(dates[i].getTime() - dates[i-1].getTime()) / (1000 * 60 * 60 * 24);
        }
        const frequencyDays = dates.length > 1 ? Math.round(totalDaysBetween / (dates.length - 1)) : 0;
        const lastPurchase = dates.length > 0 ? dates[dates.length - 1] : null;
        
        // Análisis de performance
        const totalTransactions = history.length;
        const avgMargin = priceVariation < 10 ? 85 : priceVariation < 20 ? 75 : 65; // Simulado
        const costEfficiency = Math.max(50, 100 - priceVariation);
        
        // Alertas inteligentes
        const alerts = [];
        if (priceVariation > 25) {
            alerts.push({ type: 'warning', message: 'Alta variabilidad en precios detectada' });
        }
        if (currentTrend === 'rising') {
            alerts.push({ type: 'info', message: 'Tendencia de precios al alza' });
        }
        const daysSinceLastPurchase = lastPurchase ? Math.floor((Date.now() - lastPurchase.getTime()) / (1000 * 60 * 60 * 24)) : 0;
        if (lastPurchase && daysSinceLastPurchase > frequencyDays * 1.5 && frequencyDays > 0) {
            alerts.push({ type: 'warning', message: 'Período inusualmente largo desde última compra' });
        }
        
        return {
            basicStats: { averagePurchaseValue, totalSpent, totalQuantity },
            priceAnalysis: { minPrice, maxPrice, priceVariation, currentTrend },
            purchasePatterns: { avgOrderSize, frequencyDays, lastPurchase },
            performance: { totalTransactions, avgMargin, costEfficiency },
            alerts
        };
    }, [history]);

    if (isLoading) {
        return (
             <MainLayout>
                <div className="flex flex-1 items-center justify-center">
                     <Loader2 className="h-10 w-10 animate-spin text-primary" />
                </div>
            </MainLayout>
        )
    }

    if (!productInfo) {
        return notFound();
    }

    return (
        <MainLayout>
            <div className="flex-1 space-y-8 p-4 pt-6 md:p-8">
                <MainLayoutHeader>
                    <div className="flex-1">
                         <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                            <Package className="h-8 w-8 text-primary" />
                            {productInfo.descripcion}
                        </h2>
                        <p className="text-muted-foreground flex items-center gap-2 font-mono">
                            <Tag className="h-4 w-4" />
                            {productInfo.codigo}
                        </p>
                        {advancedStats.alerts.length > 0 && (
                            <div className="flex items-center gap-2 mt-2">
                                <AlertTriangle className="h-4 w-4 text-amber-500" />
                                <span className="text-sm text-amber-600">
                                    {advancedStats.alerts.length} alerta{advancedStats.alerts.length > 1 ? 's' : ''} activa{advancedStats.alerts.length > 1 ? 's' : ''}
                                </span>
                            </div>
                        )}
                    </div>
                </MainLayoutHeader>

                {/* Alertas */}
                {advancedStats.alerts.length > 0 && (
                    <section className="space-y-2">
                        {advancedStats.alerts.map((alert, index) => (
                            <Card key={index} className={`border-l-4 ${alert.type === 'warning' ? 'border-l-amber-500' : 'border-l-blue-500'}`}>
                                <CardContent className="py-3">
                                    <div className="flex items-center gap-2">
                                        <AlertTriangle className={`h-4 w-4 ${alert.type === 'warning' ? 'text-amber-500' : 'text-blue-500'}`} />
                                        <span className="text-sm font-medium">{alert.message}</span>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </section>
                )}

                <Tabs defaultValue="overview" className="space-y-6">
                    <TabsList className="grid w-full grid-cols-4">
                        <TabsTrigger value="overview">Resumen</TabsTrigger>
                        <TabsTrigger value="pricing">Precios</TabsTrigger>
                        <TabsTrigger value="patterns">Patrones</TabsTrigger>
                        <TabsTrigger value="details">Detalles</TabsTrigger>
                    </TabsList>

                    <TabsContent value="overview" className="space-y-6">
                        <section className="grid gap-4 md:grid-cols-4">
                            <StatsCard 
                                title="Valor Compra Promedio" 
                                value={formatCurrency(advancedStats.basicStats.averagePurchaseValue)} 
                                icon={Euro}
                                description="Promedio por transacción"
                            />
                            <StatsCard 
                                title="Unidades Totales" 
                                value={`${Math.round(advancedStats.basicStats.totalQuantity).toLocaleString('es-ES')} ${productInfo.unidad ? (productInfo.unidad + 's') : ''}`}
                                icon={Package}
                                description={`${productInfo.unidad}s compradas`}
                            />
                            <StatsCard 
                                title="Total Gastado" 
                                value={formatCurrency(advancedStats.basicStats.totalSpent)} 
                                icon={ShoppingCart}
                                description="Suma de todas las compras"
                            />
                            <StatsCard 
                                title="Transacciones" 
                                value={advancedStats.performance.totalTransactions.toString()} 
                                icon={Activity}
                                description="Número de compras"
                            />
                        </section>

                        <section className="grid gap-4 md:grid-cols-2">
                            <Card>
                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                    <CardTitle className="text-sm font-medium">Eficiencia de Costos</CardTitle>
                                    <Target className="h-4 w-4 text-muted-foreground" />
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold">{advancedStats.performance.costEfficiency.toFixed(0)}%</div>
                                    <Progress value={advancedStats.performance.costEfficiency} className="mt-2" />
                                    <p className="text-xs text-muted-foreground mt-2">
                                        Basado en estabilidad de precios
                                    </p>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                    <CardTitle className="text-sm font-medium">Margen Estimado</CardTitle>
                                    <Award className="h-4 w-4 text-muted-foreground" />
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold">{advancedStats.performance.avgMargin}%</div>
                                    <Progress value={advancedStats.performance.avgMargin} className="mt-2" />
                                    <p className="text-xs text-muted-foreground mt-2">
                                        Estimación basada en volatilidad
                                    </p>
                                </CardContent>
                            </Card>
                        </section>

                        <section>
                            <ProductHistoryCharts history={history} />
                        </section>
                    </TabsContent>

                    <TabsContent value="pricing" className="space-y-6">
                        <section className="grid gap-4 md:grid-cols-4">
                            <StatsCard 
                                title="Precio Mínimo" 
                                value={formatCurrency(advancedStats.priceAnalysis.minPrice)} 
                                icon={TrendingUp}
                                description="Mejor precio obtenido"
                            />
                            <StatsCard 
                                title="Precio Máximo" 
                                value={formatCurrency(advancedStats.priceAnalysis.maxPrice)} 
                                icon={BarChart3}
                                description="Precio más alto pagado"
                            />
                            <StatsCard 
                                title="Variación de Precio" 
                                value={`${advancedStats.priceAnalysis.priceVariation.toFixed(1)}%`} 
                                icon={Activity}
                                description="Volatilidad de precios"
                            />
                            <StatsCard 
                                title="Tendencia Actual" 
                                value={advancedStats.priceAnalysis.currentTrend === 'rising' ? 'Subiendo' : 
                                       advancedStats.priceAnalysis.currentTrend === 'falling' ? 'Bajando' : 'Estable'} 
                                icon={TrendingUp}
                                description="Últimas compras vs anteriores"
                            />
                        </section>

                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <BarChart3 className="h-5 w-5" />
                                    Análisis de Precios
                                </CardTitle>
                                <CardDescription>
                                    Evolución y tendencias de precios del producto
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid gap-4 md:grid-cols-2">
                                    <div>
                                        <h4 className="text-sm font-medium mb-2">Rango de Precios</h4>
                                        <div className="space-y-2">
                                            <div className="flex justify-between text-sm">
                                                <span>Mínimo:</span>
                                                <span className="font-mono">{formatCurrency(advancedStats.priceAnalysis.minPrice)}</span>
                                            </div>
                                            <div className="flex justify-between text-sm">
                                                <span>Máximo:</span>
                                                <span className="font-mono">{formatCurrency(advancedStats.priceAnalysis.maxPrice)}</span>
                                            </div>
                                            <div className="flex justify-between text-sm">
                                                <span>Promedio:</span>
                                                <span className="font-mono">{formatCurrency((advancedStats.priceAnalysis.minPrice + advancedStats.priceAnalysis.maxPrice) / 2)}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-medium mb-2">Estabilidad</h4>
                                        <div className="space-y-2">
                                            <div className="text-2xl font-bold">
                                                {advancedStats.priceAnalysis.priceVariation < 10 ? 'Muy Estable' :
                                                 advancedStats.priceAnalysis.priceVariation < 20 ? 'Estable' :
                                                 advancedStats.priceAnalysis.priceVariation < 30 ? 'Moderado' : 'Volátil'}
                                            </div>
                                            <Progress 
                                                value={Math.max(0, 100 - advancedStats.priceAnalysis.priceVariation)} 
                                                className="mt-2" 
                                            />
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="patterns" className="space-y-6">
                        <section className="grid gap-4 md:grid-cols-3">
                            <StatsCard 
                                title="Tamaño Promedio de Pedido" 
                                value={`${advancedStats.purchasePatterns.avgOrderSize.toFixed(1)} ${productInfo.unidad}s`} 
                                icon={Package}
                                description="Cantidad por compra"
                            />
                            <StatsCard 
                                title="Frecuencia de Compra" 
                                value={advancedStats.purchasePatterns.frequencyDays > 0 ? 
                                       `${advancedStats.purchasePatterns.frequencyDays} días` : 'N/A'} 
                                icon={Clock}
                                description="Intervalo promedio"
                            />
                            <StatsCard 
                                title="Última Compra" 
                                value={advancedStats.purchasePatterns.lastPurchase ? 
                                       formatDate(advancedStats.purchasePatterns.lastPurchase.toISOString()) : 'N/A'} 
                                icon={Calendar}
                                description="Fecha más reciente"
                            />
                        </section>

                        <div className="grid gap-4 md:grid-cols-2">
                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <Activity className="h-5 w-5" />
                                        Patrón de Compras
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-4">
                                        <div>
                                            <div className="flex justify-between text-sm mb-1">
                                                <span>Consistencia de Pedidos</span>
                                                <span>
                                                    {advancedStats.priceAnalysis.priceVariation < 15 ? 'Alta' : 
                                                     advancedStats.priceAnalysis.priceVariation < 25 ? 'Media' : 'Baja'}
                                                </span>
                                            </div>
                                            <Progress value={Math.max(20, 100 - advancedStats.priceAnalysis.priceVariation * 2)} />
                                        </div>
                                        <div>
                                            <div className="flex justify-between text-sm mb-1">
                                                <span>Regularidad Temporal</span>
                                                <span>
                                                    {advancedStats.purchasePatterns.frequencyDays > 0 && advancedStats.purchasePatterns.frequencyDays < 60 ? 'Regular' : 'Irregular'}
                                                </span>
                                            </div>
                                            <Progress value={advancedStats.purchasePatterns.frequencyDays > 0 && advancedStats.purchasePatterns.frequencyDays < 60 ? 80 : 40} />
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <Zap className="h-5 w-5" />
                                        Insights Inteligentes
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-3 text-sm">
                                        <div className="flex items-start gap-2">
                                            <div className="w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
                                            <p>
                                                {advancedStats.purchasePatterns.avgOrderSize > 10 ? 
                                                'Compras en volumen, posible descuento por cantidad' :
                                                'Compras frecuentes en pequeñas cantidades'}
                                            </p>
                                        </div>
                                        <div className="flex items-start gap-2">
                                            <div className="w-2 h-2 bg-green-500 rounded-full mt-2"></div>
                                            <p>
                                                {advancedStats.priceAnalysis.priceVariation < 10 ? 
                                                'Producto con precio estable, bueno para planificación' :
                                                'Monitorear fluctuaciones de precio para optimizar costos'}
                                            </p>
                                        </div>
                                        <div className="flex items-start gap-2">
                                            <div className="w-2 h-2 bg-amber-500 rounded-full mt-2"></div>
                                            <p>
                                                {advancedStats.performance.totalTransactions < 5 ? 
                                                'Historial limitado, recopilar más datos para análisis' :
                                                'Suficientes datos para análisis predictivo confiable'}
                                            </p>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </TabsContent>

                    <TabsContent value="details" className="space-y-6">
                        <section>
                            <h3 className="text-2xl font-semibold tracking-tight mb-4 flex items-center gap-2">
                                <FileText className="h-6 w-6" />
                                Historial de Compras Detallado
                            </h3>
                            <div className="rounded-lg border">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead><Calendar className="h-4 w-4 inline-block mr-2" />Fecha Emisión</TableHead>
                                            <TableHead>Nº Documento</TableHead>
                                            <TableHead className="text-right">Cantidad</TableHead>
                                            <TableHead className="text-right"><Euro className="h-4 w-4 inline-block mr-2" />P. Unitario</TableHead>
                                            <TableHead className="text-right"><Euro className="h-4 w-4 inline-block mr-2" />Total Línea</TableHead>
                                            <TableHead className="text-center">Variación</TableHead>
                                            <TableHead className="text-center">Acciones</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {history.map((item, index) => {
                                            const currentPrice = parseFloat(item.precio_unitario || '0');
                                            const avgPrice = (advancedStats.priceAnalysis.minPrice + advancedStats.priceAnalysis.maxPrice) / 2;
                                            const priceVariation = avgPrice > 0 ? ((currentPrice - avgPrice) / avgPrice * 100) : 0;
                                            
                                            return (
                                                <TableRow key={item.id}>
                                                    <TableCell>{formatDate(item.fecha_emision)}</TableCell>
                                                    <TableCell className="font-medium">{item.numero_documento}</TableCell>
                                                    <TableCell className="text-right">
                                                        <Badge variant="secondary">{item.cantidad} {item.unidad}</Badge>
                                                    </TableCell>
                                                    <TableCell className="text-right">{formatCurrency(item.precio_unitario)}</TableCell>
                                                    <TableCell className="text-right font-semibold">{formatCurrency(item.importe_linea)}</TableCell>
                                                    <TableCell className="text-center">
                                                        {history.length > 1 && (
                                                            <Badge 
                                                                variant={Math.abs(priceVariation) < 5 ? "secondary" : 
                                                                        priceVariation > 5 ? "destructive" : "default"}
                                                                className="text-xs"
                                                            >
                                                                {priceVariation > 0 ? '+' : ''}{priceVariation.toFixed(1)}%
                                                            </Badge>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        <Button variant="outline" size="sm" asChild>
                                                            <Link href={`/documento/${item.documento_id}`}>
                                                                <LinkIcon className="h-4 w-4 mr-2" />
                                                                Ver Doc.
                                                            </Link>
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </div>
                        </section>
                    </TabsContent>
                </Tabs>
            </div>
        </MainLayout>
    );
}
