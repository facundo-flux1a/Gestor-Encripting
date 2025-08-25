

'use client';

import Link from 'next/link';
import { MoreHorizontal, FileText, BrainCircuit } from 'lucide-react';
import type { ColumnDef, Row, Table as TanstackTable } from '@tanstack/react-table';
import { flexRender } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { type Document } from '@/lib/types';
import { SummarizeDialog } from './summarize-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { TooltipProvider } from '@/components/ui/tooltip';
import { DataTable } from '@/components/ui/data-table';
import { useState, useMemo, useCallback, useEffect } from 'react';
import { Checkbox } from '../ui/checkbox';
import { EditableCell } from './editable-cell';
import { TableCell, TableRow } from '../ui/table';

const getColumns = (
    onUpdate: (docId: number, field: string, value: any) => void,
    onSummarize: (doc: Document) => void,
    uniqueVatRates: number[]
): ColumnDef<Document>[] => {
  const columns: ColumnDef<Document>[] = [
     {
        id: 'select',
        header: ({ table }) => (
            <div className="flex items-center gap-2">
                <Checkbox
                    checked={table.getIsAllPageRowsSelected()}
                    onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
                    aria-label="Select all"
                />
                <span>ID</span>
            </div>
        ),
        cell: ({ row }) => (
            <div className="flex items-center gap-2">
                 <Checkbox
                    checked={row.getIsSelected()}
                    onCheckedChange={(value) => row.toggleSelected(!!value)}
                    aria-label="Select row"
                    onClick={(e) => e.stopPropagation()}
                />
                <span>{row.original.id_documento}</span>
            </div>
        ),
        enableHiding: false,
        footer: () => 'Totales',
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
            },
            footer: ({ table }) => {
                const total = table.getFilteredRowModel().rows.reduce((sum, row) => {
                    const detail = row.original.iva_details.find(d => d.porcentaje === rate);
                    return sum + (detail?.base_imponible || 0);
                }, 0);
                return <div className="text-right font-bold">{total.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</div>;
            }
        },
        {
            id: `iva_${rate}`,
            header: `IVA ${rate}%`,
            cell: ({ row }: { row: Row<Document> }) => {
                const ivaDetail = row.original.iva_details.find(i => i.porcentaje === rate);
                return <EditableCell docId={row.original.id_documento} initialValue={ivaDetail?.cuota ?? 0} fieldName={`iva_cuota_${rate}`} onUpdate={onUpdate} isCurrency />
            },
             footer: ({ table }) => {
                const total = table.getFilteredRowModel().rows.reduce((sum, row) => {
                    const detail = row.original.iva_details.find(d => d.porcentaje === rate);
                    return sum + (detail?.cuota || 0);
                }, 0);
                return <div className="text-right font-bold">{total.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</div>;
            }
        }
    ])),
     {
      accessorKey: 'retencion',
      header: 'Retención',
      cell: ({ row }: { row: Row<Document> }) => <EditableCell docId={row.original.id_documento} initialValue={0} fieldName="retencion" onUpdate={onUpdate} isCurrency />,
      footer: ({ table }) => {
          // Assuming 'retencion' is not a direct field, so we sum a placeholder or a calculated value if available.
          const total = table.getFilteredRowModel().rows.reduce((sum, row) => sum + 0, 0); // Replace with actual field if exists
          return <div className="text-right font-bold">{total.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</div>;
      }
    },
    {
      accessorKey: 'base_imponible',
      header: 'Total Base',
      cell: ({ row }) => <EditableCell docId={row.original.id_documento} initialValue={row.getValue('base_imponible')} fieldName="importe_sin_impuestos" onUpdate={onUpdate} isCurrency />,
      footer: ({ table }) => {
          const total = table.getFilteredRowModel().rows.reduce((sum, row) => sum + (row.original.base_imponible || 0), 0);
          return <div className="text-right font-bold">{total.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</div>;
      }
    },
    {
      accessorKey: 'iva',
      header: 'Total IVA',
      cell: ({ row }) => <EditableCell docId={row.original.id_documento} initialValue={row.getValue('iva')} fieldName="iva_total" onUpdate={onUpdate} isCurrency />,
       footer: ({ table }) => {
          const total = table.getFilteredRowModel().rows.reduce((sum, row) => sum + (row.original.iva || 0), 0);
          return <div className="text-right font-bold">{total.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</div>;
      }
    },
    {
      accessorKey: 'total',
      header: 'Total',
      cell: ({ row }) => <EditableCell docId={row.original.id_documento} initialValue={row.getValue('total')} fieldName="importe_total" onUpdate={onUpdate} isCurrency />,
       footer: ({ table }) => {
          const total = table.getFilteredRowModel().rows.reduce((sum, row) => sum + (row.original.total || 0), 0);
          return <div className="text-right font-bold">{total.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</div>;
      }
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
       footer: () => null
    },
  ];

  return columns;
}

export function DocumentsTable({ documents, hiddenColumns = [], isIncidentsPage = false, filename = 'documentos' }: { documents: Document[], hiddenColumns?: string[], isIncidentsPage?: boolean, filename?: string }) {
  const [tableData, setTableData] = useState(documents);
  const [isSummarizeOpen, setIsSummarizeOpen] = useState(false);
  const [selectedDocForSummary, setSelectedDocForSummary] = useState<Document | null>(null);

   useEffect(() => {
    setTableData(documents);
  }, [documents]);

  const handleUpdate = useCallback((docId: number, field: string, value: any) => {
    setTableData(prevData => {
        return prevData.map(doc => {
            if (doc.id_documento === docId) {
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
            // Normalize percentage to a number to avoid duplicates like 4 and 4.00
            rates.add(Number(detail.porcentaje));
        });
    });
    // Ensure standard rates are always present for column stability, even if empty.
    [0, 4, 10, 21].forEach(rate => rates.add(rate));
    return Array.from(rates).sort((a,b) => b - a); 
  }, [documents]);


  const handleSummarize = (doc: Document) => {
    setSelectedDocForSummary(doc);
    setIsSummarizeOpen(true);
  };

  const columns = useMemo(() => getColumns(handleUpdate, handleSummarize, uniqueVatRates), [handleUpdate, uniqueVatRates]);
  
  const renderRow = (row: Row<Document>) => {
    const doc = row.original;
    return (
        <ContextMenu key={row.original.id_documento}>
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
      <DataTable columns={columns} data={tableData} hiddenColumns={hiddenColumns} renderRow={renderRow} filename={filename} />
    </TooltipProvider>
    <SummarizeDialog 
        doc={selectedDocForSummary}
        isOpen={isSummarizeOpen}
        setIsOpen={setIsSummarizeOpen}
      />
    </>
  );
}
