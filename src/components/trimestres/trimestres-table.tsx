'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Lock, Building2 } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Document } from '@/lib/types';
import { cn } from '@/lib/utils';

interface TrimestreTableProps {
  documentos: Document[];
  onDocumentClick?: (doc: Document) => void;
  className?: string;
  footerValues?: { // 🆕 Optional custom footer values
    base: number;
    iva: number;
    total: number;
    label?: string;
    breakdown?: {
      ingresos: { base: number; iva: number; total: number; retencion?: number; recargo?: number };
      gastos: { base: number; iva: number; total: number; retencion?: number; recargo?: number };
    };
  };
}

// 🎯 FUNCIONES DE FORMATO MANUAL
const formatCurrency = (amount: number | string | null | undefined): string => {
  if (amount === null || amount === undefined) return '0,00 €';

  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return '0,00 €';

  const fixed = num.toFixed(2);
  const parts = fixed.split('.');
  const integerPart = parts[0];
  const decimalPart = parts[1];

  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  return `${formattedInteger},${decimalPart} €`;
};

export function TrimestreTable({
  documentos,
  onDocumentClick,
  className,
  footerValues, // 🆕 Destructure
}: TrimestreTableProps) {
  const router = useRouter();

  // ✅ Handler para navegar al documento
  const handleRowClick = (doc: Document) => {
    if (onDocumentClick) {
      onDocumentClick(doc);
    } else {
      router.push(`/documento/${doc.id_documento}`);
    }
  };

  // ✅ CÁLCULO DE SUMAS REALES (Fila por fila, respetando Abonos)
  const totalsReales = React.useMemo(() => {
    return documentos.reduce((acc, doc) => {
      const tipoLower = (doc.tipo_documento || '').toLowerCase();
      const valTotal = Number(doc.total || doc.base_imponible || 0);
      const isAbono = tipoLower.includes('abono') || tipoLower.includes('crédito') || tipoLower.includes('credito') || valTotal < 0;
      const sign = isAbono ? -1 : 1;

      const ivaRealVal = Math.abs(doc.iva || 0) || Math.abs((doc.total || 0) - (doc.base_imponible || 0));
      acc.base += (Math.abs(doc.base_imponible || 0) * sign);
      acc.iva += (ivaRealVal * sign);
      acc.total += (Math.abs(doc.total || 0) * sign);
      acc.recargo += (Math.abs((doc as any).recargo || 0) * sign);
      acc.retencion += (Math.abs((doc as any).retencion || 0) * sign);
      return acc;
    }, { base: 0, iva: 0, total: 0, recargo: 0, retencion: 0 });
  }, [documentos]);

  // 📱 EMPTY STATE RESPONSIVE CON ANIMACIÓN
  if (documentos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 sm:py-12 text-center px-4 animate-fade-in">
        <div className="mx-auto w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center mb-3 sm:mb-4 animate-pulse">
          <FileText className="h-6 w-6 sm:h-8 sm:w-8 text-muted-foreground" />
        </div>
        <h3 className="text-base sm:text-lg font-semibold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
          No hay documentos
        </h3>
        <p className="text-xs sm:text-sm text-muted-foreground mt-1 max-w-md">
          Este trimestre no tiene documentos registrados
        </p>
      </div>
    );
  }

  return (
    <div className={cn('rounded-lg border', className)}>
      {/* 📱 WRAPPER CON SCROLL HORIZONTAL */}
      <div className="w-full overflow-x-auto">
        <div className="min-w-[800px]">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/70 transition-colors">
                <TableHead className="text-xs sm:text-sm font-semibold">Tipo</TableHead>
                <TableHead className="text-xs sm:text-sm font-semibold">N° Documento</TableHead>
                <TableHead className="text-xs sm:text-sm font-semibold">Fecha</TableHead>
                <TableHead className="text-xs sm:text-sm font-semibold">Empresa</TableHead>
                <TableHead className="text-xs sm:text-sm font-semibold">Proveedor</TableHead>
                <TableHead className="text-xs sm:text-sm font-semibold">Cliente</TableHead>
                <TableHead className="text-right text-xs sm:text-sm font-semibold">Base</TableHead>
                <TableHead className="text-right text-xs sm:text-sm font-semibold">Rec.</TableHead>
                <TableHead className="text-right text-xs sm:text-sm font-semibold">Ret.</TableHead>
                <TableHead className="text-right text-xs sm:text-sm font-semibold">IVA</TableHead>
                <TableHead className="text-right text-xs sm:text-sm font-semibold">Total</TableHead>
                <TableHead className="text-center text-xs sm:text-sm font-semibold">Estado</TableHead>
              </TableRow>
              {/* ✅ TOTALS ROW (Custom or Calculated) */}
              <TableRow className="bg-primary/20 hover:bg-primary/30 font-extrabold border-b-2 border-primary/40 transition-all duration-300 group cursor-default h-14">
                <TableHead colSpan={6} className="text-right text-sm sm:text-base text-foreground dark:text-white group-hover:text-primary transition-all duration-300 uppercase tracking-wide">
                  <div className="inline-block transition-transform duration-500 origin-right group-hover:scale-105 group-hover:rotate-[0.2deg]">
                    {footerValues?.label || "Resultado Neto del Periodo:"}
                  </div>
                </TableHead>

                {/* BASE FOOTER */}
                <TableHead className="text-right text-sm sm:text-base text-foreground dark:text-white group-hover:text-primary transition-all duration-300">
                  <div className="inline-block transition-transform duration-500 origin-center group-hover:scale-105 group-hover:-rotate-[0.2deg]">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger className="cursor-help decoration-dotted underline decoration-white/30 underline-offset-4">
                          {footerValues?.breakdown ? (
                            formatCurrency(footerValues.breakdown.ingresos.base - footerValues.breakdown.gastos.base)
                          ) : (
                            formatCurrency(footerValues ? footerValues.base : totalsReales.base)
                          )}
                        </TooltipTrigger>
                        <TooltipContent className="p-3 bg-popover border border-border shadow-xl">
                          <div className="space-y-2 text-xs">
                            <p className="font-bold border-b pb-1">Desglose de Base Imponible</p>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                              {footerValues?.breakdown ? (
                                <>
                                  <span className="text-green-500">Ingresos:</span>
                                  <span className="text-right">{formatCurrency(footerValues.breakdown.ingresos.base)}</span>
                                  <span className="text-red-500">Gastos:</span>
                                  <span className="text-right">{formatCurrency(footerValues.breakdown.gastos.base)}</span>
                                </>
                              ) : (
                                <>
                                  <span className="text-muted-foreground">Suma Real:</span>
                                  <span className="text-right">{formatCurrency(totalsReales.base)}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </TableHead>

                {/* RECARGO FOOTER */}
                <TableHead className="text-right text-sm sm:text-base text-foreground dark:text-white group-hover:text-primary transition-all duration-300">
                  <div className="inline-block transition-transform duration-500 origin-center group-hover:scale-105 group-hover:rotate-[0.2deg]">
                    {footerValues?.breakdown ? (
                      formatCurrency((footerValues.breakdown.ingresos as any).recargo - (footerValues.breakdown.gastos as any).recargo)
                    ) : formatCurrency(totalsReales.recargo)}
                  </div>
                </TableHead>

                {/* RETENCION FOOTER */}
                <TableHead className="text-right text-sm sm:text-base text-foreground dark:text-white group-hover:text-primary transition-all duration-300">
                  <div className="inline-block transition-transform duration-500 origin-center group-hover:scale-105 group-hover:-rotate-[0.2deg]">
                    {footerValues?.breakdown ? (
                      formatCurrency((footerValues.breakdown.ingresos as any).retencion - (footerValues.breakdown.gastos as any).retencion)
                    ) : formatCurrency(totalsReales.retencion)}
                  </div>
                </TableHead>

                {/* IVA FOOTER */}
                <TableHead className="text-right text-sm sm:text-base text-foreground dark:text-white group-hover:text-primary transition-all duration-300">
                  <div className="inline-block transition-transform duration-500 origin-center group-hover:scale-105 group-hover:rotate-[0.2deg]">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger className="cursor-help decoration-dotted underline decoration-white/30 underline-offset-4">
                          {footerValues?.breakdown ? (
                            formatCurrency(footerValues.iva)
                          ) : (
                            formatCurrency(footerValues ? footerValues.iva : totalsReales.iva)
                          )}
                        </TooltipTrigger>
                        <TooltipContent className="p-3 bg-popover border border-border shadow-xl">
                          <div className="space-y-2 text-xs">
                            <p className="font-bold border-b pb-1">Desglose de IVA</p>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                              {footerValues?.breakdown ? (
                                <>
                                  <span className="text-green-500">IVA Rep.:</span>
                                  <span className="text-right">{formatCurrency(footerValues.breakdown.ingresos.iva)}</span>
                                  <span className="text-red-500">IVA Sop.:</span>
                                  <span className="text-right">{formatCurrency(footerValues.breakdown.gastos.iva)}</span>
                                  <div className="col-span-2 h-px bg-border my-1" />
                                  <span className="font-bold border-t pt-1">Total Absoluto:</span>
                                  <span className="text-right font-bold border-t pt-1">{formatCurrency(footerValues.iva)}</span>
                                </>
                              ) : (
                                <>
                                  <span className="text-muted-foreground">Suma Real:</span>
                                  <span className="text-right">{formatCurrency(totalsReales.iva)}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </TableHead>

                {/* TOTAL FOOTER */}
                <TableHead className="text-right text-sm sm:text-base text-foreground dark:text-white group-hover:text-primary transition-all duration-300">
                  <div className="inline-block transition-transform duration-500 origin-center group-hover:scale-105 group-hover:-rotate-[0.2deg]">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger className="cursor-help decoration-dotted underline decoration-white/30 underline-offset-4">
                          {footerValues?.breakdown ? (
                            formatCurrency(footerValues.total)
                          ) : (
                            formatCurrency(footerValues ? footerValues.total : totalsReales.total)
                          )}
                        </TooltipTrigger>
                        <TooltipContent className="p-3 bg-popover border border-border shadow-xl">
                          <div className="space-y-2 text-xs">
                            <p className="font-bold border-b pb-1">Análisis de Resultado Neto</p>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                              {footerValues?.breakdown ? (
                                <>
                                  <span className="text-green-500">Total Ingresos:</span>
                                  <span className="text-right">{formatCurrency(footerValues.breakdown.ingresos.total)}</span>
                                  <span className="text-red-500">Total Gastos:</span>
                                  <span className="text-right">{formatCurrency(footerValues.breakdown.gastos.total)}</span>
                                  <div className="col-span-2 h-px bg-border my-1" />
                                  <span className="font-bold text-primary border-t pt-1">Resultado Neto:</span>
                                  <span className="text-right font-bold text-primary border-t pt-1">{formatCurrency(footerValues.total)}</span>
                                </>
                              ) : (
                                <>
                                  <span className="text-muted-foreground">Suma Real:</span>
                                  <span className="text-right">{formatCurrency(totalsReales.total)}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documentos.map((doc, index) => {
                const tipoLower = (doc.tipo_documento || '').toLowerCase();
                const sign = tipoLower.includes('abono') || tipoLower.includes('crédito') ? -1 : 1;

                const baseImponible = (Math.abs(doc.base_imponible || 0)) * sign;
                const ivaRealVal = Math.abs(doc.iva || 0) || Math.abs((doc.total || 0) - (doc.base_imponible || 0));
                const ivaTotal = ivaRealVal * sign;
                const total = Math.abs(doc.total || 0); // we apply sign visually in the cell later or right here

                const fechaEmision = doc.fecha_emision
                  ? new Date(doc.fecha_emision).toLocaleDateString('es-ES')
                  : '-';

                return (
                  <TableRow
                    key={doc.id_documento}
                    className={cn(
                      'cursor-pointer hover:bg-accent/50 hover:shadow-md transition-all duration-200 group animate-fade-in',
                      tipoLower.includes('abono') && 'bg-red-500/5 hover:bg-red-500/10'
                    )}
                    style={{ animationDelay: `${index * 50}ms` }}
                    onClick={() => handleRowClick(doc)}
                  >
                    {/* Tipo Documento */}
                    <TableCell className="text-xs sm:text-sm">
                      <Badge
                        variant="secondary"
                        className="text-[10px] sm:text-xs whitespace-nowrap transition-all duration-200 group-hover:scale-105 group-hover:shadow-sm"
                      >
                        {doc.tipo_documento}
                      </Badge>
                    </TableCell>

                    {/* Número Documento */}
                    <TableCell className="font-medium text-xs sm:text-sm group-hover:text-primary transition-colors duration-200">
                      {doc.numero_documento}
                    </TableCell>

                    {/* Fecha */}
                    <TableCell className="text-xs sm:text-sm whitespace-nowrap group-hover:text-foreground transition-colors duration-200">
                      {fechaEmision}
                    </TableCell>

                    {/* Empresa */}
                    <TableCell className="text-xs sm:text-sm">
                      <div className="flex items-center gap-1.5 sm:gap-2">
                        <Building2 className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground shrink-0 transition-all duration-200 group-hover:text-primary group-hover:scale-110" />
                        <span className="truncate max-w-[150px] sm:max-w-[200px] group-hover:text-foreground transition-colors duration-200" title={doc.empresa_nombre || 'Sin empresa'}>
                          {doc.empresa_nombre || 'Sin empresa'}
                        </span>
                      </div>
                    </TableCell>

                    {/* Proveedor */}
                    <TableCell className="text-xs sm:text-sm">
                      <span className="truncate max-w-[150px] sm:max-w-[200px] block group-hover:text-foreground transition-colors duration-200" title={doc.proveedor || '-'}>
                        {doc.proveedor || '-'}
                      </span>
                    </TableCell>

                    {/* Cliente */}
                    <TableCell className="text-xs sm:text-sm">
                      <span className="truncate max-w-[150px] sm:max-w-[200px] block group-hover:text-foreground transition-colors duration-200" title={doc.entidades?.find(e => e.rol === 'cliente' || e.rol === 'receptor')?.nombre || '-'}>
                        {doc.entidades?.find(e => e.rol === 'cliente' || e.rol === 'receptor')?.nombre || '-'}
                      </span>
                    </TableCell>

                    {/* Base Imponible - CON FORMATO */}
                    <TableCell className="text-right text-xs sm:text-sm tabular-nums group-hover:text-foreground group-hover:scale-105 transition-all duration-200">
                      {formatCurrency(baseImponible)}
                    </TableCell>

                    {/* Recargo - CON FORMATO */}
                    <TableCell className="text-right text-xs sm:text-sm tabular-nums group-hover:text-foreground group-hover:scale-105 transition-all duration-200">
                      {formatCurrency((doc as any).recargo || 0)}
                    </TableCell>

                    {/* Retención - CON FORMATO */}
                    <TableCell className="text-right text-xs sm:text-sm tabular-nums group-hover:text-foreground group-hover:scale-105 transition-all duration-200">
                      {formatCurrency((doc as any).retencion || 0)}
                    </TableCell>

                    {/* IVA - CON FORMATO */}
                    <TableCell className="text-right text-xs sm:text-sm tabular-nums group-hover:text-foreground group-hover:scale-105 transition-all duration-200">
                      {formatCurrency(ivaTotal)}
                    </TableCell>

                    {/* Total - CON FORMATO y COLOR PARA ABONOS */}
                    <TableCell className={cn("text-right font-semibold text-xs sm:text-sm tabular-nums group-hover:text-primary group-hover:scale-110 transition-all duration-200", tipoLower.includes('abono') ? 'text-red-500' : '')}>
                      {formatCurrency(total * (tipoLower.includes('abono') ? -1 : 1))}
                    </TableCell>

                    {/* Estado */}
                    <TableCell className="text-center">
                      {doc.incidencia ? (
                        <Badge
                          variant="destructive"
                          className="text-[10px] sm:text-xs whitespace-nowrap transition-all duration-20 group-hover:scale-110 group-hover:shadow-md animate-pulse"
                        >
                          Incidencia
                        </Badge>
                      ) : (
                        <span className="text-[10px] sm:text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* 📱 INDICADOR DE SCROLL HORIZONTAL CON GRADIENTE */}
      <div className="sm:hidden bg-gradient-to-r from-muted/30 via-muted/50 to-muted/30 px-4 py-2 text-center border-t">
        <p className="text-[10px] text-muted-foreground animate-pulse">
          ← Desliza para ver más columnas →
        </p>
      </div>

      {/* 🎨 ANIMACIONES GLOBALES */}
      <style jsx global>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-fade-in {
          animation: fade-in 0.5s ease-out forwards;
          opacity: 0;
        }

        @media (prefers-reduced-motion: reduce) {
          .animate-fade-in {
            animation: none;
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}