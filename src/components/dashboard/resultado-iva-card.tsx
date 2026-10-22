'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';
import { Euro } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DashboardAnalytics } from '@/lib/types';

interface ResultadoIvaCardProps {
  analytics: DashboardAnalytics | null;
  formatCurrency?: (amount: number | string) => string;
}

const defaultFormatCurrency = (amount: number | string): string => {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return '0,00 €';

  const fixed = Math.abs(num).toFixed(2);
  const parts = fixed.split('.');
  const integerPart = parts[0];
  const decimalPart = parts[1];

  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${num < 0 ? '-' : ''}${formattedInteger},${decimalPart} €`;
};

export function ResultadoIvaCard({
  analytics,
  formatCurrency = defaultFormatCurrency,
}: ResultadoIvaCardProps) {
  const resultadoIva = Number(analytics?.kpis?.resultadoIva ?? 0);
  const ivaRepercutido = Number(analytics?.kpis?.ivaRepercutido ?? 0);
  const ivaSoportado = Number(analytics?.kpis?.ivaSoportado ?? 0);

  const isPositive = resultadoIva >= 0;

  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <Card className="hover:shadow-lg transition-all duration-200 border-border/60 bg-card relative group flex flex-col justify-between overflow-hidden cursor-default">
          {/* Glow superior dinámico */}
          <div
            className={cn(
              'absolute top-0 left-0 right-0 h-[2px] transition-colors duration-500',
              isPositive
                ? 'bg-gradient-to-r from-emerald-500/20 via-emerald-400 to-emerald-500/20'
                : 'bg-gradient-to-r from-rose-500/20 via-rose-400 to-rose-500/20'
            )}
          />

          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-foreground/90">
              Resultado IVA
            </CardTitle>
            <Euro
              className={cn(
                'h-4 w-4 shrink-0 transition-colors',
                isPositive ? 'text-emerald-500' : 'text-rose-500'
              )}
            />
          </CardHeader>

          <CardContent className="space-y-1 pt-0">
            <div className="flex items-baseline gap-2">
              <div className="text-2xl font-bold tracking-tight text-foreground tabular-nums">
                {formatCurrency(resultadoIva)}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Repercutido - Soportado
            </p>
          </CardContent>
        </Card>
      </HoverCardTrigger>

      <HoverCardContent className="w-80 p-4 shadow-xl border-border/80 bg-card/95 backdrop-blur-md rounded-xl space-y-3 z-50">
        <div className="space-y-2">
          <div className="flex items-center justify-between border-b border-border/60 pb-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
              Desglose de IVA
            </h4>
            <span
              className={cn(
                'text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0',
                isPositive
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
              )}
            >
              {isPositive ? 'A ingresar' : 'A compensar'}
            </span>
          </div>

          <div className="flex justify-between items-center text-xs text-muted-foreground">
            <span>IVA Repercutido (cobrado):</span>
            <span className="text-emerald-500 font-semibold font-mono tabular-nums">
              +{formatCurrency(Math.abs(ivaRepercutido))}
            </span>
          </div>

          <div className="flex justify-between items-center text-xs text-muted-foreground">
            <span>IVA Soportado (pagado):</span>
            <span className="text-rose-400 font-semibold font-mono tabular-nums">
              -{formatCurrency(Math.abs(ivaSoportado))}
            </span>
          </div>

          <div className="border-t border-border/60 pt-2 flex justify-between items-center font-bold text-sm">
            <span>Total Liquidación:</span>
            <span
              className={cn(
                'font-mono tabular-nums',
                isPositive ? 'text-emerald-400 font-extrabold' : 'text-rose-400 font-extrabold'
              )}
            >
              {formatCurrency(resultadoIva)}
            </span>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
