'use client';

import type { DocumentEntity } from "@/lib/types";
import { StatsCard } from "./stats-card";
import { Euro, Package, ShoppingCart, Hash, TrendingUp, Info } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar } from "recharts";

export type ProviderAnalyticsData = {
    provider: DocumentEntity;
    totalSpent: number;
    totalProductsSpent: number;
    totalDocuments: number;
    uniqueProducts: number;
    averagePurchaseValue: number;
    topProductsBySpend: {
        codigo: string;
        descripcion: string;
        total: number;
    }[];
    monthlySpend: {
        month: string;
        total: number;
    }[];
};

interface ProviderAnalyticsProps {
    data: ProviderAnalyticsData;
}

// 🎯 FUNCIÓN DE FORMATO MANUAL
const formatCurrency = (amount: number | string | null | undefined, minimumFractionDigits = 2): string => {
    if (amount === null || amount === undefined) return '0,00 €';

    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    if (isNaN(num)) return '0,00 €';

    const fixed = num.toFixed(minimumFractionDigits);
    const parts = fixed.split('.');
    const integerPart = parts[0];
    const decimalPart = parts[1];

    const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

    if (minimumFractionDigits === 0) {
        return `${formattedInteger} €`;
    }

    return `${formattedInteger},${decimalPart} €`;
};

const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        // Formatear label como "Mes Año"
        const [year, month] = label.split('-');
        const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        const formattedLabel = `${monthNames[parseInt(month) - 1]} ${year}`;

        return (
            <div className="rounded-lg border bg-background p-2 sm:p-3 shadow-sm max-w-[200px]">
                <p className="font-semibold text-xs sm:text-sm break-words">{formattedLabel}</p>
                <p className="text-primary text-xs sm:text-sm tabular-nums">
                    {formatCurrency(payload[0].value)}
                </p>
            </div>
        );
    }
    return null;
};

