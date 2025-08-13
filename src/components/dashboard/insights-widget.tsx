
'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Users, BadgePercent, ArrowRight, Building } from 'lucide-react';
import Link from 'next/link';

type ProviderData = {
  name: string;
  total: number;
  fiscalId: string;
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
      <CardContent className="grid gap-8 md:grid-cols-2">
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
                Top 5 Proveedores por Gasto
            </h3>
            <div className="space-y-3">
                {topProviders.map((provider, index) => (
                    <Link 
                        key={provider.fiscalId} 
                        href={`/proveedores/${encodeURIComponent(provider.fiscalId)}`}
                        className="group"
                    >
                        <Card className="transition-all group-hover:border-primary group-hover:shadow-md">
                            <CardContent className="p-3">
                                <div className="flex justify-between items-center text-sm">
                                    <div className="flex items-center gap-3">
                                        <div className="bg-muted rounded-md p-2">
                                           <Building className="h-5 w-5 text-primary" />
                                        </div>
                                        <div>
                                            <p className="font-semibold">{provider.name}</p>
                                            <p className="font-mono text-xs text-muted-foreground">{provider.fiscalId}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-bold text-base text-primary">{formatCurrency(provider.total)}</p>
                                        <p className="text-xs text-muted-foreground">Ver detalles</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </Link>
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
