
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Users } from 'lucide-react';
import { Badge } from '../ui/badge';

type ProviderData = {
  name: string;
  total: number;
};

type InsightsWidgetProps = {
  variationPercent: number;
  topProviders: ProviderData[];
};

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount);


export function InsightsWidget({ variationPercent, topProviders }: InsightsWidgetProps) {
  const isPositive = variationPercent >= 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Insights Rápidos</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4">
            <h3 className="text-lg font-semibold">Resumen del Periodo</h3>
            <div className="flex items-center gap-4">
                {isPositive ? (
                    <TrendingUp className="h-10 w-10 text-green-500" />
                ) : (
                    <TrendingDown className="h-10 w-10 text-red-500" />
                )}
                <div>
                    <p className="text-2xl font-bold">{isPositive ? '+' : ''}{variationPercent}%</p>
                    <p className="text-sm text-muted-foreground">Variación de gastos vs. periodo anterior</p>
                </div>
            </div>
        </div>

        <div className="space-y-4">
            <h3 className="text-lg font-semibold flex items-center gap-2"><Users /> Top 3 Proveedores (por gasto)</h3>
            <ul className="space-y-2">
                {topProviders.map(provider => (
                    <li key={provider.name} className="flex justify-between items-center">
                        <span className="font-medium">{provider.name}</span>
                        <Badge variant="secondary">{formatCurrency(provider.total)}</Badge>
                    </li>
                ))}
                 {topProviders.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">No hay datos de proveedores.</p>
                )}
            </ul>
        </div>
      </CardContent>
    </Card>
  );
}
