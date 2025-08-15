
'use client';

import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

type ChartData = {
  name: string;
  value: number;
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-lg border bg-background p-2 shadow-sm">
        <div className="grid grid-cols-1 gap-1">
          <span className="text-sm font-bold text-muted-foreground">{label}</span>
          <span className="font-bold" style={{ color: 'hsl(var(--chart-1))' }}>
            Documentos: {payload[0].value}
          </span>
        </div>
      </div>
    );
  }
  return null;
};


export function DocumentStatusChart({ data }: { data: ChartData[] }) {
  // Radar chart works best with at least 3 points
  const chartData = data.length < 3 
    ? [...data, ...Array(3 - data.length).fill({ name: '', value: 0 })]
    : data;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Distribución de Documentos</CardTitle>
        <CardDescription>Cantidad de cada tipo de documento en el total.</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <RadarChart cx="50%" cy="50%" outerRadius="80%" data={chartData}>
            <PolarGrid />
            <PolarAngleAxis dataKey="name" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
            <Radar name="Documentos" dataKey="value" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.6} />
            <Tooltip content={<CustomTooltip />} />
            <Legend iconType="circle" />
          </RadarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
