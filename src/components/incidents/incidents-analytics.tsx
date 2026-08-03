'use client';

import { StatsCard } from "@/components/dashboard/stats-card";
import { AlertTriangle, CheckCircle, FileText, Building, ListTodo } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { ResponsiveContainer, BarChart, XAxis, YAxis, Tooltip, Bar, PieChart, Pie, Cell, Legend, Sector } from "recharts";
import { useState } from "react";

// Clasificador exportado para que la tabla pueda usarlo
export function classifyIncident(desc: string): string {
  const d = (desc || '').toLowerCase();
  if (/duplic/.test(d)) return 'Duplicado';
  if (/c[áa]lculo|math_balance|totales no cuadran|suma de (las l[íi]neas|los importes)|importe.*no coincide|inconsistencia.*l[íi]nea/.test(d)) return 'Error de Cálculo';
  if (/cif (no coincide|del cliente no coincide|de empresa emisora.*no coincide)|no coincide.*cif/.test(d)) return 'CIF No Coincide';
  if (/cif.*(ausente|no encontrado|faltante)|sin cif|c[óo]digo fiscal.*(ausente|no encontrado)/.test(d)) return 'CIF Ausente';
  if (/fecha.*posterior|fecha.*vencimiento.*anterior|fecha.*emisi[óo]n.*incorrecta/.test(d)) return 'Error de Fecha';
  if (/rectificativa.*abono|abono.*positivo|importes.*positivo.*abono/.test(d)) return 'Revisión de Abono';
  if (/no es una factura|no es un albar[áa]n|no.*documento comercial/.test(d)) return 'Doc. No Válido';
  if (/incompleto|ausente|faltante|no encontrado|no disponible/.test(d)) return 'Datos Faltantes';
  return 'Otro';
}

export type IncidentsAnalyticsData = {
    totalOpen: number;
    totalValidated: number;
    byProvider: { name: string; count: number }[];
    byType: { name: string; count: number }[];
    docIdsByType?: Record<string, number[]>;
};

const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

const renderActiveShape = (props: any) => {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, payload, percent, value } = props;
  return (
    <g style={{ outline: 'none' }}>
      <text x={cx} y={cy - 8} textAnchor="middle" fill="currentColor" className="fill-foreground text-sm font-semibold">
        {payload.name}
      </text>
      <text x={cx} y={cy + 14} textAnchor="middle" fill="currentColor" className="fill-muted-foreground text-xs">
        {value} ({(percent * 100).toFixed(0)}%)
      </text>
      <Sector style={{ outline: 'none' }} cx={cx} cy={cy} innerRadius={innerRadius} outerRadius={outerRadius + 8} startAngle={startAngle} endAngle={endAngle} fill={fill} />
    </g>
  );
};


const CustomBarTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-lg border bg-background p-3 shadow-lg animate-in fade-in zoom-in-95 duration-200">
        <p className="font-semibold text-sm mb-1">{label}</p>
        <p className="text-primary text-xs flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-primary"></span>
          {`Incidencias: ${payload[0].value}`}
        </p>
      </div>
    );
  }
  return null;
};

