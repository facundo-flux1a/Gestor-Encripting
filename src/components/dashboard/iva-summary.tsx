'use client';

import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useState, useEffect } from 'react';

type ChartData = {
  name: string;
  ivaRepercutido: number;
  ivaSoportado: number;
};

const formatCurrency = (amount: number | string): string => {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return '0,00 €';

  const fixed = num.toFixed(2);
  const parts = fixed.split('.');
  const integerPart = parts[0];
  const decimalPart = parts[1];

  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  return `${formattedInteger},${decimalPart} €`;
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const total = payload[0].value - payload[1].value;
    return (
      <div className="rounded-lg border bg-background p-2 sm:p-3 shadow-lg shadow-primary/20 animate-in fade-in zoom-in duration-200">
        <p className="font-medium text-xs sm:text-sm bg-gradient-to-r from-primary to-violet-500 bg-clip-text text-transparent mb-1 sm:mb-2">
          {label}
        </p>
        <p className="text-xs sm:text-sm text-green-500 tabular-nums font-semibold">
          {`Repercutido: ${formatCurrency(payload[0].value)}`}
        </p>
        <p className="text-xs sm:text-sm text-red-500 tabular-nums font-semibold">
          {`Soportado: ${formatCurrency(payload[1].value)}`}
        </p>
        <hr className="my-1 sm:my-2 border-muted" />
        <p className="text-xs sm:text-sm font-bold tabular-nums text-foreground">
          {`Total: ${formatCurrency(total)}`}
        </p>
      </div>
    );
  }
  return null;
};

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function IvaSummary({
  annualData,
  quarterlyData,
  defaultYear
}: {
  annualData: ChartData[],
  quarterlyData: Record<string, ChartData[]>
  defaultYear?: string | null;
}) {
  const [activeBar, setActiveBar] = useState<string | null>(null);
  const [viewYear, setViewYear] = useState<string>('annual');

  // Sync internal state with defaultYear prop
  useEffect(() => {
    if (defaultYear) {
      setViewYear(defaultYear.toString());
    } else {
      setViewYear('annual');
    }
  }, [defaultYear]);

  // Obtener lista de años disponibles (ordenados descendente)
  const availableYears = Object.keys(quarterlyData).sort((a, b) => Number(b) - Number(a));

  // Determinar qué datos mostrar
  const currentData = viewYear === 'annual'
    ? annualData
    : (quarterlyData[viewYear] || []);

  return (
    <Card
      className="overflow-hidden hover:shadow-xl hover:shadow-primary/10 hover:scale-[1.02] transition-all duration-300 group"
      data-tutorial="iva-chart"
    >
      <CardHeader className="px-3 sm:px-6 py-3 sm:py-6 flex flex-row items-center justify-between space-y-0">
        <div className="flex flex-col space-y-1.5">
          <CardTitle className="text-base sm:text-lg lg:text-xl group-hover:text-primary transition-colors duration-300">
            Resumen de IVA
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm group-hover:text-foreground/70 transition-colors duration-300">
            {viewYear === 'annual' ? 'Comparativa anual de IVA' : `Desglose trimestral de IVA ${viewYear}`}
          </CardDescription>
        </div>
        <Select value={viewYear} onValueChange={setViewYear}>
          <SelectTrigger className="w-[100px] h-8 text-xs">
            <SelectValue placeholder="Año" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="annual">Anual</SelectItem>
            {availableYears.map(year => (
              <SelectItem key={year} value={year}>{year}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="pl-0 sm:pl-2 pr-3 sm:pr-6 pb-3 sm:pb-6">
        {currentData.length > 0 ? (
          <>
            {/* Mobile Chart */}
            <ResponsiveContainer width="100%" height={280} className="sm:hidden">
              <BarChart
                data={currentData}
                onMouseMove={(state) => {
                  if (state.isTooltipActive) {
                    setActiveBar(state.activeLabel || null);
                  }
                }}
                onMouseLeave={() => setActiveBar(null)}
              >
                <XAxis
                  dataKey="name"
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => new Intl.NumberFormat('es-ES', { notation: 'compact', compactDisplay: 'short' }).format(value)}
                  width={35}
                />
                <Tooltip
                  cursor={{ fill: 'hsl(var(--muted))', opacity: 0.3 }}
                  content={<CustomTooltip />}
                />
                <Bar
                  dataKey="ivaRepercutido"
                  name="Repercutido"
                  fill="#22c55e"
                  radius={[4, 4, 0, 0]}
                  className="hover:opacity-80 transition-opacity duration-200"
                  animationBegin={0}
                  animationDuration={800}
                  animationEasing="ease-out"
                />
                <Bar
                  dataKey="ivaSoportado"
                  name="Soportado"
                  fill="#ef4444"
                  radius={[4, 4, 0, 0]}
                  className="hover:opacity-80 transition-opacity duration-200"
                  animationBegin={100}
                  animationDuration={800}
                  animationEasing="ease-out"
                />
              </BarChart>
            </ResponsiveContainer>

            {/* Tablet Chart */}
            <ResponsiveContainer width="100%" height={320} className="hidden sm:block lg:hidden">
              <BarChart
                data={currentData}
                onMouseMove={(state) => {
                  if (state.isTooltipActive) {
                    setActiveBar(state.activeLabel || null);
                  }
                }}
                onMouseLeave={() => setActiveBar(null)}
              >
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
                  cursor={{ fill: 'hsl(var(--muted))', opacity: 0.3 }}
                  content={<CustomTooltip />}
                />
                <Legend
                  iconType="circle"
                  wrapperStyle={{ fontSize: '11px' }}
                />
                <Bar
                  dataKey="ivaRepercutido"
                  name="IVA Repercutido"
                  fill="#22c55e"
                  radius={[4, 4, 0, 0]}
                  className="hover:opacity-80 transition-opacity duration-200"
                  animationBegin={0}
                  animationDuration={800}
                  animationEasing="ease-out"
                />
                <Bar
                  dataKey="ivaSoportado"
                  name="IVA Soportado"
                  fill="#ef4444"
                  radius={[4, 4, 0, 0]}
                  className="hover:opacity-80 transition-opacity duration-200"
                  animationBegin={100}
                  animationDuration={800}
                  animationEasing="ease-out"
                />
              </BarChart>
            </ResponsiveContainer>

            {/* Desktop Chart */}
            <ResponsiveContainer width="100%" height={350} className="hidden lg:block">
              <BarChart
                data={currentData}
                onMouseMove={(state) => {
                  if (state.isTooltipActive) {
                    setActiveBar(state.activeLabel || null);
                  }
                }}
                onMouseLeave={() => setActiveBar(null)}
              >
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
                  cursor={{ fill: 'hsl(var(--muted))', opacity: 0.3 }}
                  content={<CustomTooltip />}
                />
                <Legend iconType="circle" />
                <Bar
                  dataKey="ivaRepercutido"
                  name="IVA Repercutido"
                  fill="#22c55e"
                  radius={[4, 4, 0, 0]}
                  className="hover:opacity-80 transition-opacity duration-200"
                  animationBegin={0}
                  animationDuration={800}
                  animationEasing="ease-out"
                />
                <Bar
                  dataKey="ivaSoportado"
                  name="IVA Soportado"
                  fill="#ef4444"
                  radius={[4, 4, 0, 0]}
                  className="hover:opacity-80 transition-opacity duration-200"
                  animationBegin={100}
                  animationDuration={800}
                  animationEasing="ease-out"
                />
              </BarChart>
            </ResponsiveContainer>
          </>
        ) : (
          <div className="flex h-[280px] sm:h-[320px] lg:h-[350px] w-full items-center justify-center text-muted-foreground text-xs sm:text-sm">
            <div className="text-center animate-pulse">
              <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-4 rounded-lg bg-muted flex items-center justify-center animate-bounce" style={{ animationDuration: '2s' }}>
                <div className="w-4/5 h-4/5 border-4 border-dashed border-muted-foreground/20 rounded" />
              </div>
              <p className="text-sm sm:text-base font-medium">No hay datos de IVA</p>
              <p className="text-xs sm:text-sm mt-1">Los datos aparecerán aquí cuando estén disponibles</p>
            </div>
          </div>
        )}
      </CardContent>

      <style jsx global>{`
        .recharts-bar-rectangle {
          transition: all 0.3s ease;
        }
        
        .recharts-bar-rectangle:hover {
          filter: brightness(1.2) drop-shadow(0 4px 8px rgba(0,0,0,0.2));
        }
      `}</style>
    </Card>
  );
}