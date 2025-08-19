

'use client';

import Link from 'next/link';
import { MoreHorizontal, CheckCircle2, AlertCircle } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { type Document } from '@/lib/types';
import { SummarizeDialog } from './summarize-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DataTable } from '@/components/ui/data-table';
import { useState, useMemo } from 'react';

const formatCurrency = (amount: number | null | undefined, currency = 'EUR') => {
    if (amount === null || amount === undefined || isNaN(amount)) return 'N/A';
    return new Intl.NumberFormat('es-ES', {
        style: 'currency',
        currency,
    }).format(amount);
};

const formatDate = (date: string | null | undefined) => {
    if (!date) return 'N/A';
    try {
        const d = new Date(date);
        // Ensure date is treated as UTC to avoid timezone shifts
        const utcDate = new Date(d.valueOf() + d.getTimezoneOffset() * 60 * 1000);
        return new Intl.DateTimeFormat('es-ES', {
            year: 'numeric', month: '2-digit', day: '2-digit'
        }).format(utcDate);
    } catch {
        return 'Fecha inválida';
    }
}

const getColumns = (
  onSummarizeClick: (doc: Document) => void,
  isIncidentsPage: boolean
): ColumnDef<Document>[] => {

  const baseColumns: ColumnDef<Document>[] = [
    {
      accessorKey: 'numero_factura',
      header: 'Nº Factura',
       cell: ({ row }) => <div>{row.getValue('numero_factura')}</div>,
    },
    {
      accessorKey: 'tipo_documento',
      header: 'Tipo',
      cell: ({ row }) => <div>{row.getValue('tipo_documento')}</div>,
    },
    {
      accessorKey: 'fecha_emision',
      header: 'Fecha Emisión',
      cell: ({ row }) => <div>{formatDate(row.getValue('fecha_emision'))}</div>
    },
    {
        accessorKey: 'proveedor',
        header: 'Proveedor',
        cell: ({ row }) => <div>{row.getValue('proveedor')}</div>,
    },
    {
        accessorKey: 'total',
        header: () => <div className='text-right font-bold'>Total</div>,
        cell: ({ row }) => (
            <div className="text-right font-bold">
                {formatCurrency(row.getValue('total'), row.original.moneda)}
            </div>
        )
    },
    {
      accessorKey: 'verificado',
      header: () => <div className='text-center'>Estado</div>,
      cell: ({ row }) => {
          const isVerified = !row.original.incidencia;
          return (
              <Tooltip>
                  <TooltipTrigger asChild>
                      <div className="flex justify-center">
                          {!isVerified ? (
                              <AlertCircle className="h-5 w-5 text-destructive" />
                          ) : (
                              <CheckCircle2 className="h-5 w-5 text-green-500" />
                          )}
                      </div>
                  </TooltipTrigger>
                  <TooltipContent>
                      <p>{!isVerified ? 'Pendiente de Revisión' : 'Validado'}</p>
                  </TooltipContent>
              </Tooltip>
          )
      },
      filterFn: (row, id, value) => {
          const isVerified = !row.original.incidencia;
          if (value === 'validado') return isVerified === true;
          if (value === 'pendiente') return isVerified === false;
          return true;
      }
    },
  ];

  if (isIncidentsPage) {
      const reasonColumn: ColumnDef<Document> = {
          accessorKey: 'incidencia_razon',
          header: 'Razón Incidencia',
          cell: ({ row }) => <div>{row.original.incidencia_razon || 'N/A'}</div>
      };
      const providerIndex = baseColumns.findIndex(c => c.accessorKey === 'proveedor');
      if (providerIndex !== -1) {
          baseColumns.splice(providerIndex + 1, 0, reasonColumn);
      } else {
          baseColumns.push(reasonColumn);
      }
  }

  const actionsColumn: ColumnDef<Document> = {
      id: 'actions',
      cell: ({ row }) => {
          const doc = row.original
          return (
              <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="h-8 w-8 p-0">
                      <span className="sr-only">Open menu</span>
                      <MoreHorizontal className="h-4 w-4" />
                  </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                      <Link href={`/documento/${doc.id_documento}`}>
                          Ver más detalles
                      </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onSummarizeClick(doc)}>
                      Resumir con IA
                  </DropdownMenuItem>
                  </DropdownMenuContent>
              </DropdownMenu>
          )
      },
      enableSorting: false,
      enableColumnFilter: false,
      enableHiding: false,
  };
  
  return [...baseColumns, actionsColumn];
}

export function DocumentsTable({ documents, hiddenColumns = [], isIncidentsPage = false }: { documents: Document[], hiddenColumns?: string[], isIncidentsPage?: boolean }) {
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [isSummarizeOpen, setIsSummarizeOpen] = useState(false);

  const handleSummarizeClick = (doc: Document) => {
    setSelectedDoc(doc);
    setIsSummarizeOpen(true);
  };
  
  const columns = useMemo(
    () => getColumns(handleSummarizeClick, isIncidentsPage),
    [isIncidentsPage]
  );

  return (
    <TooltipProvider>
        <DataTable columns={columns} data={documents} hiddenColumns={hiddenColumns} />
        <SummarizeDialog doc={selectedDoc} isOpen={isSummarizeOpen} setIsOpen={setIsSummarizeOpen} />
    </TooltipProvider>
  );
}
