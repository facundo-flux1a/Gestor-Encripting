
'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ShieldAlert, Users, Building } from 'lucide-react';
import Link from 'next/link';

type ProviderData = {
  name: string;
  total: number;
  fiscalId: string;
};

type InsightsWidgetProps = {
  incidentRate: number;
  topProviders: ProviderData[];
};

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount);

export function InsightsWidget({ incidentRate, topProviders }: InsightsWidgetProps) {
  const hasIncidents = incidentRate > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Insights Rápidos</CardTitle>
        <CardDescription>Análisis clave y puntos de atención.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-8 md:grid-cols-2">
        <div className="space-y-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <ShieldAlert className="h-5 w-5" />
            Salud de los Documentos
          </h3>
          <div className="flex items-center gap-4">
             <ShieldAlert className={`h-10 w-10 ${hasIncidents ? 'text-amber-500' : 'text-green-500'}`} />
            <div>
              <p className={`text-3xl font-bold ${hasIncidents ? 'text-amber-500' : 'text-green-500'}`}>
                {incidentRate.toFixed(1)}%
              </p>
              <p className="text-sm text-muted-foreground">Tasa de incidencias actual</p>
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
