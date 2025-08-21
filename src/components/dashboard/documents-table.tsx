

'use client';

import Link from 'next/link';
import { MoreHorizontal, CheckCircle2, AlertCircle, FileText, BrainCircuit } from 'lucide-react';
import type { ColumnDef, Row } from '@tanstack/react-table';
import { flexRender } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { type Document, type IvaDetail } from '@/lib/types';
import { SummarizeDialog } from './summarize-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DataTable } from '@/components/ui/data-table';
import { useState, useMemo, useCallback, useEffect } from 'react';
import { updateDocumentField } from '@/services/document-service';
import { useToast } from '@/hooks/use-toast';
import { Checkbox } from '../ui/checkbox';
import { EditableCell } from './editable-cell';
import { TableCell, TableRow } from '../ui/table';

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
        const utcDate = new Date(d.valueOf() + d.getTimezoneOffset() * 60 * 1000);
        return new Intl.DateTimeFormat('es-ES', {
            year: 'numeric', month: '2-digit', day: '2-digit'
        }).format(utcDate);
    } catch {
        return 'Fecha inválida';
    }
}

const getColumns = (
    onUpdate: (docId: number, field: string, value: any) => void,
    onSummarize: (doc: Document) => void,
    uniqueVatRates: number[]
): ColumnDef<Document>[] => {
  const columns: ColumnDef<Document>[] = [
     {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: 'id_documento',
      header: 'Nº Orden',
      cell: ({ row }) => <div>{row.getValue('id_documento')}</div>
    },
    {
      accessorKey: 'fecha_emision',
      header: 'Fecha Contable',
      cell: ({ row }) => <EditableCell docId={row.original.id_documento} initialValue={row.getValue('fecha_emision')} fieldName="fecha_emision" onUpdate={onUpdate} inputType='date' />
    },
    {
      accessorKey: 'fecha_vencimiento',
      header: 'Fecha Documento',
      cell: ({ row }) => <EditableCell docId={row.original.id_documento} initialValue={row.getValue('fecha_vencimiento')} fieldName="fecha_vencimiento" onUpdate={onUpdate} inputType='date' />
    },
    {
        accessorKey: 'proveedor',
        header: 'Proveedor',
        cell: ({ row }) => <EditableCell docId={row.original.id_documento} initialValue={row.getValue('proveedor')} fieldName="proveedor_nombre" onUpdate={onUpdate} />
    },
    {
        accessorKey: 'cif',
        header: 'CIF',
        cell: ({ row }) => <EditableCell docId={row.original.id_documento} initialValue={row.getValue('cif')} fieldName="proveedor_cif" onUpdate={onUpdate} />
    },
    {
      accessorKey: 'observaciones',
      header: 'Concepto',
      cell: ({ row }) => <EditableCell docId={row.original.id_documento} initialValue={row.getValue('observaciones')} fieldName="observaciones" onUpdate={onUpdate} />
    },
    {
      accessorKey: 'tipo_documento',
      header: 'Tipo Gasto',
      cell: ({ row }) => <EditableCell docId={row.original.id_documento} initialValue={row.getValue('tipo_documento')} fieldName="tipo_documento" onUpdate={onUpdate} />
    },
    ...uniqueVatRates.flatMap(rate => ([
        {
            id: `base_${rate}`,
            header: `Base ${rate}%`,
            cell: ({ row }: { row: Row<Document> }) => {
                const ivaDetail = row.original.iva_details.find(i => i.porcentaje === rate);
                return <EditableCell docId={row.original.id_documento} initialValue={ivaDetail?.base_imponible ?? 0} fieldName={`iva_base_${rate}`} onUpdate={onUpdate} isCurrency />
            }
        },
        {
            id: `iva_${rate}`,
            header: `IVA ${rate}%`,
            cell: ({ row }: { row: Row<Document> }) => {
                const ivaDetail = row.original.iva_details.find(i => i.porcentaje === rate);
                return <EditableCell docId={row.original.id_documento} initialValue={ivaDetail?.cuota ?? 0} fieldName={`iva_cuota_${rate}`} onUpdate={onUpdate} isCurrency />
            }
        }
    ])),
     {
      accessorKey: 'retencion',
      header: 'Retención',
      cell: ({ row }: { row: Row<Document> }) => <EditableCell docId={row.original.id_documento} initialValue={0} fieldName="retencion" onUpdate={onUpdate} isCurrency />
    },
    {
      accessorKey: 'base_imponible',
      header: 'Total Base',
      cell: ({ row }) => <EditableCell docId={row.original.id_documento} initialValue={row.getValue('base_imponible')} fieldName="importe_sin_impuestos" onUpdate={onUpdate} isCurrency />
    },
    {
      accessorKey: 'iva',
      header: 'Total IVA',
      cell: ({ row }) => <EditableCell docId={row.original.id_documento} initialValue={row.getValue('iva')} fieldName="iva_total" onUpdate={onUpdate} isCurrency />
    },
    {
      accessorKey: 'total',
      header: 'Total',
      cell: ({ row }) => <EditableCell docId={row.original.id_documento} initialValue={row.getValue('total')} fieldName="importe_total" onUpdate={onUpdate} isCurrency />
    },
    {
      id: 'actions',
      cell: ({ row }) => {
        const doc = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <span className="sr-only">Abrir menú</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/documento/${doc.id_documento}`}>Ver detalles</Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onSummarize(doc)}>
                Resumir con IA
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  return columns;
}

export function DocumentsTable({ documents, hiddenColumns = [], isIncidentsPage = false }: { documents: Document[], hiddenColumns?: string[], isIncidentsPage?: boolean }) {
  const [tableData, setTableData] = useState(documents);
  const { toast } = useToast();
  const [isSummarizeOpen, setIsSummarizeOpen] = useState(false);
  const [selectedDocForSummary, setSelectedDocForSummary] = useState<Document | null>(null);

   useEffect(() => {
    setTableData(documents);
  }, [documents]);

  const handleUpdate = useCallback((docId: number, field: string, value: any) => {
    setTableData(prevData => {
        return prevData.map(doc => {
            if (doc.id_documento === docId) {
                // This is a simplified update. For nested fields like IVA, a more complex logic would be needed.
                return { ...doc, [field as keyof Document]: value };
            }
            return doc;
        });
    });
  }, []);
  
  const uniqueVatRates = useMemo(() => {
    const rates = new Set<number>();
    documents.forEach(doc => {
        doc.iva_details.forEach(detail => {
            rates.add(detail.porcentaje);
        });
    });
    // Let's add some default rates to ensure the columns are always there
    [0, 4, 10, 21].forEach(rate => rates.add(rate));
    return Array.from(rates).sort((a,b) => b - a); // Sort descending
  }, [documents]);


  const handleSummarize = (doc: Document) => {
    setSelectedDocForSummary(doc);
    setIsSummarizeOpen(true);
  };

  const columns = useMemo(() => getColumns(handleUpdate, handleSummarize, uniqueVatRates), [handleUpdate, uniqueVatRates]);
  
  const renderRow = (row: Row<Document>) => {
    const doc = row.original;
    return (
        <ContextMenu>
            <ContextMenuTrigger asChild>
                <TableRow
                    data-state={row.getIsSelected() && 'selected'}
                    className="bg-background even:bg-muted/50 hover:bg-muted/75"
                >
                    {row.getVisibleCells().map(cell => (
                        <TableCell key={cell.id} style={{ width: cell.column.getSize() }} className="whitespace-nowrap">
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                    ))}
                </TableRow>
            </ContextMenuTrigger>
            <ContextMenuContent>
                <ContextMenuItem asChild>
                    <Link href={`/documento/${doc.id_documento}`} className="flex items-center">
                        <FileText className="mr-2 h-4 w-4" /> Ver detalles
                    </Link>
                </ContextMenuItem>
                <ContextMenuItem onClick={() => handleSummarize(doc)}>
                    <BrainCircuit className="mr-2 h-4 w-4" /> Resumir con IA
                </ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    );
};


  return (
    <>
    <TooltipProvider>
      <DataTable columns={columns} data={tableData} hiddenColumns={hiddenColumns} renderRow={renderRow}/>
    </TooltipProvider>
    <SummarizeDialog 
        doc={selectedDocForSummary}
        isOpen={isSummarizeOpen}
        setIsOpen={setIsSummarizeOpen}
      />
    </>
  );
}
