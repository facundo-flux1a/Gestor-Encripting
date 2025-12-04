'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Users, Building } from 'lucide-react';
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
  new Intl.NumberFormat('es-ES', { 
      style: 'currency', 
      currency: 'EUR' 
  }).format(amount);

export function InsightsWidget({ incidentRate, topProviders }: InsightsWidgetProps) {
  return (
    <Card className="h-full overflow-hidden hover:shadow-xl hover:shadow-primary/10 hover:scale-[1.02] transition-all duration-300 group">
      <CardHeader className="px-3 sm:px-6 py-3 sm:py-6">
        <CardTitle className="text-base sm:text-lg lg:text-xl group-hover:text-primary transition-colors duration-300">
            Top 5 Proveedores por Gasto
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm group-hover:text-foreground/70 transition-colors duration-300">
            Proveedores con el mayor volumen de gasto registrado.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 sm:space-y-3 px-3 sm:px-6 pb-3 sm:pb-6">
          {topProviders.map((provider, index) => (
              <Link 
                  key={`${provider.fiscalId}-${index}`} 
                  href={`/proveedores/${encodeURIComponent(provider.fiscalId)}`}
                  className="group/item block"
              >
                  <Card className="transition-all duration-300 group-hover/item:border-primary group-hover/item:shadow-lg group-hover/item:shadow-primary/20 group-hover/item:scale-[1.02] group-hover/item:-translate-y-0.5">
                      <CardContent className="p-2 sm:p-3">
                          <div className="flex justify-between items-center gap-2 text-xs sm:text-sm">
                              <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                                  <div className="bg-muted rounded-md p-1.5 sm:p-2 shrink-0 group-hover/item:bg-primary/10 transition-colors duration-300">
                                     <Building className="h-4 w-4 sm:h-5 sm:w-5 text-primary group-hover/item:scale-110 transition-transform duration-300" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                      <p className="font-semibold text-xs sm:text-sm truncate group-hover/item:text-primary transition-colors duration-300" title={provider.name}>
                                          {provider.name}
                                      </p>
                                      <p className="font-mono text-[10px] sm:text-xs text-muted-foreground break-all group-hover/item:text-foreground/70 transition-colors duration-300">
                                          {provider.fiscalId}
                                      </p>
                                  </div>
                              </div>
                              <div className="text-right shrink-0">
                                  <p className="font-bold text-sm sm:text-base text-primary group-hover/item:text-foreground tabular-nums group-hover/item:scale-110 transition-all duration-300 origin-right">
                                      {formatCurrency(provider.total)}
                                  </p>
                                  <p className="text-[10px] sm:text-xs text-muted-foreground whitespace-nowrap group-hover/item:text-primary transition-colors duration-300">
                                      Ver detalles →
                                  </p>
                              </div>
                          </div>
                      </CardContent>
                  </Card>
              </Link>
          ))}
           {topProviders.length === 0 && (
              <div className="flex flex-col items-center justify-center text-center text-muted-foreground py-6 sm:py-8 animate-pulse">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-4 rounded-lg bg-muted flex items-center justify-center animate-bounce" style={{ animationDuration: '2s' }}>
                      <Users className="h-8 w-8 sm:h-10 sm:w-10 text-muted-foreground/50" />
                  </div>
                  <p className="text-sm sm:text-base font-medium">
                      No hay datos de proveedores
                  </p>
                  <p className="text-xs sm:text-sm mt-1">
                      Sube documentos para empezar a ver análisis.
                  </p>
              </div>
          )}
      </CardContent>
    </Card>
  );
}