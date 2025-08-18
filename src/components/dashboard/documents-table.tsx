
'use client';

import Link from 'next/link';
import {
  MoreHorizontal, 
  CheckCircle2, 
  AlertCircle
} from 'lucide-react';
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
import { IvaBadge } from './iva-badge';
import { DataTable } from '@/components/ui/data-table';
import { useState } from 'react';
import { usePathname } from 'next/navigation';


const formatCurrency = (amount: number | null) => {
    if (amount === null || amount === undefined) return 'N/A';
  return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR',
  }).format(amount);
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
  
  const columns: ColumnDef<Document>[] = [
    {
        accessorKey: 'numero_factura',
        header: 'Nº Factura',
        cell: ({ row }) => <div className="font-medium">{row.getValue('numero_factura')}</div>,
        enableHiding: false,
    },
    {
        accessorKey: 'tipo_documento',
        header: 'Tipo',
        cell: ({ row }) => <Badge variant="outline">{row.getValue('tipo_documento')}</Badge>
    },
    {
        accessorKey: 'fecha_emision',
        header: 'Fecha',
        cell: ({ row }) => new Date(row.getValue('fecha_emision')).toLocaleDateString('es-ES', { timeZone: 'UTC' })
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
    {
        accessorKey: 'base_imponible',
        header: () => <div className='text-right'>Base</div>,
        cell: ({ row }) => <div className="text-right">{formatCurrency(row.getValue('base_imponible'))}</div>
    },
    {
        accessorKey: 'iva_details',
        header: () => <div className='text-right'>Impuestos</div>,
        cell: ({ row }) => {
            const ivaDetails = row.getValue('iva_details') as any[];
            return (
                 <div className="flex items-center justify-end gap-1">
                    {ivaDetails.map((iva, index) => (
                        <IvaBadge key={index} iva={iva} />
                    ))}
                </div>
            )
        },
        enableSorting: false,
        enableColumnFilter: false,
    },
    {
        accessorKey: 'total',
        header: () => <div className='text-right'>Total</div>,
        cell: ({ row }) => <div className="text-right font-bold">{formatCurrency(row.getValue('total'))}</div>
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
    }
  ];
  
  // Filter out the incidents column if not on the incidents page
  const visibleColumns = isIncidentsPage ? columns : columns.filter(c => c.accessorKey !== 'incidencia_razon');


  return (
    <TooltipProvider delayDuration={200}>
        <DataTable columns={visibleColumns} data={documents} />
        <SummarizeDialog doc={selectedDoc} isOpen={isSummarizeOpen} setIsOpen={setIsSummarizeOpen} />
    </TooltipProvider>
  );
}
