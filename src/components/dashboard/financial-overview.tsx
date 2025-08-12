"use client";

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type Document } from '@/lib/types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { ArrowDownRight, ArrowUpRight, DollarSign } from 'lucide-react';
import { format } from 'date-fns';
import es from 'date-fns/locale/es';

const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-ES', {
        style: 'currency',
        currency: 'EUR',
    }).format(amount);
};

type MonthlyData = {
    month: string;
    Ingresos: number;
    Gastos: number;
};

export function FinancialOverview({ documents }: { documents: Document[] }) {
    const totalIngress = useMemo(() => documents.reduce((acc, doc) => acc + doc.ingreso, 0), [documents]);
    const totalExpenses = useMemo(() => documents.reduce((acc, doc) => acc + doc.gasto, 0), [documents]);
    const benefitBeforeTaxes = totalIngress - totalExpenses;
    
    const monthlyData = useMemo(() => {
        const data: { [key: string]: { Ingresos: number; Gastos: number } } = {};
        documents.forEach(doc => {
            const month = format(new Date(doc.fecha_subida), "MMM yyyy", { locale: es });
            if (!data[month]) {
                data[month] = { Ingresos: 0, Gastos: 0 };
            }
            data[month].Ingresos += doc.ingreso;
            data[month].Gastos += doc.gasto;
        });

        return Object.keys(data).map(month => ({
            month,
            Ingresos: data[month].Ingresos,
            Gastos: data[month].Gastos,
        })).sort((a,b) => new Date(a.month).getTime() - new Date(b.month).getTime());
    }, [documents]);

    return (
        <Card>
            <CardHeader>
                <CardTitle>Resumen Financiero</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="grid gap-4 md:grid-cols-3">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Ingresos Totales</CardTitle>
                            <ArrowUpRight className="h-4 w-4 text-green-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-green-500">{formatCurrency(totalIngress)}</div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Gastos Totales</CardTitle>
                            <ArrowDownRight className="h-4 w-4 text-red-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-red-500">{formatCurrency(totalExpenses)}</div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Beneficio (BDI)</CardTitle>
                            <DollarSign className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{formatCurrency(benefitBeforeTaxes)}</div>
                        </CardContent>
                    </Card>
                </div>
                 <div className="h-[350px]">
                     <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={monthlyData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="month" />
                            <YAxis tickFormatter={(value) => formatCurrency(value as number)}/>
                            <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }} formatter={(value) => formatCurrency(value as number)} />
                            <Legend />
                            <Bar dataKey="Ingresos" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="Gastos" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </CardContent>
        </Card>
    );
}
