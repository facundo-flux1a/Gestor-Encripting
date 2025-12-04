'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Line, LineChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import { TrendingUp } from 'lucide-react';

type ChartData = {
  month: string;
  total: number;
};

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
  }).format(amount);
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-lg border bg-background p-2 sm:p-3 shadow-sm animate-tooltip-in">
        <p className="font-semibold text-xs sm:text-sm">{label}</p>
        <p className="text-primary text-xs sm:text-sm tabular-nums">
            {formatCurrency(payload[0].value)}
        </p>
      </div>
    );
  }
  return null;
};

export function ProviderPurchaseHistory({ data }: { data: ChartData[] }) {
  return (
    <Card className="transition-all duration-300 hover:shadow-xl hover:shadow-primary/10 group">
      <CardHeader className="px-3 sm:px-6 py-3 sm:py-6">
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <div className="p-1.5 bg-green-500/10 rounded-lg transition-all duration-300 group-hover:scale-110 group-hover:rotate-3">
              <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 shrink-0 text-green-500" />
            </div>
            <span className="truncate bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
              Evolución del Gasto Mensual
            </span>
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm">
            Muestra el total gastado con este proveedor a lo largo del tiempo.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-2 sm:px-6 pb-3 sm:pb-6">
        {data.length > 0 ? (
          <>
            {/* Mobile Chart */}
            <ResponsiveContainer width="100%" height={280} className="sm:hidden">
                <LineChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                    <XAxis
                        dataKey="month"
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
                        dataKey="total" 
                        name="Gasto Total" 
                        stroke="hsl(var(--primary))" 
                        strokeWidth={2} 
                        dot={{ r: 3 }} 
                        activeDot={{ r: 5 }} 
                    />
                </LineChart>
            </ResponsiveContainer>

            {/* Tablet Chart */}
            <ResponsiveContainer width="100%" height={320} className="hidden sm:block lg:hidden">
                <LineChart data={data} margin={{ top: 5, right: 15, left: -10, bottom: 5 }}>
                    <XAxis
                        dataKey="month"
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
                        dataKey="total" 
                        name="Gasto Total" 
                        stroke="hsl(var(--primary))" 
                        strokeWidth={2} 
                        dot={{ r: 3.5 }} 
                        activeDot={{ r: 5.5 }} 
                    />
                </LineChart>
            </ResponsiveContainer>

            {/* Desktop Chart */}
            <ResponsiveContainer width="100%" height={350} className="hidden lg:block">
                <LineChart data={data} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                    <XAxis
                        dataKey="month"
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
                        dataKey="total" 
                        name="Gasto Total" 
                        stroke="hsl(var(--primary))" 
                        strokeWidth={2} 
                        dot={{ r: 4 }} 
                        activeDot={{ r: 6 }} 
                    />
                </LineChart>
            </ResponsiveContainer>
          </>
        ) : (
          <div className="flex h-[280px] sm:h-[320px] lg:h-[350px] w-full items-center justify-center text-muted-foreground text-xs sm:text-sm">
            <div className="text-center space-y-2">
              <TrendingUp className="h-12 w-12 mx-auto text-muted-foreground/50" />
              <p>No hay datos de compras para mostrar.</p>
            </div>
          </div>
        )}
      </CardContent>

      {/* Estilos de animación */}
      <style jsx global>{`
        @keyframes tooltip-in {
          from {
            opacity: 0;
            transform: scale(0.95) translateY(-5px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }

        .animate-tooltip-in {
          animation: tooltip-in 0.2s ease-out;
        }

        @media (prefers-reduced-motion: reduce) {
          .animate-tooltip-in {
            animation: none;
          }
          
          .transition-all {
            transition: none !important;
          }
          
          .group-hover\:scale-110:hover,
          .group-hover\:rotate-3:hover {
            transform: none !important;
          }
        }
      `}</style>
    </Card>
  );
}