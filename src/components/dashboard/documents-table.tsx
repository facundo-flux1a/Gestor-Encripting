
'use client';

import Link from 'next/link';
import { MoreHorizontal, CheckCircle2, AlertCircle } from 'lucide-react';
import { type ColumnDef } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { type Document, type IvaDetail } from '@/lib/types';
import { SummarizeDialog } from './summarize-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { IvaBadge } from './iva-badge';
import { DataTable } from '@/components/ui/data-table';
import { useState } from 'react';
import { usePathname } from 'next/navigation';

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
const createIvaColumns = (ivaTypes: number[]): ColumnDef<Document>[] => {
    const columns: ColumnDef<Document>[] = [];
    ivaTypes.forEach(type => {
        // Base Imponible column
        columns.push({
            accessorKey: `base_${type}`,
            header: `Base ${type}%`,
            cell: ({ row }) => {
                const ivaDetail = row.original.iva_details.find(i => i.porcentaje === type);
                return <div className="text-right">{formatCurrency(ivaDetail?.base_imponible)}</div>
            }
        });
        // Cuota column
        columns.push({
            accessorKey: `cuota_${type}`,
            header: `Cuota ${type}%`,
            cell: ({ row }) => {
                const ivaDetail = row.original.iva_details.find(i => i.porcentaje === type);
                return <div className="text-right">{formatCurrency(ivaDetail?.cuota)}</div>
            }
        });
    });
    return columns;
};

export function DocumentsTable({ documents }: { documents: Document[] }) {
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [isSummarizeOpen, setIsSummarizeOpen] = useState(false);
  
  const pathname = usePathname();
  const isIncidentsPage = pathname === '/incidents';

  const handleSummarizeClick = (doc: Document) => {
    setSelectedDoc(doc);
    setIsSummarizeOpen(true);
  };
  
  const ivaColumns = createIvaColumns([21, 10, 4]);

  const columns: ColumnDef<Document>[] = [
    {
        accessorKey: 'numero_factura',
        header: 'Nº Factura',
        cell: ({ row }) => <div className="font-medium">{row.getValue('numero_factura')}</div>,
    },
    {
        accessorKey: 'tipo_documento',
        header: 'Tipo',
        cell: ({ row }) => <Badge variant="outline">{row.getValue('tipo_documento')}</Badge>
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
                    </TooltipContent>
                </Tooltip>
             )
        }
    }] as ColumnDef<Document>[] : []),
    ...ivaColumns,
    {
        accessorKey: 'base_imponible',
        header: () => <div className='text-right'>Total Base</div>,
        cell: ({ row }) => <div className="text-right">{formatCurrency(row.getValue('base_imponible'))}</div>
    },
    {
        accessorKey: 'iva',
        header: () => <div className='text-right'>Total IVA</div>,
        cell: ({ row }) => <div className="text-right">{formatCurrency(row.getValue('iva'))}</div>
    },
    {
        accessorKey: 'total',
        header: () => <div className='text-right font-bold'>Total</div>,
        cell: ({ row }) => <div className="text-right font-bold">{formatCurrency(row.getValue('total'))}</div>
    },
     {
        accessorKey: 'observaciones',
        header: 'Observaciones',
        cell: ({ row }) => {
            const obs = row.getValue('observaciones') as string;
            return (
                <Tooltip>
                    <TooltipTrigger asChild>
                        <span className="truncate max-w-[150px] block">{obs || ''}</span>
                    </TooltipTrigger>
                    {obs && <TooltipContent><p className="max-w-xs">{obs}</p></TooltipContent>}
                </Tooltip>
            )
        }
    },
    {
        accessorKey: 'verificado',
        header: () => <div className='text-center'>Estado</div>,
        cell: ({ row }) => {
            const isVerified = row.getValue('verificado');
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
            const isVerified = row.getValue(id);
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
        <DataTable columns={columns} data={documents} />
        <SummarizeDialog doc={selectedDoc} isOpen={isSummarizeOpen} setIsOpen={setIsSummarizeOpen} />
    </TooltipProvider>
  );
}
