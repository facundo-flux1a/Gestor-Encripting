
'use client';

import type { DocumentEntity } from "@/lib/types";
import { StatsCard } from "./stats-card";
import { Euro, Package, ShoppingCart, Hash, BarChart3 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { ResponsiveContainer, BarChart, XAxis, YAxis, Tooltip, Bar, LabelList } from "recharts";
import { ProviderPurchaseHistory } from "./provider-purchase-history";

export type ProviderAnalyticsData = {
    provider: DocumentEntity;
    totalSpent: number;
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

const formatCurrency = (amount: number, minimumFractionDigits = 2) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits }).format(amount);

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-lg border bg-background p-2 shadow-sm">
        <p className="font-semibold">{label}</p>
        <p className="text-primary">{formatCurrency(payload[0].value)}</p>
      </div>
    );
  }
  return null;
};

export function ProviderAnalytics({ data }: ProviderAnalyticsProps) {
    
    return (
        <div className="space-y-8">
            {/* KPIs */}
            <section className="grid gap-4 md:grid-cols-4">
                <StatsCard 
                    title="Gasto Total" 
                    value={formatCurrency(data.totalSpent)} 
                    icon={Euro}
                    description="Suma histórica de compras"
                />
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
            <section className="grid gap-8 md:grid-cols-1 lg:grid-cols-5">
                <div className="lg:col-span-3">
                    <ProviderPurchaseHistory data={data.monthlySpend} />
                </div>
                 <div className="lg:col-span-2">
                    <Card className="h-full">
                        <CardHeader>
                            <CardTitle>Top 5 Productos por Gasto</CardTitle>
                            <CardDescription>Productos con mayor volumen de gasto de este proveedor.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <ResponsiveContainer width="100%" height={350}>
                                <BarChart 
                                    layout="vertical" 
                                    data={data.topProductsBySpend} 
                                    margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
                                >
                                    <XAxis type="number" hide />
                                    <YAxis 
                                        type="category" 
                                        dataKey="descripcion" 
                                        stroke="hsl(var(--muted-foreground))"
                                        fontSize={12}
                                        tickLine={false}
                                        axisLine={false}
                                        width={120}
                                        tickFormatter={value => value.length > 15 ? `${value.substring(0, 15)}...` : value}
                                    />
                                    <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} content={<CustomTooltip />} />
                                    <Bar dataKey="total" name="Total Gastado" radius={[0, 4, 4, 0]} fill="hsl(var(--primary))">
                                        <LabelList 
                                            dataKey="total" 
                                            position="right" 
                                            formatter={(value: number) => formatCurrency(value, 0)} 
                                            className="font-semibold text-sm"
                                            style={{ fill: 'hsl(var(--foreground))' }}
                                        />
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>
                </div>
            </section>
        </div>
    );
}
