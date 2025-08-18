
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
import { useState, useEffect } from 'react';
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
const createIvaColumns = (ivaTypes: number[], onUpdate: (id: number, field: string, value: any) => void): ColumnDef<Document>[] => {
    return ivaTypes.flatMap(type => [
        {
            id: `base_${type}`,
            accessorFn: (row) => row.iva_details.find(i => i.porcentaje === type)?.base_imponible,
            header: `Base ${type}%`,
            cell: ({ row }) => <div className="text-right">{formatCurrency(row.original.iva_details.find(i => i.porcentaje === type)?.base_imponible)}</div>,
            enableColumnFilter: false,
        },
        {
            id: `cuota_${type}`,
            accessorFn: (row) => row.iva_details.find(i => i.porcentaje === type)?.cuota,
            header: `IVA ${type}%`,
            cell: ({ row }) => <div className="text-right">{formatCurrency(row.original.iva_details.find(i => i.porcentaje === type)?.cuota)}</div>,
            enableColumnFilter: false,
        }
    ]);
};

export function DocumentsTable({ documents, hiddenColumns }: { documents: Document[], hiddenColumns?: string[] }) {
  const [tableData, setTableData] = useState(documents);
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [isSummarizeOpen, setIsSummarizeOpen] = useState(false);
  
  useEffect(() => {
    setTableData(documents);
  }, [documents]);

  const pathname = usePathname();
  const isIncidentsPage = pathname === '/incidents';

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

  const ivaColumns = createIvaColumns([21, 10, 4, 0], handleUpdate);

  const columns: ColumnDef<Document>[] = [
    {
        accessorKey: 'numero_factura',
        header: 'Nº Factura',
        cell: ({ row }) => (
            <EditableCell
                initialValue={row.getValue('numero_factura')}
                docId={row.original.id_documento}
                fieldName="numero_documento"
                onUpdate={handleUpdate}
            />
        )
    },
    {
        accessorKey: 'tipo_documento',
        header: 'Tipo',
        cell: ({ row }) => <Badge variant="outline">{row.getValue('tipo_documento')}</Badge>
    },
    {
        accessorKey: 'fecha_emision',
        header: 'Fecha Emisión',
        cell: ({ row }) => (
             <EditableCell
                initialValue={row.getValue('fecha_emision')}
                docId={row.original.id_documento}
                fieldName="fecha_emision"
                onUpdate={handleUpdate}
                inputType="date"
            />
        )
    },
     {
        accessorKey: 'fecha_vencimiento',
        header: 'Fecha Vencimiento',
        cell: ({ row }) => (
             <EditableCell
                initialValue={row.getValue('fecha_vencimiento')}
                docId={row.original.id_documento}
                fieldName="fecha_vencimiento"
                onUpdate={handleUpdate}
                inputType="date"
            />
        )
    },
    {
        accessorKey: 'proveedor',
        header: 'Proveedor',
        cell: ({ row }) => {
            const doc = row.original;
            return (
                <Tooltip>
                    <TooltipTrigger asChild>
                    <span className="truncate max-w-[200px] block">{doc.proveedor}</span>
                    </TooltipTrigger>
                    <TooltipContent>
                    <p>{doc.proveedor}</p>
                    <p className="text-muted-foreground">{doc.cif}</p>
                    <p className="text-xs mt-2 italic">Editar en la página de detalle.</p>
                    </TooltipContent>
                </Tooltip>
            )
        }
    },
    {
        accessorKey: 'cif',
        header: 'CIF',
    },
    ...(isIncidentsPage ? [{
        accessorKey: 'incidencia_razon',
        header: 'Razón Incidencia',
        cell: ({ row }: { row: any }) => {
             const reason = row.getValue('incidencia_razon') as string;
             return (
                 <Tooltip>
                    <TooltipTrigger asChild>
                    <span className="truncate max-w-[250px] block text-destructive/80">{reason || 'N/A'}</span>
                    </TooltipTrigger>
                    <TooltipContent>
                    <p className="max-w-xs">{reason}</p>
                    <p className="text-xs mt-2 italic">Validar en la página de detalle.</p>
                    </TooltipContent>
                </Tooltip>
             )
        }
    }] as ColumnDef<Document>[] : []),
    ...ivaColumns,
    {
        accessorKey: 'base_imponible',
        header: () => <div className='text-right'>Total Base</div>,
        cell: ({ row }) => (
            <div className="text-right">
                <EditableCell
                    initialValue={row.getValue('base_imponible')}
                    docId={row.original.id_documento}
                    fieldName="importe_sin_impuestos"
                    onUpdate={handleUpdate}
                    inputType="number"
                    isCurrency
                />
            </div>
        )
    },
    {
        accessorKey: 'iva',
        header: () => <div className='text-right'>Total IVA</div>,
        cell: ({ row }) => <div className="text-right">{formatCurrency(row.getValue('iva'))}</div>,
        enableColumnFilter: false,
    },
    {
        accessorKey: 'total',
        header: () => <div className='text-right font-bold'>Total</div>,
        cell: ({ row }) => (
            <div className="text-right font-bold">
                 <EditableCell
                    initialValue={row.getValue('total')}
                    docId={row.original.id_documento}
                    fieldName="importe_total"
                    onUpdate={handleUpdate}
                    inputType="number"
                    isCurrency
                />
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
                onUpdate={handleUpdate}
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
    {
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
    }
  ];

  return (
    <TooltipProvider delayDuration={200}>
        <DataTable columns={columns} data={tableData} hiddenColumns={hiddenColumns} />
        <SummarizeDialog doc={selectedDoc} isOpen={isSummarizeOpen} setIsOpen={setIsSummarizeOpen} />
    </TooltipProvider>
  );
}
