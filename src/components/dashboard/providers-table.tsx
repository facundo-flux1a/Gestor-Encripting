'use client';

import Link from 'next/link';
import { MoreHorizontal, FileText, Building, ArrowRight } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { type ProviderWithStats } from '@/lib/types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DataTable } from '@/components/ui/data-table';
import { useState, useMemo, useEffect } from 'react';
import { Badge } from '../ui/badge';
import { TooltipProvider } from '../ui/tooltip';

const formatCurrency = (amount: number) => {
    if (isNaN(amount)) return 'N/A';
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount);
};

const getColumns = (): ColumnDef<ProviderWithStats>[] => {
  const columns: ColumnDef<ProviderWithStats>[] = [
    {
      accessorKey: 'nombre',
      header: 'Proveedor',
      cell: ({ row }) => {
        const provider = row.original;
        return (
            <Link 
                href={`/proveedores/${encodeURIComponent(provider.identificador_fiscal!)}`} 
                className="font-medium text-primary hover:underline flex items-center gap-2"
            >
                <Building className="h-4 w-4" />
                {provider.nombre}
            </Link>
        )
      }
    },
    {
      accessorKey: 'identificador_fiscal',
      header: 'CIF/NIF',
    },
    {
      accessorKey: 'totalSpent',
      header: 'Gasto Total',
      cell: ({ row }) => <div className="text-right font-mono">{formatCurrency(row.getValue('totalSpent'))}</div>
    },
    {
      accessorKey: 'totalDocuments',
      header: 'Documentos',
      cell: ({ row }) => <div className="text-center">{row.getValue('totalDocuments')}</div>
    },
    {
      accessorKey: 'uniqueProducts',
      header: 'Productos Únicos',
      cell: ({ row }) => <div className="text-center">{row.getValue('uniqueProducts')}</div>
    },
    {
      id: 'actions',
      cell: ({ row }) => {
        const provider = row.original;
        return (
            <div className="text-center">
                <Button variant="ghost" size="sm" asChild>
                    <Link href={`/proveedores/${encodeURIComponent(provider.identificador_fiscal!)}`}>
                        Ver Detalles <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                </Button>
            </div>
        );
      },
    },
  ];

  return columns;
}

export function ProvidersTable({ providers }: { providers: ProviderWithStats[] }) {
  const [tableData, setTableData] = useState(providers);

   useEffect(() => {
    setTableData(providers);
  }, [providers]);

  const columns = useMemo(() => getColumns(), []);

  return (
    <TooltipProvider>
      <DataTable 
        columns={columns} 
        data={tableData} 
        filename="proveedores" 
      />
    </TooltipProvider>
  );
}
