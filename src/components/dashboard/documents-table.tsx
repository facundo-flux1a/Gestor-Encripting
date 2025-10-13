'use client';

import Link from 'next/link';
import { MoreHorizontal, Trash2 } from 'lucide-react';
import type { ColumnDef, Row, Table as TanstackTable } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { type Document } from '@/lib/types';
import { SummarizeDialog } from './summarize-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { TooltipProvider } from '@/components/ui/tooltip';
import { DataTable } from '@/components/ui/data-table';
import { useState, useMemo, useCallback } from 'react';
import { Checkbox } from '../ui/checkbox';
import { EditableCell } from './editable-cell';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const getColumns = (
    onUpdate: (docId: number, field: string, value: any, table: TanstackTable<Document>, rowIndex: number) => void,
    onSummarize: (doc: Document) => void
): ColumnDef<Document>[] => {
  const columns: ColumnDef<Document>[] = [
    {
      id: 'actions',
      header: 'Acciones',
      cell: ({ row }) => {
        const doc = row.original;
        const actionsContent = (
          <>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/documento/${doc.id_documento}`}>Ver</Link>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 p-0">
                  <span className="sr-only">Ver más</span>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onSummarize(doc)}>
                  Resumir con IA
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        );
        return <div className="flex items-center gap-2">{actionsContent}</div>;
      },
      footer: () => null,
      enableHiding: false,
    },
    {
      id: 'select',
      header: ({ table }) => {
        const checkboxContent = (
          <>
            <Checkbox
              checked={table.getIsAllPageRowsSelected()}
              onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
              aria-label="Select all"
            />
            <span>ID</span>
          </>
        );
        return <div className="flex items-center gap-2">{checkboxContent}</div>;
      },
      cell: ({ row }) => {
        const cellContent = (
          <>
            <Checkbox
              checked={row.getIsSelected()}
              onCheckedChange={(value) => row.toggleSelected(!!value)}
              aria-label="Select row"
              onClick={(e) => e.stopPropagation()}
            />
            <span>{row.original.id_documento}</span>
          </>
        );
        return <div className="flex items-center gap-2">{cellContent}</div>;
      },
      enableHiding: false,
      footer: () => 'Totales',
    },
    {
      accessorKey: 'empresa_nombre',
      header: 'Empresa',
      cell: ({ row }) => {
        const nombre = row.getValue('empresa_nombre') || 'Sin empresa';
        return <div className="font-medium text-sm">{nombre}</div>;
      },
      footer: () => null,
    },
    {
      accessorKey: 'numero_documento',
      header: 'Nº Factura',
      cell: ({ row, table }) => {
        return <EditableCell docId={row.original.id_documento} initialValue={row.getValue('numero_documento')} fieldName="numero_documento" onUpdate={onUpdate} table={table} rowIndex={row.index} />;
      }
    },
    {
      accessorKey: 'fecha_emision',
      header: 'Fecha Contable',
      cell: ({ row, table }) => {
        return <EditableCell docId={row.original.id_documento} initialValue={row.getValue('fecha_emision')} fieldName="fecha_emision" onUpdate={onUpdate} table={table} rowIndex={row.index} inputType='date' />;
      }
    },
    {
      accessorKey: 'fecha_creacion',
      header: 'Fecha de Carga',
      cell: ({ row }) => {
        const fecha = row.getValue('fecha_creacion');
        if (!fecha) {
          return <span>-</span>;
        }
        
        const date = new Date(fecha as string);
        const fechaStr = date.toLocaleDateString('es-ES', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        });
        const horaStr = date.toLocaleTimeString('es-ES', {
          hour: '2-digit',
          minute: '2-digit'
        });
        
        return (
          <div className="text-sm whitespace-nowrap">
            <div>{fechaStr}</div>
            <div className="text-xs text-muted-foreground">{horaStr}</div>
          </div>
        );
      },
      footer: () => null,
    },
    // Columna fecha_vencimiento oculta (se mantiene el código por si se necesita en el futuro)
    // {
    //   accessorKey: 'fecha_vencimiento',
    //   header: 'Fecha Documento',
    //   cell: ({ row, table }) => {
    //     return <EditableCell docId={row.original.id_documento} initialValue={row.getValue('fecha_vencimiento')} fieldName="fecha_vencimiento" onUpdate={onUpdate} table={table} rowIndex={row.index} inputType='date' />;
    //   }
    // },
    {
      accessorKey: 'proveedor',
      header: 'Proveedor',
      cell: ({ row, table }) => {
        return <EditableCell docId={row.original.id_documento} initialValue={row.getValue('proveedor')} fieldName="proveedor_nombre" onUpdate={onUpdate} table={table} rowIndex={row.index} />;
      }
    },
    {
      accessorKey: 'cif',
      header: 'CIF',
      cell: ({ row, table }) => {
        return <EditableCell docId={row.original.id_documento} initialValue={row.getValue('cif')} fieldName="proveedor_cif" onUpdate={onUpdate} table={table} rowIndex={row.index} />;
      }
    },
    {
      accessorKey: 'observaciones',
      header: 'Concepto',
      cell: ({ row, table }) => {
        return <EditableCell docId={row.original.id_documento} initialValue={row.getValue('observaciones')} fieldName="observaciones" onUpdate={onUpdate} table={table} rowIndex={row.index} />;
      }
    },
    {
      accessorKey: 'tipo_documento',
      header: 'Tipo Documento',
      cell: ({ row, table }) => {
        return <EditableCell docId={row.original.id_documento} initialValue={row.getValue('tipo_documento')} fieldName="tipo_documento" onUpdate={onUpdate} table={table} rowIndex={row.index} />;
      }
    },
    ...[21, 10, 4, 0].flatMap(rate => ([
      {
        id: `base_${rate}`,
        header: `Base ${rate}%`,
        cell: ({ row }: { row: Row<Document> }) => {
          const ivaDetail = row.original.iva_details.find(i => Number(i.porcentaje) === rate);
          const value = ivaDetail?.base_imponible ?? 0;
          const formatted = Number(value).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
          return <div className="text-right">{formatted}</div>;
        },
        footer: ({ table }) => {
          const total = table.getFilteredRowModel().rows.reduce((sum, row) => {
            const detail = row.original.iva_details.find(d => Number(d.porcentaje) === rate);
            return sum + (Number(detail?.base_imponible) || 0);
          }, 0);
          const formatted = total.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
          return <div className="text-right font-bold">{formatted}</div>;
        }
      },
      {
        id: `iva_${rate}`,
        header: `IVA ${rate}%`,
        cell: ({ row }: { row: Row<Document> }) => {
          const ivaDetail = row.original.iva_details.find(i => Number(i.porcentaje) === rate);
          const value = ivaDetail?.cuota ?? 0;
          const formatted = Number(value).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
          return <div className="text-right">{formatted}</div>;
        },
        footer: ({ table }) => {
          const total = table.getFilteredRowModel().rows.reduce((sum, row) => {
            const detail = row.original.iva_details.find(d => Number(d.porcentaje) === rate);
            return sum + (Number(detail?.cuota) || 0);
          }, 0);
          const formatted = total.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
          return <div className="text-right font-bold">{formatted}</div>;
        }
      }
    ])),
    {
      accessorKey: 'retencion',
      header: 'Retención',
      cell: ({ row }: { row: Row<Document> }) => {
        const ivaDetail = row.original.iva_details.find(i => i.tipo_impuesto?.toLowerCase() === 'retencion');
        const value = ivaDetail?.cuota ?? 0;
        const formatted = Number(value).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
        return <div className="text-right">{formatted}</div>;
      },
      footer: ({ table }) => {
        const total = table.getFilteredRowModel().rows.reduce((sum, row) => {
          const detail = row.original.iva_details.find(d => d.tipo_impuesto?.toLowerCase() === 'retencion');
          return sum + (Number(detail?.cuota) || 0);
        }, 0);
        const formatted = total.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
        return <div className="text-right font-bold">{formatted}</div>;
      }
    },
    {
      accessorKey: 'base_imponible',
      header: 'Total Base',
      cell: ({ row }) => {
        const value = row.getValue('base_imponible');
        const formatted = Number(value).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
        return <div className="text-right">{formatted}</div>;
      },
      footer: ({ table }) => {
        const total = table.getFilteredRowModel().rows.reduce((sum, row) => sum + (Number(row.original.base_imponible) || 0), 0);
        const formatted = total.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
        return <div className="text-right font-bold">{formatted}</div>;
      }
    },
    {
      accessorKey: 'iva',
      header: 'Total IVA',
      cell: ({ row }) => {
        const value = row.getValue('iva');
        const formatted = Number(value).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
        return <div className="text-right">{formatted}</div>;
      },
      footer: ({ table }) => {
        const total = table.getFilteredRowModel().rows.reduce((sum, row) => sum + (Number(row.original.iva) || 0), 0);
        const formatted = total.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
        return <div className="text-right font-bold">{formatted}</div>;
      }
    },
    {
      accessorKey: 'total',
      header: 'Total',
      cell: ({ row }) => {
        const value = row.getValue('total');
        const formatted = Number(value).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
        return <div className="text-right">{formatted}</div>;
      },
      footer: ({ table }) => {
        const total = table.getFilteredRowModel().rows.reduce((sum, row) => sum + (Number(row.original.total) || 0), 0);
        const formatted = total.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
        return <div className="text-right font-bold">{formatted}</div>;
      }
    },
  ];

  return columns;
}

export function DocumentsTable({ documents, hiddenColumns = [], isIncidentsPage = false, filename = 'documentos' }: { documents: Document[], hiddenColumns?: string[], isIncidentsPage?: boolean, filename?: string }) {
  const [isSummarizeOpen, setIsSummarizeOpen] = useState(false);
  const [selectedDocForSummary, setSelectedDocForSummary] = useState<Document | null>(null);

  const handleUpdate = useCallback((docId: number, fieldName: string, value: any) => {
    // This function is now primarily for optimistic updates if needed
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