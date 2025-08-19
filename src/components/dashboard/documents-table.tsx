

'use client';

import Link from 'next/link';
import { MoreHorizontal, CheckCircle2, AlertCircle } from 'lucide-react';
import type { ColumnDef, Row } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { type Document, type IvaDetail } from '@/lib/types';
import { SummarizeDialog } from './summarize-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DataTable } from '@/components/ui/data-table';
import { useState, useMemo, useCallback, useEffect } from 'react';
import { updateDocumentField } from '@/services/document-service';
import { useToast } from '@/hooks/use-toast';
import { Checkbox } from '../ui/checkbox';
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
        const utcDate = new Date(d.valueOf() + d.getTimezoneOffset() * 60 * 1000);
        return new Intl.DateTimeFormat('es-ES', {
            year: 'numeric', month: '2-digit', day: '2-digit'
        }).format(utcDate);
    } catch {
        return 'Fecha inválida';
    }
}

const getColumns = (
    onUpdate: (docId: number, field: string, value: any) => void
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
      cell: ({ row }) => <EditableCell docId={row.original.id_documento} initialValue={row.getValue('id_documento')} fieldName="id_documento" onUpdate={onUpdate} inputType='number' />
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
    ...[21, 10, 4].map(rate => ({
        id: `base_${rate}`,
        header: `Base ${rate}%`,
        cell: ({ row }: { row: Row<Document> }) => {
            const ivaDetail = row.original.iva_details.find(i => i.porcentaje === rate);
            return <EditableCell docId={row.original.id_documento} initialValue={ivaDetail?.base_imponible ?? 0} fieldName={`iva_base_${rate}`} onUpdate={onUpdate} isCurrency />
        }
    })),
    ...[21, 10, 4].map(rate => ({
        id: `iva_${rate}`,
        header: `IVA ${rate}%`,
        cell: ({ row }: { row: Row<Document> }) => {
            const ivaDetail = row.original.iva_details.find(i => i.porcentaje === rate);
            return <EditableCell docId={row.original.id_documento} initialValue={ivaDetail?.cuota ?? 0} fieldName={`iva_cuota_${rate}`} onUpdate={onUpdate} isCurrency />
        }
    })),
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
  ];

  return columns;
}

export function DocumentsTable({ documents, hiddenColumns = [], isIncidentsPage = false }: { documents: Document[], hiddenColumns?: string[], isIncidentsPage?: boolean }) {
  const [tableData, setTableData] = useState(documents);
  const { toast } = useToast();

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

  const columns = useMemo(() => getColumns(handleUpdate), [handleUpdate]);

  return (
    <TooltipProvider>
      <DataTable columns={columns} data={tableData} hiddenColumns={hiddenColumns} />
    </TooltipProvider>
  );
}



