'use client';

import * as React from 'react';
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

export function TrimestreTable({
  documentos,
  onDocumentClick,
  className,
}: TrimestreTableProps) {
  if (documentos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <FileText className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold">No hay documentos</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Este trimestre no tiene documentos registrados
        </p>
      </div>
    );
  }

  return (
    <div className={cn('rounded-lg border', className)}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tipo</TableHead>
            <TableHead>N° Documento</TableHead>
            <TableHead>Fecha</TableHead>
            <TableHead>Empresa</TableHead>
            <TableHead>Proveedor/Cliente</TableHead>
            <TableHead className="text-right">Base</TableHead>
            <TableHead className="text-right">IVA</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead className="text-center">Estado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {documentos.map((doc) => {
            // ✅ Usar las propiedades correctas del tipo Document
            const baseImponible = doc.base_imponible || 0;
            const ivaTotal = doc.iva || 0;
            const total = doc.total || 0;
            
            // ✅ Manejar fecha null
            const fechaEmision = doc.fecha_emision 
              ? new Date(doc.fecha_emision).toLocaleDateString('es-ES')
              : '-';
            
            return (
              <TableRow
                key={doc.id_documento}
                className={cn(
                  'cursor-pointer hover:bg-muted/50'
                )}
                onClick={() => onDocumentClick?.(doc)}
              >
                <TableCell>
                  <Badge variant="secondary">
                    {doc.tipo_documento}
                  </Badge>
                </TableCell>
                <TableCell className="font-medium">
                  {doc.numero_documento}
                </TableCell>
                <TableCell>
                  {fechaEmision}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    {doc.empresa_nombre || 'Sin empresa'}
                  </div>
                </TableCell>
                <TableCell>{doc.proveedor || '-'}</TableCell>
                <TableCell className="text-right">
                  €{baseImponible.toFixed(2)}
                </TableCell>
                <TableCell className="text-right">
                  €{ivaTotal.toFixed(2)}
                </TableCell>
                <TableCell className="text-right font-semibold">
                  €{total.toFixed(2)}
                </TableCell>
                <TableCell className="text-center">
                  {doc.incidencia && (
                    <Badge variant="destructive" className="text-xs">
                      Incidencia
                    </Badge>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}