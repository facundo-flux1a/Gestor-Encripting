
'use client';

import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, LabelList, Cell } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useRouter } from 'next/navigation';

type ChartData = {
  name: string;
  total: number;
  fiscalId: string;
};

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-lg border bg-background p-2 shadow-sm">
        <p className="font-semibold">{label}</p>
        <p className="text-primary">{new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(payload[0].value)}</p>
      </div>
    );
  }
  return null;
};

export function TotalsByProviderChart({ data }: { data: ChartData[] }) {
  const router = useRouter();

  const handleBarClick = (payload: any) => {
    if (payload && payload.activePayload && payload.activePayload[0]) {
      const { fiscalId } = payload.activePayload[0].payload;
      if (fiscalId) {
        router.push(`/proveedores/${encodeURIComponent(fiscalId)}`);
      }
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top 5 Proveedores por Gasto</CardTitle>
        <CardDescription>Muestra los proveedores con mayor volumen de gasto. Haz clic en una barra para ver detalles.</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={350}>
          <BarChart 
            layout="vertical" 
            data={data} 
            margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
            onClick={handleBarClick}
          >
            <XAxis type="number" hide />
            <YAxis 
              type="category" 
              dataKey="name" 
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
              tickLine={false}
              axisLine={false}
              width={120}
              tickFormatter={value => value.length > 15 ? `${value.substring(0, 15)}...` : value}
            />
            <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} content={<CustomTooltip />} />
            <Bar dataKey="total" name="Total Gastado" radius={[0, 4, 4, 0]}>
              {data.map((entry, index) => (
                 <Cell 
                  key={`cell-${index}`} 
                  fill="hsl(var(--primary))" 
                  className="cursor-pointer"
                  style={{ opacity: 1 - (index * 0.1) }}
                />
              ))}
              <LabelList 
                dataKey="total" 
                position="right" 
                formatter={(value: number) => formatCurrency(value)} 
                className="font-semibold"
                style={{ fill: 'hsl(var(--foreground))' }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
