
'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';

type ChartData = {
  name: string;
  value: number;
};

const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--vat-other))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="rounded-lg border bg-background p-2 shadow-sm">
        <p className="font-bold">{data.name}</p>
        <p className="text-sm text-muted-foreground">Documentos: {data.value}</p>
      </div>
    );
  }
  return null;
};


export function DocumentStatusChart({ data }: { data: ChartData[] }) {
  const totalDocuments = data.reduce((acc, curr) => acc + curr.value, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Distribución de Documentos</CardTitle>
        <CardDescription>
          Proporción de cada tipo de documento. Total: {totalDocuments}.
        </CardDescription>
      </CardHeader>
      <CardContent className="pl-0 pr-0 pb-0">
         {data.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                    <Tooltip content={<CustomTooltip />} />
                    <Legend iconType="circle" />
                    <Pie
                        data={data}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        paddingAngle={5}
                        fill="hsl(var(--primary))"
                        labelLine={false}
                    >
                        {data.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                    </Pie>
                </PieChart>
            </ResponsiveContainer>
         ) : (
            <div className="flex h-[300px] w-full items-center justify-center text-muted-foreground">
              No hay datos de documentos para mostrar.
            </div>
         )}
      </CardContent>
    </Card>
  );
}
