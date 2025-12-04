'use client';

import { Line, LineChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

type ChartData = {
  name: string;
  sales: number;
  expenses: number;
};

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount);
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-lg border bg-background p-2 sm:p-3 shadow-sm">
        <div className="flex flex-col space-y-1">
          <span className="text-xs sm:text-sm text-muted-foreground font-medium">
            {label}
          </span>
          <span className="font-bold text-primary text-xs sm:text-sm tabular-nums">
            Ingresos: {formatCurrency(payload[0].value)}
          </span>
          <span className="font-bold text-destructive text-xs sm:text-sm tabular-nums">
            Gastos: {formatCurrency(payload[1].value)}
          </span>
        </div>
      </div>
    );
  }

  return null;
};

export function TimeSeriesChart({ data }: { data: ChartData[] }) {
  return (
    <Card>
      <CardHeader className="px-3 sm:px-6 py-3 sm:py-6">
        <CardTitle className="text-base sm:text-lg lg:text-xl">
          Evolución de Ingresos y Gastos
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm">
          Comparativa temporal de la actividad financiera.
        </CardDescription>
      </CardHeader>
      <CardContent className="pl-0 sm:pl-2 pr-3 sm:pr-6 pb-3 sm:pb-6">
        {data.length > 0 ? (
          <>
            {/* Mobile Chart */}
            <ResponsiveContainer width="100%" height={250} className="sm:hidden">
              <LineChart data={data}>
                <XAxis
                  dataKey="name"
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
                  tickFormatter={(value) => `${(value/1000).toFixed(0)}k`}
                  width={35}
                />
                <Tooltip 
                  cursor={{ fill: 'hsl(var(--muted))' }} 
                  content={<CustomTooltip />} 
                />
                <Line 
                  type="monotone" 
                  dataKey="sales" 
                  name="Ingresos" 
                  stroke="hsl(var(--primary))" 
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
                <Line 
                  type="monotone" 
                  dataKey="expenses" 
                  name="Gastos" 
                  stroke="hsl(var(--destructive))" 
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>

            {/* Tablet Chart */}
            <ResponsiveContainer width="100%" height={280} className="hidden sm:block lg:hidden">
              <LineChart data={data}>
                <XAxis
                  dataKey="name"
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => formatCurrency(value as number)}
                  width={60}
                />
                <Tooltip 
                  cursor={{ fill: 'hsl(var(--muted))' }} 
                  content={<CustomTooltip />} 
                />
                <Legend 
                  iconType="circle"
                  wrapperStyle={{ fontSize: '11px' }}
                />
                <Line 
                  type="monotone" 
                  dataKey="sales" 
                  name="Ventas / Ingresos" 
                  stroke="hsl(var(--primary))" 
                  strokeWidth={2}
                  dot={{ r: 3.5 }}
                  activeDot={{ r: 5.5 }}
                />
                <Line 
                  type="monotone" 
                  dataKey="expenses" 
                  name="Gastos" 
                  stroke="hsl(var(--destructive))" 
                  strokeWidth={2}
                  dot={{ r: 3.5 }}
                  activeDot={{ r: 5.5 }}
                />
              </LineChart>
            </ResponsiveContainer>

            {/* Desktop Chart */}
            <ResponsiveContainer width="100%" height={300} className="hidden lg:block">
              <LineChart data={data}>
                <XAxis
                  dataKey="name"
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
                <Tooltip 
                  cursor={{ fill: 'hsl(var(--muted))' }} 
                  content={<CustomTooltip />} 
                />
                <Legend iconType="circle" />
                <Line 
                  type="monotone" 
                  dataKey="sales" 
                  name="Ventas / Ingresos" 
                  stroke="hsl(var(--primary))" 
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                />
                <Line 
                  type="monotone" 
                  dataKey="expenses" 
                  name="Gastos" 
                  stroke="hsl(var(--destructive))" 
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </>
        ) : (
          <div className="flex h-[250px] sm:h-[280px] lg:h-[300px] w-full items-center justify-center text-muted-foreground text-xs sm:text-sm">
            No hay datos para mostrar.
          </div>
        )}
      </CardContent>
    </Card>
  );
}