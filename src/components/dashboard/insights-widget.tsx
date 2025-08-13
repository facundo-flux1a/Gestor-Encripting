
'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Users, BadgePercent } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

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
        <CardDescription>Análisis clave del periodo actual.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <BadgePercent className="h-5 w-5" />
            Variación de Gastos
          </h3>
          <div className="flex items-center gap-4">
            {isPositive ? (
              <TrendingUp className="h-10 w-10 text-destructive" />
            ) : (
              <TrendingDown className="h-10 w-10 text-green-500" />
            )}
            <div>
              <p className={`text-3xl font-bold ${isPositive ? 'text-destructive' : 'text-green-500'}`}>
                {isPositive ? '+' : ''}{variationPercent}%
              </p>
              <p className="text-sm text-muted-foreground">vs. periodo anterior</p>
            </div>
          </div>
        </div>
        <div className="space-y-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
                <Users className="h-5 w-5" />
                Top 3 Proveedores por Gasto
            </h3>
            <div className="space-y-2">
                {topProviders.map((provider, index) => (
                    <div key={index} className="flex justify-between items-center text-sm">
                       <div className="flex items-center gap-2">
                         <Badge variant="secondary" className="w-6 h-6 flex items-center justify-center">{index + 1}</Badge>
                         <span className="font-medium">{provider.name}</span>
                       </div>
                        <span className="font-mono font-semibold">{formatCurrency(provider.total)}</span>
                    </div>
                ))}
                 {topProviders.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                        No hay datos de proveedores para mostrar.
                    </p>
                )}
            </div>
        </div>
      </CardContent>
    </Card>
  );
}
