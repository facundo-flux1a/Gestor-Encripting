

'use client';

import Link from 'next/link';
import { MoreHorizontal, CheckCircle2, AlertCircle } from 'lucide-react';
import { type ColumnDef } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { type Document } from '@/lib/types';
import { SummarizeDialog } from './summarize-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DataTable } from '@/components/ui/data-table';
import { useState, useEffect, useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { EditableCell } from './editable-cell';

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

// Helper to create pivoted IVA columns
const createIvaColumns = (onUpdate: (id: number, field: string, value: any) => void): ColumnDef<Document>[] => {
    const ivaTypes = [21, 10, 4, 0];
    return ivaTypes.flatMap(type => [
        {
            id: `base_${type}`,
            accessorFn: (row) => row.iva_details.find(i => i.porcentaje === type)?.base_imponible,
            header: `Base ${type}%`,
            cell: ({ row }) => (
                <div className="text-right">
                    <EditableCell
                        initialValue={row.original.iva_details.find(i => i.porcentaje === type)?.base_imponible}
                        docId={row.original.id_documento}
                        fieldName={`iva_base_${type}`}
                        onUpdate={onUpdate}
                        inputType="number"
                        isCurrency
                    />
                </div>
            ),
        },
        {
            id: `cuota_${type}`,
            accessorFn: (row) => row.iva_details.find(i => i.porcentaje === type)?.cuota,
            header: `IVA ${type}%`,
            cell: ({ row }) => (
                <div className="text-right">
                     <EditableCell
                        initialValue={row.original.iva_details.find(i => i.porcentaje === type)?.cuota}
                        docId={row.original.id_documento}
                        fieldName={`iva_cuota_${type}`}
                        onUpdate={onUpdate}
                        inputType="number"
                        isCurrency
                    />
                </div>
            ),
        }
    ]);
};

const getBaseColumns = (onUpdate: (id: number, field: string, value: any) => void): ColumnDef<Document>[] => [
    {
        accessorKey: 'numero_factura',
        header: 'Nº Factura',
    },
    {
        accessorKey: 'tipo_documento',
        header: 'Tipo',
    },
    {
        accessorKey: 'fecha_emision',
        header: 'Fecha Emisión',
        cell: ({ row }) => formatDate(row.getValue('fecha_emision'))
    },
     {
        accessorKey: 'fecha_vencimiento',
        header: 'Fecha Vencimiento',
        cell: ({ row }) => formatDate(row.getValue('fecha_vencimiento'))
    },
    {
        accessorKey: 'proveedor',
        header: 'Proveedor',
    },
    {
        accessorKey: 'cif',
        header: 'CIF',
    },
    {
        accessorKey: 'base_imponible',
        header: () => <div className='text-right'>Total Base</div>,
        cell: ({ row }) => (
            <div className="text-right">
                {formatCurrency(row.getValue('base_imponible'), row.original.moneda)}
            </div>
        )
    },
    {
        accessorKey: 'iva',
        header: () => <div className='text-right'>Total IVA</div>,
        cell: ({ row }) => (
             <div className="text-right">
                {formatCurrency(row.getValue('iva'), row.original.moneda)}
            </div>
        )
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
        accessorKey: 'observaciones',
        header: 'Observaciones',
        cell: ({ row }) => (
            <EditableCell
                initialValue={row.getValue('observaciones')}
                docId={row.original.id_documento}
                fieldName="observaciones"
                onUpdate={onUpdate}
            />
        )
    },
    {
        accessorKey: 'verificado',
        header: () => <div className='text-center'>Estado</div>,
        cell: ({ row }) => {
            const isVerified = row.original.verificado;
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
            const isVerified = row.original.verificado;
            if (value === 'validado') return isVerified === true;
            if (value === 'pendiente') return isVerified === false;
            return true;
        }
    },
];

export function DocumentsTable({ documents, hiddenColumns, isIncidentsPage = false }: { documents: Document[], hiddenColumns?: string[], isIncidentsPage?: boolean }) {
  const [tableData, setTableData] = useState(documents);
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [isSummarizeOpen, setIsSummarizeOpen] = useState(false);
  
  useEffect(() => {
    setTableData(documents);
  }, [documents]);

  const handleSummarizeClick = (doc: Document) => {
    setSelectedDoc(doc);
    setIsSummarizeOpen(true);
  };
  
  const handleUpdate = (docId: number, field: string, value: any) => {
    setTableData(prevData =>
      prevData.map(doc =>
        doc.id_documento === docId ? { ...doc, [field]: value } : doc
      )
    );
  };

  const columns = useMemo(() => {
      const baseColumns = getBaseColumns(handleUpdate);
      const ivaColumns = createIvaColumns(handleUpdate);
      const incidentReasonColumn: ColumnDef<Document> = {
            accessorKey: 'incidencia_razon',
            header: 'Razón Incidencia',
      };
      
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
                      <DropdownMenuItem onClick={() => handleSummarizeClick(doc)}>
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

      let assembledColumns = [...baseColumns];
      if (isIncidentsPage) {
          const providerIndex = assembledColumns.findIndex(c => c.accessorKey === 'proveedor');
          if (providerIndex !== -1) {
              assembledColumns.splice(providerIndex + 1, 0, incidentReasonColumn);
          } else {
              assembledColumns.push(incidentReasonColumn);
          }
      }
      assembledColumns.splice(assembledColumns.findIndex(c => c.accessorKey === 'cif') + 1, 0, ...ivaColumns);
      assembledColumns.push(actionsColumn);
      
      return assembledColumns;
  }, [isIncidentsPage]);

  return (
    <TooltipProvider>
        <DataTable columns={columns} data={tableData} hiddenColumns={hiddenColumns} />
        <SummarizeDialog doc={selectedDoc} isOpen={isSummarizeOpen} setIsOpen={setIsSummarizeOpen} />
    </TooltipProvider>
  );
}
