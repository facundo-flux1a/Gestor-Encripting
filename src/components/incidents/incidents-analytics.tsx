'use client';

import { StatsCard } from "@/components/dashboard/stats-card";
import { AlertTriangle, CheckCircle, FileText, Building, ListTodo } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { ResponsiveContainer, BarChart, XAxis, YAxis, Tooltip, Bar, PieChart, Pie, Cell, Legend } from "recharts";

export type IncidentsAnalyticsData = {
    totalOpen: number;
    totalValidated: number;
    byProvider: { name: string; count: number }[];
    byType: { name: string; count: number }[];
};

const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

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

export function IncidentsAnalytics({ data }: { data: IncidentsAnalyticsData }) {
    const hasProviderData = data.byProvider && data.byProvider.length > 0;
    const hasTypeData = data.byType && data.byType.length > 0;
    
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
                                        <Pie
                                          data={data.byType}
                                          cx="50%"
                                          cy="50%"
                                          labelLine={false}
                                          outerRadius={80}
                                          innerRadius={60}
                                          paddingAngle={5}
                                          fill="#8884d8"
                                          dataKey="count"
                                          nameKey="name"
                                          className="transition-all duration-300"
                                        >
                                          {data.byType.map((entry, index) => (
                                            <Cell 
                                              key={`cell-${index}`} 
                                              fill={COLORS[index % COLORS.length]}
                                              className="hover:opacity-80 transition-opacity duration-200"
                                            />
                                          ))}
                                        </Pie>
                                        <Tooltip />
                                        <Legend 
                                            iconType="circle"
                                            wrapperStyle={{ fontSize: '12px' }}
                                        />
                                      </PieChart>
                                    </ResponsiveContainer>
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