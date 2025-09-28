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
      <div className="rounded-lg border bg-background p-2 shadow-sm">
        <p className="font-semibold">{label}</p>
        <p className="text-primary">{`Incidencias: ${payload[0].value}`}</p>
      </div>
    );
  }
  return null;
};


export function IncidentsAnalytics({ data }: { data: IncidentsAnalyticsData }) {
    return (
        <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-3">
                <StatsCard 
                    title="Total Incidencias"
                    value={(data.totalOpen + data.totalValidated).toString()}
                    icon={FileText}
                    description="Suma de abiertas y validadas"
                />
                <StatsCard 
                    title="Pendientes de Revisión"
                    value={data.totalOpen.toString()}
                    icon={AlertTriangle}
                    description="Incidencias que requieren acción"
                />
                <StatsCard 
                    title="Validadas"
                    value={data.totalValidated.toString()}
                    icon={CheckCircle}
                    description="Incidencias resueltas"
                />
            </div>
            <div className="grid gap-6 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                           <Building className="h-5 w-5" />
                           Incidencias por Proveedor
                        </CardTitle>
                        <CardDescription>Top 5 proveedores con más incidencias abiertas.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={250}>
                            <BarChart data={data.byProvider} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                                <XAxis dataKey="name" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                                <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                                <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} content={<CustomBarTooltip />} />
                                <Bar dataKey="count" name="Incidencias" radius={[4, 4, 0, 0]} fill="hsl(var(--primary))" />
                            </BarChart>
                        </ResponsiveContainer>
                         {data.byProvider.length === 0 && (
                            <div className="flex h-[250px] w-full items-center justify-center text-muted-foreground">
                                No hay datos de proveedores para mostrar.
                            </div>
                        )}
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                           <ListTodo className="h-5 w-5" />
                           Incidencias por Tipo
                        </CardTitle>
                        <CardDescription>Distribución de incidencias según su naturaleza.</CardDescription>
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
                            >
                              {data.byType.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip />
                            <Legend iconType="circle" />
                          </PieChart>
                        </ResponsiveContainer>
                        {data.byType.length === 0 && (
                            <div className="flex h-[250px] w-full items-center justify-center text-muted-foreground">
                                No hay datos por tipo para mostrar.
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
