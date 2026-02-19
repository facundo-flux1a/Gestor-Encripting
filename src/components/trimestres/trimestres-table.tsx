'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Lock, Building2 } from 'lucide-react';
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
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-xs sm:text-sm font-semibold">Tipo</TableHead>
                <TableHead className="text-xs sm:text-sm font-semibold">N° Documento</TableHead>
                <TableHead className="text-xs sm:text-sm font-semibold">Fecha</TableHead>
                <TableHead className="text-xs sm:text-sm font-semibold">Empresa</TableHead>
                <TableHead className="text-xs sm:text-sm font-semibold">Proveedor/Cliente</TableHead>
                <TableHead className="text-right text-xs sm:text-sm font-semibold">Base</TableHead>
                <TableHead className="text-right text-xs sm:text-sm font-semibold">IVA</TableHead>
                <TableHead className="text-right text-xs sm:text-sm font-semibold">Total</TableHead>
                <TableHead className="text-center text-xs sm:text-sm font-semibold">Estado</TableHead>
              </TableRow>
              {/* ✅ TOTALS ROW (Replicated from DocumentsTable) */}
              <TableRow className="bg-muted/50 hover:bg-muted/50 font-bold border-b-2 border-primary/20">
                <TableHead colSpan={5} className="text-right text-xs sm:text-sm">Totales del Periodo:</TableHead>
                <TableHead className="text-right text-xs sm:text-sm text-foreground">
                  {formatCurrency(documentos.reduce((sum, doc) => sum + (doc.base_imponible || 0), 0))}
                </TableHead>
                <TableHead className="text-right text-xs sm:text-sm text-foreground">
                  {formatCurrency(documentos.reduce((sum, doc) => sum + (doc.iva || 0), 0))}
                </TableHead>
                <TableHead className="text-right text-xs sm:text-sm text-primary text-base">
                  {formatCurrency(documentos.reduce((sum, doc) => sum + (doc.total || 0), 0))}
                </TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documentos.map((doc, index) => {
                const baseImponible = doc.base_imponible || 0;
                const ivaTotal = doc.iva || 0;
                const total = doc.total || 0;

                const fechaEmision = doc.fecha_emision
                  ? new Date(doc.fecha_emision).toLocaleDateString('es-ES')
                  : '-';

                return (
                  <TableRow
                    key={doc.id_documento}
                    className={cn(
                      'cursor-pointer hover:bg-accent/50 hover:shadow-md transition-all duration-200 group animate-fade-in'
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

                    {/* Base Imponible - CON FORMATO */}
                    <TableCell className="text-right text-xs sm:text-sm tabular-nums group-hover:text-foreground group-hover:scale-105 transition-all duration-200">
                      {formatCurrency(baseImponible)}
                    </TableCell>

                    {/* IVA - CON FORMATO */}
                    <TableCell className="text-right text-xs sm:text-sm tabular-nums group-hover:text-foreground group-hover:scale-105 transition-all duration-200">
                      {formatCurrency(ivaTotal)}
                    </TableCell>

                    {/* Total - CON FORMATO */}
                    <TableCell className="text-right font-semibold text-xs sm:text-sm tabular-nums group-hover:text-primary group-hover:scale-110 transition-all duration-200">
                      {formatCurrency(total)}
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