export function ProviderAnalytics({ data }: ProviderAnalyticsProps) {
    // 🎯 Determinar tipo de gráfico según cantidad de datos
    const monthCount = data.monthlySpend.length;
    const useBarChart = monthCount === 1; // Si solo hay 1 mes, usar barra

    return (
        <div className="space-y-4 sm:space-y-6 lg:space-y-8">
            {/* KPIs */}
            <section className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
                <div className="relative group cursor-help z-50">
                    <div className="h-full rounded-xl transition-all duration-300">
                        <StatsCard
                            title="Gasto Total"
                            value={formatCurrency(data.totalSpent)}
                            icon={Euro}
                            description="Suma histórica de compras"
                        />
                    </div>
                    {Math.abs(data.totalSpent - (data.totalProductsSpent || 0)) > 0.01 && (
                        <>
                            <div className="absolute top-3 right-3 flex items-center gap-1.5 opacity-40 group-hover:opacity-100 transition-opacity">
                                <Info className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                            </div>
                            <div className="absolute top-[80%] right-0 mt-3 w-72 p-4 bg-popover border border-border shadow-2xl rounded-lg text-xs invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-all pointer-events-none z-[60]">
                                <p className="font-bold text-sm mb-2 text-foreground border-b border-border/50 pb-2">Desglose Contable</p>
                                <p className="text-muted-foreground mb-3 leading-relaxed">
                                    El <strong>Gasto Total</strong> arriba indica la salida de caja final facturada (contiene todos los impuestos, recargos y descuentos del pie de factura).
                                </p>
                                <div className="space-y-1.5 font-mono bg-muted/20 p-2 rounded-md">
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Valor Productos (Base):</span>
                                        <span className="text-primary font-semibold">{formatCurrency(data.totalProductsSpent)}</span>
                                    </div>
                                    <div className="flex justify-between border-t border-border/50 pt-1.5 mt-1.5">
                                        <span className="text-muted-foreground">Impuestos / Retenciones:</span>
                                        <span className="text-orange-500 font-semibold">{formatCurrency(data.totalSpent - (data.totalProductsSpent || 0))}</span>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>
                <StatsCard
                    title="Documentos Totales"
                    value={data.totalDocuments.toString()}
                    icon={ShoppingCart}
                    description="Facturas y otros documentos"
                />
                <StatsCard
                    title="Productos Únicos"
                    value={data.uniqueProducts.toString()}
                    icon={Package}
                    description="Productos distintos comprados"
                />
                <StatsCard
                    title="Gasto Promedio / Doc."
                    value={formatCurrency(data.averagePurchaseValue)}
                    icon={Hash}
                    description="Valor medio por documento"
                />
            </section>

            {/* Charts */}
            <section className="grid gap-4 sm:gap-6 lg:gap-8 lg:grid-cols-5">
                {/* ✅ Purchase History Chart - Adaptable según cantidad de datos */}
                <div className="lg:col-span-3">
                    <Card className="h-full transition-all duration-300 hover:shadow-xl hover:shadow-primary/10">
                        <CardHeader className="px-3 sm:px-6 py-3 sm:py-6">
                            <CardTitle className="text-base sm:text-lg bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text flex items-center gap-2">
                                <TrendingUp className="h-5 w-5" />
                                Evolución del Gasto Mensual
                            </CardTitle>
                            <CardDescription className="text-xs sm:text-sm">
                                {monthCount === 1
                                    ? 'Único mes con compras registradas'
                                    : `Historial de compras con este proveedor (${monthCount} meses)`
                                }
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="px-2 sm:px-6 pb-3 sm:pb-6">
                            {data.monthlySpend.length > 0 ? (
                                <ResponsiveContainer width="100%" height={300}>
                                    {useBarChart ? (
                                        // 📊 Gráfico de barras para 1 solo mes
                                        <BarChart
                                            data={data.monthlySpend}
                                            margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                                        >
                                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                                            <XAxis
                                                dataKey="month"
                                                stroke="hsl(var(--muted-foreground))"
                                                fontSize={12}
                                                tickFormatter={(value) => {
                                                    const [year, month] = value.split('-');
                                                    const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
                                                    return `${monthNames[parseInt(month) - 1]} ${year}`;
                                                }}
                                            />
                                            <YAxis
                                                stroke="hsl(var(--muted-foreground))"
                                                fontSize={12}
                                                tickFormatter={(value) => formatCurrency(value, 0)}
                                            />
                                            <Tooltip content={<CustomTooltip />} />
                                            <Bar
                                                dataKey="total"
                                                fill="hsl(var(--primary))"
                                                radius={[8, 8, 0, 0]}
                                                maxBarSize={100}
                                            />
                                        </BarChart>
                                    ) : (
                                        // 📈 Gráfico de líneas para 2+ meses
                                        <LineChart
                                            data={data.monthlySpend}
                                            margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                                        >
                                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                                            <XAxis
                                                dataKey="month"
                                                stroke="hsl(var(--muted-foreground))"
                                                fontSize={12}
                                                tickFormatter={(value) => {
                                                    const [year, month] = value.split('-');
                                                    return `${month}/${year.slice(2)}`;
                                                }}
                                            />
                                            <YAxis
                                                stroke="hsl(var(--muted-foreground))"
                                                fontSize={12}
                                                tickFormatter={(value) => {
                                                    if (value >= 1000) return `${(value / 1000).toFixed(0)}k €`;
                                                    return `${value} €`;
                                                }}
                                            />
                                            <Tooltip content={<CustomTooltip />} />
                                            <Line
                                                type="monotone"
                                                dataKey="total"
                                                stroke="hsl(var(--primary))"
                                                strokeWidth={3}
                                                dot={{ fill: 'hsl(var(--primary))', r: 5 }}
                                                activeDot={{ r: 7 }}
                                            />
                                        </LineChart>
                                    )}
                                </ResponsiveContainer>
                            ) : (
                                <div className="flex h-[300px] items-center justify-center text-muted-foreground">
                                    <div className="text-center space-y-2">
                                        <TrendingUp className="h-12 w-12 mx-auto text-muted-foreground/50" />
                                        <p className="text-xs sm:text-sm">No hay historial de compras.</p>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* Top Products */}
                <div className="lg:col-span-2">
                    <Card className="h-full">
                        <CardHeader className="px-3 sm:px-6 py-3 sm:py-6">
                            <CardTitle className="text-base sm:text-lg">Top 5 Productos</CardTitle>
                            <CardDescription className="text-xs sm:text-sm">
                                Productos con mayor gasto
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="px-3 sm:px-6">
                            {data.topProductsBySpend.length > 0 ? (
                                <div className="space-y-3">
                                    {data.topProductsBySpend.map((product, index) => (
                                        <div key={product.codigo} className="flex items-center justify-between gap-2">
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium truncate">{product.descripcion}</p>
                                                <p className="text-xs text-muted-foreground">{product.codigo}</p>
                                            </div>
                                            <p className="text-sm font-semibold tabular-nums whitespace-nowrap">
                                                {formatCurrency(product.total, 0)}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="flex h-[200px] items-center justify-center text-muted-foreground">
                                    <p className="text-xs sm:text-sm">No hay productos registrados</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </section>
        </div>
    );
}