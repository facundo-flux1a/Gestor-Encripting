'use client';

import { useMemo } from 'react';
import type { DocumentLine } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, ShoppingCart } from 'lucide-react';

const formatCurrency = (amount: number | string | null | undefined) => {
    if (amount === null || amount === undefined) return 'N/A';
    let numericAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    if (isNaN(numericAmount)) return 'N/A';
    return new Intl.NumberFormat('es-ES', { 
        style: 'currency', 
        currency: 'EUR' 
    }).format(numericAmount);
};

const formatDateForChart = (dateString: string | undefined | null) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'N/A';
    return date.toLocaleDateString('es-ES', { 
        year: '2-digit', 
        month: '2-digit', 
        day: '2-digit', 
        timeZone: 'UTC' 
    });
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-lg border bg-background p-2 sm:p-3 shadow-sm text-xs sm:text-sm">
        <p className="font-bold mb-1">{`Fecha: ${label}`}</p>
        {payload.map((pld: any, index: number) => (
          <div key={index} style={{ color: pld.color }} className="tabular-nums">
            {pld.name === 'Precio' && `${pld.name}: ${formatCurrency(pld.value)}`}
            {pld.name === 'Cantidad' && `${pld.name}: ${pld.value}`}
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export function ProductHistoryCharts({ history }: { history: DocumentLine[] }) {
    const chartData = useMemo(() => {
        return history
            .map(item => ({
                ...item,
                fecha: formatDateForChart(item.fecha_emision),
                precio_unitario: parseFloat(item.precio_unitario as any) || 0,
                cantidad: parseFloat(item.cantidad as any) || 0
            }))
            .sort((a, b) => new Date(a.fecha_emision!).getTime() - new Date(b.fecha_emision!).getTime());
    }, [history]);

    // 🎯 Determinar si usar BarChart (1-3 datos) o LineChart (4+)
    const useBarChart = chartData.length <= 3;

    return (
        <div className="grid gap-4 sm:gap-6 lg:gap-8 lg:grid-cols-2">
            {/* Chart 1 - Precio */}
            <Card>
                <CardHeader className="px-3 sm:px-6 py-3 sm:py-6">
                    <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                        <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 shrink-0 text-primary" />
                        <span className="truncate">Evolución del Precio Unitario</span>
                    </CardTitle>
                    <CardDescription className="text-xs sm:text-sm">
                        {chartData.length === 1 
                            ? 'Única compra registrada'
                            : `Historial de ${chartData.length} compras`
                        }
                    </CardDescription>
                </CardHeader>
                <CardContent className="px-2 sm:px-6 pb-3 sm:pb-6">
                    {chartData.length === 0 ? (
                        <div className="flex items-center justify-center h-[250px] sm:h-[300px] text-muted-foreground">
                            <p className="text-sm">No hay historial de precios</p>
                        </div>
                    ) : (
                        <>
                            {/* Mobile Chart */}
                            <ResponsiveContainer width="100%" height={250} className="sm:hidden">
                                {useBarChart ? (
                                    <BarChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                        <XAxis 
                                            dataKey="fecha" 
                                            stroke="hsl(var(--muted-foreground))" 
                                            fontSize={9}
                                            tickLine={false} 
                                            axisLine={false}
                                        />
                                        <YAxis 
                                            stroke="hsl(var(--muted-foreground))" 
                                            fontSize={9}
                                            tickLine={false} 
                                            axisLine={false}
                                            tickFormatter={(value) => `${(value).toFixed(0)}€`}
                                            width={35}
                                        />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Bar 
                                            dataKey="precio_unitario" 
                                            name="Precio"
                                            fill="hsl(var(--primary))"
                                            radius={[8, 8, 0, 0]}
                                            maxBarSize={80}
                                        />
                                    </BarChart>
                                ) : (
                                    <LineChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                        <XAxis 
                                            dataKey="fecha" 
                                            stroke="hsl(var(--muted-foreground))" 
                                            fontSize={9}
                                            tickLine={false} 
                                            axisLine={false}
                                            interval="preserveStartEnd"
                                        />
                                        <YAxis 
                                            stroke="hsl(var(--muted-foreground))" 
                                            fontSize={9}
                                            tickLine={false} 
                                            axisLine={false}
                                            tickFormatter={(value) => `${(value).toFixed(0)}€`}
                                            width={35}
                                        />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Line 
                                            type="monotone" 
                                            dataKey="precio_unitario" 
                                            name="Precio" 
                                            stroke="hsl(var(--primary))" 
                                            strokeWidth={2} 
                                            dot={{ r: 3 }} 
                                            activeDot={{ r: 5 }} 
                                        />
                                    </LineChart>
                                )}
                            </ResponsiveContainer>

                            {/* Desktop Chart */}
                            <ResponsiveContainer width="100%" height={300} className="hidden sm:block">
                                {useBarChart ? (
                                    <BarChart data={chartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                        <XAxis 
                                            dataKey="fecha" 
                                            stroke="hsl(var(--muted-foreground))" 
                                            fontSize={12}
                                            tickLine={false} 
                                            axisLine={false} 
                                        />
                                        <YAxis 
                                            stroke="hsl(var(--muted-foreground))" 
                                            fontSize={12}
                                            tickLine={false} 
                                            axisLine={false}
                                            tickFormatter={(value) => formatCurrency(value as number)} 
                                        />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Legend iconType="square" wrapperStyle={{ fontSize: '12px' }} />
                                        <Bar 
                                            dataKey="precio_unitario" 
                                            name="Precio"
                                            fill="hsl(var(--primary))"
                                            radius={[8, 8, 0, 0]}
                                            maxBarSize={100}
                                        />
                                    </BarChart>
                                ) : (
                                    <LineChart data={chartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                        <XAxis 
                                            dataKey="fecha" 
                                            stroke="hsl(var(--muted-foreground))" 
                                            fontSize={12}
                                            tickLine={false} 
                                            axisLine={false} 
                                        />
                                        <YAxis 
                                            stroke="hsl(var(--muted-foreground))" 
                                            fontSize={12}
                                            tickLine={false} 
                                            axisLine={false}
                                            tickFormatter={(value) => formatCurrency(value as number)} 
                                        />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
                                        <Line 
                                            type="monotone" 
                                            dataKey="precio_unitario" 
                                            name="Precio" 
                                            stroke="hsl(var(--primary))" 
                                            strokeWidth={2} 
                                            dot={{ r: 4 }} 
                                            activeDot={{ r: 6 }} 
                                        />
                                    </LineChart>
                                )}
                            </ResponsiveContainer>
                        </>
                    )}
                </CardContent>
            </Card>

            {/* Chart 2 - Cantidad */}
            <Card>
                <CardHeader className="px-3 sm:px-6 py-3 sm:py-6">
                    <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                        <ShoppingCart className="h-4 w-4 sm:h-5 sm:w-5 shrink-0 text-primary" />
                        <span className="truncate">Historial de Cantidad Comprada</span>
                    </CardTitle>
                    <CardDescription className="text-xs sm:text-sm">
                        {chartData.length === 1 
                            ? 'Única compra registrada'
                            : `Volumen en ${chartData.length} compras`
                        }
                    </CardDescription>
                </CardHeader>
                <CardContent className="px-2 sm:px-6 pb-3 sm:pb-6">
                    {chartData.length === 0 ? (
                        <div className="flex items-center justify-center h-[250px] sm:h-[300px] text-muted-foreground">
                            <p className="text-sm">No hay historial de cantidades</p>
                        </div>
                    ) : (
                        <>
                            {/* Mobile Chart */}
                            <ResponsiveContainer width="100%" height={250} className="sm:hidden">
                                {useBarChart ? (
                                    <BarChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                        <XAxis 
                                            dataKey="fecha" 
                                            stroke="hsl(var(--muted-foreground))" 
                                            fontSize={9}
                                            tickLine={false} 
                                            axisLine={false}
                                        />
                                        <YAxis 
                                            stroke="hsl(var(--muted-foreground))" 
                                            fontSize={9}
                                            tickLine={false} 
                                            axisLine={false}
                                            width={30}
                                        />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Bar 
                                            dataKey="cantidad" 
                                            name="Cantidad"
                                            fill="hsl(var(--chart-3))"
                                            radius={[8, 8, 0, 0]}
                                            maxBarSize={80}
                                        />
                                    </BarChart>
                                ) : (
                                    <LineChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                        <XAxis 
                                            dataKey="fecha" 
                                            stroke="hsl(var(--muted-foreground))" 
                                            fontSize={9}
                                            tickLine={false} 
                                            axisLine={false}
                                            interval="preserveStartEnd"
                                        />
                                        <YAxis 
                                            stroke="hsl(var(--muted-foreground))" 
                                            fontSize={9}
                                            tickLine={false} 
                                            axisLine={false}
                                            width={30}
                                        />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Line 
                                            type="monotone" 
                                            dataKey="cantidad" 
                                            name="Cantidad" 
                                            stroke="hsl(var(--chart-3))" 
                                            strokeWidth={2} 
                                            dot={{ r: 3 }} 
                                            activeDot={{ r: 5 }} 
                                        />
                                    </LineChart>
                                )}
                            </ResponsiveContainer>

                            {/* Desktop Chart */}
                            <ResponsiveContainer width="100%" height={300} className="hidden sm:block">
                                {useBarChart ? (
                                    <BarChart data={chartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                        <XAxis 
                                            dataKey="fecha" 
                                            stroke="hsl(var(--muted-foreground))" 
                                            fontSize={12}
                                            tickLine={false} 
                                            axisLine={false} 
                                        />
                                        <YAxis 
                                            stroke="hsl(var(--muted-foreground))" 
                                            fontSize={12}
                                            tickLine={false} 
                                            axisLine={false} 
                                        />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Legend iconType="square" wrapperStyle={{ fontSize: '12px' }} />
                                        <Bar 
                                            dataKey="cantidad" 
                                            name="Cantidad"
                                            fill="hsl(var(--chart-3))"
                                            radius={[8, 8, 0, 0]}
                                            maxBarSize={100}
                                        />
                                    </BarChart>
                                ) : (
                                    <LineChart data={chartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                        <XAxis 
                                            dataKey="fecha" 
                                            stroke="hsl(var(--muted-foreground))" 
                                            fontSize={12}
                                            tickLine={false} 
                                            axisLine={false} 
                                        />
                                        <YAxis 
                                            stroke="hsl(var(--muted-foreground))" 
                                            fontSize={12}
                                            tickLine={false} 
                                            axisLine={false} 
                                        />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
                                        <Line 
                                            type="monotone" 
                                            dataKey="cantidad" 
                                            name="Cantidad" 
                                            stroke="hsl(var(--chart-3))" 
                                            strokeWidth={2} 
                                            dot={{ r: 4 }} 
                                            activeDot={{ r: 6 }} 
                                        />
                                    </LineChart>
                                )}
                            </ResponsiveContainer>
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}