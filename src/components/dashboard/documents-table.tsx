

'use client';

import Link from 'next/link';
import { MoreHorizontal, FileText, BrainCircuit } from 'lucide-react';
import type { ColumnDef, Row, Table as TanstackTable } from '@tanstack/react-table';
import { flexRender, useReactTable } from '@tanstack/react-table';
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
    onUpdate: (docId: number, field: string, value: any, table: TanstackTable<Document>, rowIndex: number) => void,
    onSummarize: (doc: Document) => void
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
      accessorKey: 'numero_documento',
      header: 'Nº Factura',
      cell: ({ row, table }) => <EditableCell docId={row.original.id_documento} initialValue={row.getValue('numero_documento')} fieldName="numero_documento" onUpdate={onUpdate} table={table} rowIndex={row.index} />
    },
    {
      accessorKey: 'fecha_emision',
      header: 'Fecha Contable',
      cell: ({ row, table }) => <EditableCell docId={row.original.id_documento} initialValue={row.getValue('fecha_emision')} fieldName="fecha_emision" onUpdate={onUpdate} table={table} rowIndex={row.index} inputType='date' />
    },
    {
      accessorKey: 'fecha_vencimiento',
      header: 'Fecha Documento',
      cell: ({ row, table }) => <EditableCell docId={row.original.id_documento} initialValue={row.getValue('fecha_vencimiento')} fieldName="fecha_vencimiento" onUpdate={onUpdate} table={table} rowIndex={row.index} inputType='date' />
    },
    {
        accessorKey: 'proveedor',
        header: 'Proveedor',
        cell: ({ row, table }) => <EditableCell docId={row.original.id_documento} initialValue={row.getValue('proveedor')} fieldName="proveedor_nombre" onUpdate={onUpdate} table={table} rowIndex={row.index} />
    },
    {
        accessorKey: 'cif',
        header: 'CIF',
        cell: ({ row, table }) => <EditableCell docId={row.original.id_documento} initialValue={row.getValue('cif')} fieldName="proveedor_cif" onUpdate={onUpdate} table={table} rowIndex={row.index} />
    },
    {
      accessorKey: 'observaciones',
      header: 'Concepto',
      cell: ({ row, table }) => <EditableCell docId={row.original.id_documento} initialValue={row.getValue('observaciones')} fieldName="observaciones" onUpdate={onUpdate} table={table} rowIndex={row.index} />
    },
    {
      accessorKey: 'tipo_documento',
      header: 'Tipo Documento',
      cell: ({ row, table }) => <EditableCell docId={row.original.id_documento} initialValue={row.getValue('tipo_documento')} fieldName="tipo_documento" onUpdate={onUpdate} table={table} rowIndex={row.index} />
    },
    ...[21, 10, 4, 0].flatMap(rate => ([
        {
            id: `base_${rate}`,
            header: `Base ${rate}%`,
            cell: ({ row, table }: { row: Row<Document>, table: TanstackTable<Document> }) => {
                const ivaDetail = row.original.iva_details.find(i => Number(i.porcentaje) === rate);
                return <EditableCell docId={row.original.id_documento} initialValue={ivaDetail?.base_imponible ?? 0} fieldName={`iva_base_${rate}`} onUpdate={onUpdate} isCurrency table={table} rowIndex={row.index} />
            },
            footer: ({ table }) => {
                const total = table.getFilteredRowModel().rows.reduce((sum, row) => {
                    const detail = row.original.iva_details.find(d => Number(d.porcentaje) === rate);
                    return sum + (Number(detail?.base_imponible) || 0);
                }, 0);
                return <div className="text-right font-bold">{total.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</div>;
            }
        },
        {
            id: `iva_${rate}`,
            header: `IVA ${rate}%`,
            cell: ({ row, table }: { row: Row<Document>, table: TanstackTable<Document> }) => {
                const ivaDetail = row.original.iva_details.find(i => Number(i.porcentaje) === rate);
                return <EditableCell docId={row.original.id_documento} initialValue={ivaDetail?.cuota ?? 0} fieldName={`iva_cuota_${rate}`} onUpdate={onUpdate} isCurrency table={table} rowIndex={row.index} />
            },
             footer: ({ table }) => {
                const total = table.getFilteredRowModel().rows.reduce((sum, row) => {
                    const detail = row.original.iva_details.find(d => Number(d.porcentaje) === rate);
                    return sum + (Number(detail?.cuota) || 0);
                }, 0);
                return <div className="text-right font-bold">{total.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</div>;
            }
        }
    ])),
     {
      accessorKey: 'retencion',
      header: 'Retención',
      cell: ({ row, table }: { row: Row<Document>, table: TanstackTable<Document> }) => {
        const ivaDetail = row.original.iva_details.find(i => i.tipo_impuesto?.toLowerCase() === 'retencion');
        return <EditableCell docId={row.original.id_documento} initialValue={ivaDetail?.cuota ?? 0} fieldName="retencion" onUpdate={onUpdate} isCurrency table={table} rowIndex={row.index}/>
      },
      footer: ({ table }) => {
          const total = table.getFilteredRowModel().rows.reduce((sum, row) => {
             const detail = row.original.iva_details.find(d => d.tipo_impuesto?.toLowerCase() === 'retencion');
             return sum + (Number(detail?.cuota) || 0);
          }, 0);
          return <div className="text-right font-bold">{total.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</div>;
      }
    },
    {
      accessorKey: 'base_imponible',
      header: 'Total Base',
      cell: ({ row, table }) => <EditableCell docId={row.original.id_documento} initialValue={row.getValue('base_imponible')} fieldName="base_imponible" onUpdate={onUpdate} isCurrency table={table} rowIndex={row.index} />,
      footer: ({ table }) => {
          const total = table.getFilteredRowModel().rows.reduce((sum, row) => sum + (Number(row.original.base_imponible) || 0), 0);
          return <div className="text-right font-bold">{total.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</div>;
      }
    },
    {
      accessorKey: 'iva',
      header: 'Total IVA',
      cell: ({ row, table }) => <EditableCell docId={row.original.id_documento} initialValue={row.getValue('iva')} fieldName="iva" onUpdate={onUpdate} isCurrency table={table} rowIndex={row.index} />,
       footer: ({ table }) => {
          const total = table.getFilteredRowModel().rows.reduce((sum, row) => sum + (Number(row.original.iva) || 0), 0);
          return <div className="text-right font-bold">{total.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</div>;
      }
    },
    {
      accessorKey: 'total',
      header: 'Total',
      cell: ({ row, table }) => <EditableCell docId={row.original.id_documento} initialValue={row.getValue('total')} fieldName="total" onUpdate={onUpdate} isCurrency table={table} rowIndex={row.index} />,
       footer: ({ table }) => {
          const total = table.getFilteredRowModel().rows.reduce((sum, row) => sum + (Number(row.original.total) || 0), 0);
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
  const [isSummarizeOpen, setIsSummarizeOpen] = useState(false);
  const [selectedDocForSummary, setSelectedDocForSummary] = useState<Document | null>(null);

  const handleUpdate = useCallback((docId: number, fieldName: string, value: any) => {
    // This function is now primarily for optimistic updates if needed,
    // but the main goal is to trigger a server-side update.
    // To avoid re-renders, we won't manage a local state copy here.
    // The EditableCell component handles the server update.
    // A full page refresh or a more sophisticated state management (like SWR or React Query)
    // would be needed to see updates without a manual refresh.
  }, []);
  
  const handleSummarize = (doc: Document) => {
    setSelectedDocForSummary(doc);
    setIsSummarizeOpen(true);
  };

  const columns = useMemo(() => getColumns(handleUpdate as any, handleSummarize), [handleUpdate]);
  

  return (
    <>
    <TooltipProvider>
      <DataTable columns={columns} data={documents} hiddenColumns={hiddenColumns} filename={filename} />
    </TooltipProvider>
    <SummarizeDialog 
        doc={selectedDocForSummary}
        isOpen={isSummarizeOpen}
        setIsOpen={setIsSummarizeOpen}
      />
    </>
  );
}

    
