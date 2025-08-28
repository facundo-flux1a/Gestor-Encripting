'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, Building } from 'lucide-react';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';

import { Button } from '@/components/ui/button';
import { type ProviderWithStats } from '@/lib/types';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { TooltipProvider } from '@/components/ui/tooltip';

const formatCurrency = (amount: number) => {
    if (isNaN(amount)) return 'N/A';
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount);
};

export const columns: ColumnDef<ProviderWithStats>[] = [
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

export function ProvidersTable({ providers }: { providers: ProviderWithStats[] }) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = React.useState('');

  const table = useReactTable({
    data: providers,
    columns,
    state: {
      sorting,
      globalFilter,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  return (
    <TooltipProvider>
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <Input
                placeholder="Buscar proveedor..."
                value={globalFilter ?? ''}
                onChange={(event) => setGlobalFilter(event.target.value)}
                className="max-w-sm"
                />
            </div>
            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        {table.getHeaderGroups().map((headerGroup) => (
                            <TableRow key={headerGroup.id}>
                                {headerGroup.headers.map((header) => {
                                    return (
                                        <TableHead key={header.id}>
                                            {header.isPlaceholder
                                                ? null
                                                : flexRender(
                                                    header.column.columnDef.header,
                                                    header.getContext()
                                                )}
                                        </TableHead>
                                    );
                                })}
                            </TableRow>
                        ))}
                    </TableHeader>
                    <TableBody>
                        {table.getRowModel().rows?.length ? (
                            table.getRowModel().rows.map((row) => (
                                <TableRow
                                    key={row.id}
                                    data-state={row.getIsSelected() && 'selected'}
                                >
                                    {row.getVisibleCells().map((cell) => (
                                        <TableCell key={cell.id}>
                                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={columns.length} className="h-24 text-center">
                                    No hay resultados.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
            <div className="flex items-center justify-end space-x-2 py-4">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => table.previousPage()}
                    disabled={!table.getCanPreviousPage()}
                >
                    Anterior
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => table.nextPage()}
                    disabled={!table.getCanNextPage()}
                >
                    Siguiente
                </Button>
            </div>
        </div>
    </TooltipProvider>
  );
}