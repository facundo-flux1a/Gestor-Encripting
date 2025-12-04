'use client';

import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useState } from 'react';

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
      <div className="rounded-lg border bg-background p-2 sm:p-3 shadow-lg shadow-primary/20 animate-in fade-in zoom-in duration-200">
        <div className="flex flex-col space-y-1">
          <span className="text-xs sm:text-sm font-medium bg-gradient-to-r from-primary to-violet-500 bg-clip-text text-transparent">
            {label}
          </span>
          <span 
            className="font-bold text-xs sm:text-sm tabular-nums" 
            style={{ color: 'hsl(var(--chart-1))' }}
          >
            Ingresos: {formatCurrency(payload[0].value)}
          </span>
          <span 
            className="font-bold text-xs sm:text-sm tabular-nums" 
            style={{ color: 'hsl(var(--chart-2))' }}
          >
            Gastos: {formatCurrency(payload[1].value)}
          </span>
        </div>
      </div>
    );
  }

  return null;
};

export function FinancialSummary({ data }: { data: ChartData[] }) {
  const [activeBar, setActiveBar] = useState<string | null>(null);

  return (
    <Card className="overflow-hidden hover:shadow-xl hover:shadow-primary/10 hover:scale-[1.02] transition-all duration-300 group">
      <CardHeader className="px-3 sm:px-6 py-3 sm:py-6">
        <CardTitle className="text-base sm:text-lg lg:text-xl group-hover:text-primary transition-colors duration-300">
          Resumen Financiero Trimestral
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm group-hover:text-foreground/70 transition-colors duration-300">
          Ingresos y gastos registrados en cada trimestre fiscal.
        </CardDescription>
      </CardHeader>
      <CardContent className="pl-0 sm:pl-2 pr-3 sm:pr-6 pb-3 sm:pb-6">
        {data.length > 0 ? (
          <ResponsiveContainer 
            width="100%" 
            height={250}
            className="sm:hidden"
          >
            <BarChart 
              data={data}
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
                tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                width={40}
              />
              <Tooltip 
                cursor={{ fill: 'hsl(var(--muted))', opacity: 0.3 }} 
                content={<CustomTooltip />} 
              />
              <Bar 
                dataKey="sales" 
                name="Ingresos" 
                fill="hsl(var(--chart-1))" 
                radius={[4, 4, 0, 0]}
                className="hover:opacity-80 transition-opacity duration-200"
                animationBegin={0}
                animationDuration={800}
                animationEasing="ease-out"
              />
              <Bar 
                dataKey="expenses" 
                name="Gastos" 
                fill="hsl(var(--chart-2))" 
                radius={[4, 4, 0, 0]}
                className="hover:opacity-80 transition-opacity duration-200"
                animationBegin={100}
                animationDuration={800}
                animationEasing="ease-out"
              />
            </BarChart>
          </ResponsiveContainer>
        ) : null}

        {data.length > 0 ? (
          <ResponsiveContainer 
            width="100%" 
            height={280}
            className="hidden sm:block lg:hidden"
          >
            <BarChart 
              data={data}
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
                dataKey="sales" 
                name="Ventas / Ingresos" 
                fill="hsl(var(--chart-1))" 
                radius={[4, 4, 0, 0]}
                className="hover:opacity-80 transition-opacity duration-200"
                animationBegin={0}
                animationDuration={800}
                animationEasing="ease-out"
              />
              <Bar 
                dataKey="expenses" 
                name="Gastos" 
                fill="hsl(var(--chart-2))" 
                radius={[4, 4, 0, 0]}
                className="hover:opacity-80 transition-opacity duration-200"
                animationBegin={100}
                animationDuration={800}
                animationEasing="ease-out"
              />
            </BarChart>
          </ResponsiveContainer>
        ) : null}

        {data.length > 0 ? (
          <ResponsiveContainer 
            width="100%" 
            height={300}
            className="hidden lg:block"
          >
            <BarChart 
              data={data}
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
                dataKey="sales" 
                name="Ventas / Ingresos" 
                fill="hsl(var(--chart-1))" 
                radius={[4, 4, 0, 0]}
                className="hover:opacity-80 transition-opacity duration-200"
                animationBegin={0}
                animationDuration={800}
                animationEasing="ease-out"
              />
              <Bar 
                dataKey="expenses" 
                name="Gastos" 
                fill="hsl(var(--chart-2))" 
                radius={[4, 4, 0, 0]}
                className="hover:opacity-80 transition-opacity duration-200"
                animationBegin={100}
                animationDuration={800}
                animationEasing="ease-out"
              />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-[250px] sm:h-[280px] lg:h-[300px] w-full items-center justify-center text-muted-foreground text-xs sm:text-sm">
            <div className="text-center animate-pulse">
              <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-4 rounded-lg bg-muted flex items-center justify-center animate-bounce" style={{ animationDuration: '2s' }}>
                <div className="w-4/5 h-4/5 border-4 border-dashed border-muted-foreground/20 rounded" />
              </div>
              <p className="text-sm sm:text-base font-medium">No hay datos financieros</p>
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