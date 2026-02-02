'use client';

import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine
} from 'recharts';
import { Button } from "@/components/ui/button";
import { Filter } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface FinancialSummaryProps {
  annualData: Array<{
    name: string;
    sales: number;
    expenses: number;
  }>;
  quarterlyData: Record<string, Array<{
    name: string;
    sales: number;
    expenses: number;
  }>>;
  defaultYear?: string | null;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-background border border-border p-3 rounded-lg shadow-xl">
        <p className="font-semibold mb-2 text-sm">{label}</p>
        <div className="space-y-1.5">
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center gap-2 text-xs">
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-muted-foreground w-16">
                {entry.name}:
              </span>
              <span className="font-medium font-mono">
                {new Intl.NumberFormat('es-ES', {
                  style: 'currency',
                  currency: 'EUR'
                }).format(entry.value)}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return null;
};

export function FinancialSummary({ annualData, quarterlyData, defaultYear }: FinancialSummaryProps) {
  const [selectedYear, setSelectedYear] = useState<string | 'all'>('all');
  const [activeBar, setActiveBar] = useState<string | null>(null);

  // Sync internal state with defaultYear prop
  useEffect(() => {
    if (defaultYear) {
      setSelectedYear(defaultYear.toString());
    } else {
      setSelectedYear('all');
    }
  }, [defaultYear]);

  const formatCurrency = (value: number) => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M€`;
    if (value >= 1000) return `${(value / 1000).toFixed(0)}k€`;
    return `${value}€`;
  };

  const currentData = useMemo(() => {
    if (selectedYear === 'all') return annualData;
    return quarterlyData[selectedYear] || [];
  }, [selectedYear, annualData, quarterlyData]);

  const availableYears = useMemo(() =>
    Object.keys(quarterlyData).sort((a, b) => Number(b) - Number(a)),
    [quarterlyData]);

  return (
    <Card className="col-span-4 h-full shadow-md hover:shadow-lg transition-all duration-300 border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-6">
        <div className="space-y-1.5">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            Resumen Financiero
            <span className="flex h-2 w-2 rounded-full bg-sky-500 animate-pulse" />
          </CardTitle>
          <CardDescription>
            {selectedYear === 'all'
              ? 'Evolución anual de ingresos y gastos'
              : `Desglose trimestral del año ${selectedYear}`}
          </CardDescription>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-2 bg-background/50 hover:bg-accent hover:text-accent-foreground border-dashed">
              <Filter className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">
                {selectedYear === 'all' ? 'Ver Anual' : selectedYear}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[140px]">
            <DropdownMenuItem
              onClick={() => setSelectedYear('all')}
              className={selectedYear === 'all' ? "bg-accent text-accent-foreground font-medium" : ""}
            >
              Vista Anual
            </DropdownMenuItem>
            {availableYears.length > 0 && <div className="h-px bg-border my-1" />}
            {availableYears.map(year => (
              <DropdownMenuItem
                key={year}
                onClick={() => setSelectedYear(year)}
                className={selectedYear === year ? "bg-accent text-accent-foreground font-medium" : ""}
              >
                Año {year}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>

      <CardContent className="pl-0">
        <div className="h-[350px] w-full mt-4">
          {currentData && currentData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={currentData}
                margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                barGap={4}
                onMouseMove={(state) => {
                  if (state.isTooltipActive) {
                    setActiveBar(state.activeLabel || null);
                  }
                }}
                onMouseLeave={() => setActiveBar(null)}
              >
                <defs>
                  <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.9} />
                    <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0.6} />
                  </linearGradient>
                  <linearGradient id="colorExpenses" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--chart-2))" stopOpacity={0.9} />
                    <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0.6} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="hsl(var(--border))"
                  opacity={0.4}
                />
                <XAxis
                  dataKey="name"
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  dy={10}
                />
                <YAxis
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={formatCurrency}
                  dx={-10}
                />
                <Tooltip
                  cursor={{ fill: 'hsl(var(--muted))', opacity: 0.1 }}
                  content={<CustomTooltip />}
                  animationDuration={200}
                />
                <Legend
                  wrapperStyle={{ paddingTop: '20px' }}
                  iconType="circle"
                  iconSize={8}
                />
                <Bar
                  dataKey="sales"
                  name="Ingresos"
                  fill="url(#colorSales)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={50}
                  animationDuration={1000}
                  className="transition-all duration-300 hover:opacity-80"
                />
                <Bar
                  dataKey="expenses"
                  name="Gastos"
                  fill="url(#colorExpenses)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={50}
                  animationDuration={1000}
                  animationBegin={200}
                  className="transition-all duration-300 hover:opacity-80"
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
              <div className="p-3 rounded-full bg-muted/50">
                <Filter className="h-6 w-6 opacity-50" />
              </div>
              <p className="text-sm font-medium">No hay datos disponibles para este periodo</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}