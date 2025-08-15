
'use client';

import { useMemo } from 'react';
import type { DocumentLine } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { LineChart, BarChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, ShoppingCart } from 'lucide-react';

const formatCurrency = (amount: number | string | null | undefined) => {
    if (amount === null || amount === undefined) return 'N/A';
    let numericAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    if (isNaN(numericAmount)) return 'N/A';
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(numericAmount);
};

const formatDateForChart = (dateString: string | undefined | null) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'N/A';
    // consistent formatting for charts
    return date.toLocaleDateString('es-ES', { year: '2-digit', month: '2-digit', day: '2-digit', timeZone: 'UTC' });
};


const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-lg border bg-background p-2 shadow-sm text-sm">
        <p className="font-bold mb-1">{`Fecha: ${label}`}</p>
        {payload.map((pld: any, index: number) => (
            <div key={index} style={{ color: pld.color }}>
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
            }))
            .sort((a, b) => new Date(a.fecha_emision!).getTime() - new Date(b.fecha_emision!).getTime());
    }, [history]);

    return (
        <div className="grid gap-8 lg:grid-cols-2">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <TrendingUp className="h-5 w-5 text-primary" />
                        Evolución del Precio Unitario
                    </CardTitle>
                    <CardDescription>
                        Seguimiento del precio del producto a lo largo del tiempo.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={chartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="fecha" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                            <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => formatCurrency(value as number)} />
                            <Tooltip content={<CustomTooltip />} />
                            <Legend iconType="circle" />
                            <Line type="monotone" dataKey="precio_unitario" name="Precio" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                        </LineChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <ShoppingCart className="h-5 w-5 text-primary" />
                        Historial de Cantidad Comprada
                    </CardTitle>
                     <CardDescription>
                        Volumen de unidades compradas en cada transacción.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={chartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="fecha" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                            <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                            <Tooltip content={<CustomTooltip />} />
                            <Legend iconType="circle" />
                            <Line type="monotone" dataKey="cantidad" name="Cantidad" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                        </LineChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>
        </div>
    );
}
