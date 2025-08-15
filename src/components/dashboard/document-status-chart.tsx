
'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ResponsiveContainer, Treemap, Tooltip } from 'recharts';

type ChartData = {
  name: string;
  value: number;
};

const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

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

const CustomizedContent = (props: any) => {
    const { root, depth, x, y, width, height, index, name, value } = props;
    
    // Only render text if the box is large enough
    const isVisible = width > 50 && height > 25;

    return (
        <g>
            <rect
                x={x}
                y={y}
                width={width}
                height={height}
                style={{
                    fill: COLORS[index % COLORS.length],
                    stroke: 'hsl(var(--background))',
                    strokeWidth: 2,
                    strokeOpacity: 1,
                }}
            />
            {isVisible && (
                <text
                    x={x + width / 2}
                    y={y + height / 2}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="fill-primary-foreground text-sm font-medium"
                >
                    {name}
                </text>
            )}
             {isVisible && (
                 <text
                    x={x + width / 2}
                    y={y + height / 2 + 16}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="fill-primary-foreground/70 text-xs"
                >
                    {value}
                </text>
            )}
        </g>
    );
};


export function DocumentStatusChart({ data }: { data: ChartData[] }) {
  const totalDocuments = data.reduce((acc, curr) => acc + curr.value, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Distribución de Documentos</CardTitle>
        <CardDescription>
          Mosaico proporcional de cada tipo de documento. Total: {totalDocuments}.
        </CardDescription>
      </CardHeader>
      <CardContent className="pl-0 pr-0 pb-0">
         {data.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <Treemap
                data={data}
                dataKey="value"
                ratio={4 / 3}
                stroke="#fff"
                fill="hsl(var(--primary))"
                content={<CustomizedContent />}
              >
                <Tooltip content={<CustomTooltip />} />
              </Treemap>
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
