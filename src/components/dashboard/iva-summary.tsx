
'use client';

import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type ChartData = {
  name: string;
  ivaRepercutido: number;
  ivaSoportado: number;
};

const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
  };
  
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const total = payload[0].value - payload[1].value;
      return (
        <div className="rounded-lg border bg-background p-2 shadow-sm">
            <p className="font-bold text-lg mb-2">{label}</p>
            <p className="text-sm text-blue-500">{`Repercutido: ${formatCurrency(payload[0].value)}`}</p>
            <p className="text-sm text-orange-500">{`Soportado: ${formatCurrency(payload[1].value)}`}</p>
            <hr className="my-2" />
            <p className="text-sm font-bold">{`Total: ${formatCurrency(total)}`}</p>
        </div>
      );
    }
  
    return null;
  };

export function IvaSummary({ data }: { data: ChartData[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Resumen de IVA Trimestral</CardTitle>
      </CardHeader>
      <CardContent className="pl-2">
        <ResponsiveContainer width="100%" height={350}>
            <BarChart data={data}>
                <XAxis
                dataKey="name"
                stroke="#888888"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                />
                <YAxis
                stroke="#888888"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => formatCurrency(value as number)}
                />
                <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} content={<CustomTooltip />} />
                <Legend iconType="circle" />
                <Bar dataKey="ivaRepercutido" name="IVA Repercutido" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="ivaSoportado" name="IVA Soportado" fill="hsl(var(--vat-10))" radius={[4, 4, 0, 0]} />
            </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

    