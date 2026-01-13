'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import type { DocumentLine } from '@/lib/types';

interface ProductPriceChartProps {
    history: DocumentLine[];
}

const formatDate = (date: string | null | undefined) => {
    if (!date) return '';
    try {
        const d = new Date(date);
        const utcDate = new Date(d.valueOf() + d.getTimezoneOffset() * 60 * 1000);
        return new Intl.DateTimeFormat('es-ES', {
            month: 'short',
            day: 'numeric',
        }).format(utcDate);
    } catch {
        return '';
    }
};

const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-ES', {
        style: 'currency',
        currency: 'EUR',
    }).format(value);
};

export function ProductPriceChart({ history }: ProductPriceChartProps) {
    const sortedHistory = [...history].reverse();

    const chartData = sortedHistory.map((item) => ({
        fecha: formatDate(item.fecha_emision),
        precio: Number(item.precio_unitario) || 0,
        fechaCompleta: item.fecha_emision,
        documento: item.numero_documento,
    }));

    return (
        <ResponsiveContainer width="100%" height={350}>
            <LineChart
                data={chartData}
                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
            >
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                    dataKey="fecha" 
                    className="text-xs"
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                />
                <YAxis 
                    className="text-xs"
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                    tickFormatter={(value) => `${value.toFixed(2)}€`}
                />
                <Tooltip
                    contentStyle={{
                        backgroundColor: 'hsl(var(--background))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                    }}
                    formatter={(value: number) => [formatCurrency(value), 'Precio']}
                    labelFormatter={(label, payload) => {
                        if (payload && payload.length > 0) {
                            const item = payload[0].payload;
                            return `${item.fechaCompleta} - ${item.documento || 'Sin documento'}`;
                        }
                        return label;
                    }}
                />
                <Legend />
                <Line
                    type="monotone"
                    dataKey="precio"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={{ fill: 'hsl(var(--primary))', r: 4 }}
                    activeDot={{ r: 6 }}
                    name="Precio Unitario"
                />
            </LineChart>
        </ResponsiveContainer>
    );
}