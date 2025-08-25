
'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ShieldAlert, Users, Building, AlertTriangle } from 'lucide-react';
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
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Top 5 Proveedores por Gasto</CardTitle>
        <CardDescription>Proveedores con el mayor volumen de gasto registrado.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
          {topProviders.map((provider, index) => (
              <Link 
                  key={`${provider.fiscalId}-${index}`} 
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
              <div className="flex flex-col items-center justify-center text-center text-muted-foreground py-8">
                  <Users className="h-10 w-10 mb-2" />
                  <p className="text-sm font-medium">No hay datos de proveedores</p>
                  <p className="text-xs">Sube documentos para empezar a ver análisis.</p>
              </div>
          )}
      </CardContent>
    </Card>
  );
}