export function IncidentsAnalytics({ data, onTypeClick, activeType }: { 
    data: IncidentsAnalyticsData;
    onTypeClick?: (type: string | null) => void;
    activeType?: string | null;
}) {
    const hasProviderData = data.byProvider && data.byProvider.length > 0;
    const hasTypeData = data.byType && data.byType.length > 0;
    const [activeIndex, setActiveIndex] = useState<number | undefined>(undefined);
    
    return (
        <div className="space-y-4 sm:space-y-6">
            {/* Stats Cards - Responsive Grid con animaciones staggered */}
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                <div className="animate-fade-in group" style={{ animationDelay: '0ms' }}>
                    <div className="transition-all duration-300 hover:scale-[1.02] hover:shadow-xl hover:shadow-primary/10">
                        <StatsCard 
                            title="Total Incidencias"
                            value={(data.totalOpen + data.totalValidated).toString()}
                            icon={FileText}
                            description="Suma de abiertas y validadas"
                        />
                    </div>
                </div>
                <div className="animate-fade-in group" style={{ animationDelay: '50ms' }}>
                    <div className="transition-all duration-300 hover:scale-[1.02] hover:shadow-xl hover:shadow-amber-500/10">
                        <StatsCard 
                            title="Pendientes de Revisión"
                            value={data.totalOpen.toString()}
                            icon={AlertTriangle}
                            description="Incidencias que requieren acción"
                        />
                    </div>
                </div>
                <div className="animate-fade-in group" style={{ animationDelay: '100ms' }}>
                    <div className="transition-all duration-300 hover:scale-[1.02] hover:shadow-xl hover:shadow-green-500/10">
                        <StatsCard 
                            title="Validadas"
                            value={data.totalValidated.toString()}
                            icon={CheckCircle}
                            description="Incidencias resueltas"
                        />
                    </div>
                </div>
            </div>

            {/* Charts - Responsive Grid con animaciones */}
            {(hasProviderData || hasTypeData) && (
                <div className="grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-2">
                    {/* Incidencias por Proveedor */}
                    {hasProviderData && (
                        <div className="animate-fade-in" style={{ animationDelay: '150ms' }}>
                            <Card className="transition-all duration-300 hover:shadow-lg hover:shadow-primary/10">
                                <CardHeader className="space-y-2">
                                    <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                                        <div className="p-1.5 bg-blue-500/10 rounded-lg shrink-0">
                                            <Building className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 dark:text-blue-400" />
                                        </div>
                                        <span className="line-clamp-2 bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
                                            Incidencias por Proveedor
                                        </span>
                                    </CardTitle>
                                    <CardDescription className="text-xs sm:text-sm">
                                        Top 5 proveedores con más incidencias abiertas
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <ResponsiveContainer width="100%" height={250}>
                                        <BarChart 
                                            data={data.byProvider} 
                                            margin={{ 
                                                top: 5, 
                                                right: 10, 
                                                left: -20, 
                                                bottom: 5 
                                            }}
                                        >
                                            <XAxis 
                                                dataKey="name" 
                                                stroke="hsl(var(--muted-foreground))" 
                                                fontSize={11}
                                                tickLine={false} 
                                                axisLine={false} 
                                                tick={false}
                                            />
                                            <YAxis 
                                                stroke="hsl(var(--muted-foreground))" 
                                                fontSize={11}
                                                tickLine={false} 
                                                axisLine={false} 
                                                allowDecimals={false} 
                                            />
                                            <Tooltip 
                                                cursor={{ fill: 'hsl(var(--muted))' }} 
                                                content={<CustomBarTooltip />} 
                                            />
                                            <Bar 
                                                dataKey="count" 
                                                name="Incidencias" 
                                                radius={[8, 8, 0, 0]} 
                                                fill="hsl(var(--primary))" 
                                                className="transition-all duration-300 hover:opacity-80"
                                            />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </CardContent>
                            </Card>
                        </div>
                    )}

                    {/* Incidencias por Tipo */}
                    {hasTypeData && (
                        <div className="animate-fade-in" style={{ animationDelay: '200ms' }}>
                            <Card className="transition-all duration-300 hover:shadow-lg hover:shadow-primary/10">
                                <CardHeader className="space-y-2">
                                    <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                                        <div className="p-1.5 bg-purple-500/10 rounded-lg shrink-0">
                                            <ListTodo className="h-4 w-4 sm:h-5 sm:w-5 text-purple-600 dark:text-purple-400" />
                                        </div>
                                        <span className="line-clamp-2 bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
                                            Incidencias por Tipo
                                        </span>
                                    </CardTitle>
                                    <CardDescription className="text-xs sm:text-sm">
                                        Distribución de incidencias según su naturaleza
                                    </CardDescription>
                                 </CardHeader>
                                 <CardContent>
                                   <ResponsiveContainer width="100%" height={250}>
                                      <PieChart>
                                        <style>{`
                                          .recharts-wrapper, 
                                          .recharts-wrapper *, 
                                          .recharts-surface, 
                                          .recharts-surface * {
                                            outline: none !important;
                                          }
                                        `}</style>
                                        <Pie
                                          data={data.byType}
                                          cx="50%"
                                          cy="50%"
                                          labelLine={false}
                                          outerRadius={80}
                                          innerRadius={55}
                                          paddingAngle={3}
                                          fill="#8884d8"
                                          dataKey="count"
                                          nameKey="name"
                                          activeIndex={activeIndex}
                                          activeShape={renderActiveShape}
                                          style={{ cursor: onTypeClick ? 'pointer' : 'default', outline: 'none' }}
                                          onClick={(entry, index) => {
                                            if (!onTypeClick) return;
                                            const clickedType = data.byType[index]?.name;
                                            if (activeType === clickedType) {
                                              // toggle off
                                              setActiveIndex(undefined);
                                              onTypeClick(null);
                                            } else {
                                              setActiveIndex(index);
                                              onTypeClick(clickedType);
                                            }
                                          }}
                                          onMouseEnter={(_, index) => setActiveIndex(index)}
                                          onMouseLeave={() => {
                                            // keep active if selected
                                            if (activeType == null) setActiveIndex(undefined);
                                          }}
                                        >
                                          {data.byType.map((entry, index) => (
                                            <Cell 
                                              key={`cell-${index}`} 
                                              fill={COLORS[index % COLORS.length]}
                                              opacity={activeType && activeType !== entry.name ? 0.35 : 1}
                                              style={{ transition: 'opacity 0.2s', outline: 'none' }}
                                            />
                                          ))}
                                        </Pie>
                                        <Tooltip formatter={(value, name) => [value, name]} />
                                        <Legend 
                                            iconType="circle"
                                            wrapperStyle={{ fontSize: '12px', cursor: onTypeClick ? 'pointer' : 'default' }}
                                            onClick={(legendEntry) => {
                                              if (!onTypeClick) return;
                                              const clickedType = legendEntry.value;
                                              const idx = data.byType.findIndex(t => t.name === clickedType);
                                              if (activeType === clickedType) {
                                                setActiveIndex(undefined);
                                                onTypeClick(null);
                                              } else {
                                                setActiveIndex(idx >= 0 ? idx : undefined);
                                                onTypeClick(clickedType);
                                              }
                                            }}
                                        />
                                      </PieChart>
                                    </ResponsiveContainer>
                                {onTypeClick && activeType && (
                                  <p className="text-center text-xs text-muted-foreground mt-2">
                                    Filtrando: <span className="font-semibold text-primary">{activeType}</span>
                                    {' '}— <button onClick={() => { setActiveIndex(undefined); onTypeClick(null); }} className="underline hover:text-foreground">limpiar</button>
                                  </p>
                                )}
                                </CardContent>
                            </Card>
                        </div>
                    )}
                </div>
            )}

            {/* Mensaje cuando no hay datos de charts */}
            {!hasProviderData && !hasTypeData && (
                <div className="animate-fade-in" style={{ animationDelay: '150ms' }}>
                    <Card className="transition-all duration-300 hover:shadow-lg">
                        <CardContent className="flex items-center justify-center py-12 sm:py-16">
                            <div className="text-center space-y-3">
                                <div className="inline-flex p-4 bg-muted/50 rounded-full mb-2">
                                    <FileText className="h-12 w-12 text-muted-foreground/50" />
                                </div>
                                <p className="text-sm sm:text-base text-muted-foreground font-medium">
                                    No hay datos de incidencias para mostrar
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    Analiza documentos para generar estadísticas
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
}