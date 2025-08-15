
'use client';

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell, Legend } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

type ChartData = {
  name: string;
  value: number;
};

const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-lg border bg-background p-2 shadow-sm">
        <div className="grid grid-cols-1 gap-1">
          <span className="text-sm font-bold text-muted-foreground">{label}</span>
          <span className="font-bold" style={{ color: payload[0].fill }}>
            Documentos: {payload[0].value}
          </span>
        </div>
      </div>
    );
  }
  return null;
};

export function DocumentStatusChart({ data }: { data: ChartData[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Distribución de Documentos</CardTitle>
        <CardDescription>Cantidad de cada tipo de documento en el total.</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart 
            layout="vertical"
            data={data}
            margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
          >
            <XAxis
              type="number"
              stroke="#888888"
              fontSize={12}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              stroke="#888888"
              fontSize={12}
              tickLine={false}
              axisLine={false}
              width={100}
              tickFormatter={value => value.length > 12 ? `${value.substring(0, 12)}...` : value}
            />
            <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} content={<CustomTooltip />} />
            <Bar dataKey="value" name="Documentos" radius={[0, 4, 4, 0]}>
                {data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
