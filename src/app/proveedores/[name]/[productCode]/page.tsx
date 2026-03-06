import { MainLayout, MainLayoutHeader } from "@/components/layout/main-layout";
import { notFound } from "next/navigation";
import { ArrowLeft, Package, TrendingUp, TrendingDown, Calendar, Euro, FileText, Minus } from "lucide-react";
import { getProductHistory, getProviderByFiscalId } from "@/services/document-service";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { ProductPriceChart } from "./product-price-chart";

const formatCurrency = (amount: number | string | null | undefined, currency: string = 'EUR') => {
    if (amount === null || amount === undefined) return 'N/A';
    let numericAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    if (isNaN(numericAmount)) return 'N/A';
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency }).format(numericAmount);
};

const formatDate = (date: string | null | undefined) => {
    if (!date) return 'N/A';
    try {
        const d = new Date(date);
        const utcDate = new Date(d.valueOf() + d.getTimezoneOffset() * 60 * 1000);
        return new Intl.DateTimeFormat('es-ES', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(utcDate);
    } catch { return 'Fecha inválida'; }
};

export default async function ProductDetailPage({
    params
}: {
    params: Promise<{ name: string; productCode: string }>
}) {
    const resolvedParams = await params;
    const providerFiscalId = decodeURIComponent(resolvedParams.name);
    let identifier = decodeURIComponent(resolvedParams.productCode);
    let searchBy: 'code' | 'description' = 'code';

    if (identifier.startsWith('DESC_')) {
        searchBy = 'description';
        identifier = identifier.replace(/^DESC_/, '');
    }

    const [productData, provider] = await Promise.all([
        getProductHistory(providerFiscalId, identifier, searchBy),
        getProviderByFiscalId(providerFiscalId)
    ]);

    if (!productData.productInfo || !provider) {
        notFound();
        return null;
    }

    // 🛡️ 1. LIMPIEZA DE DUPLICADOS (Por número de documento)
    // Esto asegura que si el backend manda 7 filas por errores de JOIN, nosotros usemos las 5 reales.
    const history = productData.history.reduce((acc: any[], current: any) => {
        if (!acc.some(item => item.numero_documento === current.numero_documento)) {
            acc.push(current);
        }
        return acc;
    }, []);

    // 📊 2. CÁLCULOS FORZADOS SOBRE LA DATA LIMPIA
    const prices = history.map(h => Number(h.precio_unitario)).filter(p => !isNaN(p));

    // Promedio basado solo en los 5 documentos únicos
    const avgPrice = prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;

    const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
    const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;

    // Info del producto basada en la compra más reciente de la lista limpia
    const productInfo = history[0];
    const currentPrice = Number(productInfo.precio_unitario) || 0;

    // Porcentaje de tendencia real
    const trendPercentage = avgPrice > 0 ? ((currentPrice - avgPrice) / avgPrice) * 100 : 0;
    const priceTrend = currentPrice > avgPrice ? 'up' : currentPrice < avgPrice ? 'down' : 'stable';

    return (
        <MainLayout>
            <div className="flex-1 space-y-6 p-4 pt-6 md:p-8">
                <div className="flex items-center gap-4">
                    <Link href={`/proveedores/${encodeURIComponent(providerFiscalId)}`}>
                        <Button variant="outline" size="sm">
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            Volver a {provider.nombre}
                        </Button>
                    </Link>
                </div>

                <MainLayoutHeader>
                    <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                            <Package className="h-8 w-8 text-primary" />
                            <div>
                                <h2 className="text-3xl font-bold tracking-tight">{productInfo.descripcion}</h2>
                                <p className="text-sm text-muted-foreground font-mono mt-1">Código: {productInfo.codigo}</p>
                            </div>
                        </div>
                    </div>
                </MainLayoutHeader>

                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Precio Actual</CardTitle>
                            <Euro className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{formatCurrency(currentPrice)}</div>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger className="flex items-center gap-1 cursor-help">
                                            {priceTrend === 'up' ? (
                                                <>
                                                    <TrendingUp className="h-3 w-3 text-red-500" />
                                                    <span className="text-red-500">+{trendPercentage.toFixed(1)}%</span>
                                                </>
                                            ) : priceTrend === 'down' ? (
                                                <>
                                                    <TrendingDown className="h-3 w-3 text-green-500" />
                                                    <span className="text-green-500">{trendPercentage.toFixed(1)}%</span>
                                                </>
                                            ) : (
                                                <>
                                                    <Minus className="h-3 w-3" />
                                                    <span>Sin cambios</span>
                                                </>
                                            )}
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p className="max-w-[200px] text-center">Variación de la última tarifa respecto a la tarifa promedio histórica del proveedor.</p>
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                                <span className="ml-1">vs promedio</span>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Precio Promedio</CardTitle>
                            <TrendingUp className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{formatCurrency(avgPrice)}</div>
                            <p className="text-xs text-muted-foreground mt-1">Basado en {history.length} compras</p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Rango de Precio</CardTitle>
                            <Package className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{formatCurrency(minPrice)}</div>
                            <p className="text-xs text-muted-foreground mt-1">Máximo: {formatCurrency(maxPrice)}</p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Última Compra</CardTitle>
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{formatDate(productInfo.fecha_emision)}</div>
                            <p className="text-xs text-muted-foreground mt-1">{productInfo.numero_documento || 'Sin número'}</p>
                        </CardContent>
                    </Card>
                </div>

                {history.length > 1 && (
                    <Card>
                        <CardHeader>
                            <CardTitle>Evolución de Precios</CardTitle>
                            <CardDescription>Historial de precios en las últimas {history.length} compras</CardDescription>
                        </CardHeader>
                        <CardContent><ProductPriceChart history={history} /></CardContent>
                    </Card>
                )}

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" />Historial de Compras</CardTitle>
                        <CardDescription>Todas las compras registradas de este producto</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Fecha</TableHead>
                                    <TableHead>Documento</TableHead>
                                    <TableHead className="text-right">Cantidad</TableHead>
                                    <TableHead className="text-right">Precio Unitario</TableHead>
                                    <TableHead className="text-right">Total Línea</TableHead>
                                    <TableHead className="text-center">Cambio</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {history.map((item, index) => {
                                    const prevPrice = index < history.length - 1 ? Number(history[index + 1].precio_unitario) : null;
                                    const priceChange = prevPrice ? ((Number(item.precio_unitario) - prevPrice) / prevPrice) * 100 : null;
                                    return (
                                        <TableRow key={`${item.documento_id}-${index}`}>
                                            <TableCell>{formatDate(item.fecha_emision)}</TableCell>
                                            <TableCell className="font-mono text-sm">{item.numero_documento || 'Sin número'}</TableCell>
                                            <TableCell className="text-right">{item.cantidad} {item.unidad || 'ud'}</TableCell>
                                            <TableCell className="text-right font-semibold">{formatCurrency(item.precio_unitario)}</TableCell>
                                            <TableCell className="text-right">{formatCurrency(item.importe_linea)}</TableCell>
                                            <TableCell className="text-center">
                                                {priceChange !== null ? (
                                                    <TooltipProvider>
                                                        <Tooltip>
                                                            <TooltipTrigger asChild>
                                                                <Badge variant={priceChange > 0 ? "destructive" : priceChange < 0 ? "default" : "secondary"} className="text-xs cursor-help">
                                                                    {priceChange > 0 ? '+' : ''}{priceChange.toFixed(1)}%
                                                                </Badge>
                                                            </TooltipTrigger>
                                                            <TooltipContent>
                                                                <p>Variación respecto a la factura inmediatamente anterior.</p>
                                                            </TooltipContent>
                                                        </Tooltip>
                                                    </TooltipProvider>
                                                ) : <span className="text-xs text-muted-foreground">-</span>}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>
        </MainLayout>
    );
}