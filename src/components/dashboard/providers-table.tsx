'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, Building, ChevronLeft, ChevronRight } from 'lucide-react';
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
  return new Intl.NumberFormat('es-ES', { 
      style: 'currency', 
      currency: 'EUR' 
  }).format(amount);
};

export const createColumns = (showCompanyColumn: boolean): ColumnDef<ProviderWithStats>[] => [
  {
    accessorKey: 'nombre',
    header: 'Proveedor',
    cell: ({ row }) => {
      const provider = row.original;
      return (
        <Link
          href={`/proveedores/${encodeURIComponent(provider.identificador_fiscal!)}`}
          className="font-medium text-primary hover:underline flex items-center gap-1.5 sm:gap-2"
        >
          <Building className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
          <div className="flex flex-col min-w-0">
            <span className="text-xs sm:text-sm truncate" title={provider.nombre}>
                {provider.nombre}
            </span>
            {showCompanyColumn && provider.empresaNombre && (
              <span className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 truncate" title={provider.empresaNombre}>
                {provider.empresaNombre}
              </span>
            )}
          </div>
        </Link>
      );
    },
    size: 200,
    minSize: 150,
  },
  {
    accessorKey: 'identificador_fiscal',
    header: 'CIF/NIF',
    cell: ({ row }) => {
      const value = row.getValue('identificador_fiscal') as string;
      return (
        <span className="font-mono text-xs sm:text-sm break-all" title={value}>
            {value || 'N/A'}
        </span>
      );
    },
    size: 120,
    minSize: 100,
  },
  {
    accessorKey: 'totalSpent',
    header: 'Gasto Total',
    cell: ({ row }) => (
      <div className="text-right font-mono text-xs sm:text-sm tabular-nums">
        {formatCurrency(row.getValue('totalSpent'))}
      </div>
    ),
    size: 120,
    minSize: 100,
  },
  {
    accessorKey: 'totalDocuments',
    header: 'Documentos',
    cell: ({ row }) => {
      const value = row.getValue('totalDocuments') as number;
      return (
        <div className="text-center text-xs sm:text-sm tabular-nums">
            {value || 0}
        </div>
      );
    },
    size: 100,
    minSize: 80,
  },
  {
    accessorKey: 'uniqueProducts',
    header: 'Productos Únicos',
    cell: ({ row }) => {
      const value = row.getValue('uniqueProducts') as number;
      return (
        <div className="text-center text-xs sm:text-sm tabular-nums">
            {value || 0}
        </div>
      );
    },
    size: 120,
    minSize: 100,
  },
  {
    id: 'actions',
    cell: ({ row }) => {
      const provider = row.original;
      return (
        <div className="text-center">
          <Button 
            variant="ghost" 
            size="sm" 
            asChild
            className="h-7 sm:h-8 gap-1 sm:gap-1.5 text-xs sm:text-sm"
          >
            <Link href={`/proveedores/${encodeURIComponent(provider.identificador_fiscal!)}`}>
              <span className="hidden xs:inline">Ver Detalles</span>
              <span className="xs:hidden">Ver</span>
              <ArrowRight className="h-3 w-3 sm:h-4 sm:w-4 shrink-0" />
            </Link>
          </Button>
        </div>
      );
    },
    size: 120,
    minSize: 80,
  },
];

export function ProvidersTable({ 
  providers, 
  showCompanyColumn = false 
}: { 
  providers: ProviderWithStats[];
  showCompanyColumn?: boolean;
}) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = React.useState('');

  const columns = React.useMemo(
    () => createColumns(showCompanyColumn),
    [showCompanyColumn]
  );

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
      <div className="space-y-3 sm:space-y-4">
        {/* Search */}
        <div className="flex items-center justify-between">
          <Input
            placeholder="Buscar proveedor..."
            value={globalFilter ?? ''}
            onChange={(event) => setGlobalFilter(event.target.value)}
            className="max-w-full sm:max-w-sm h-8 sm:h-9 text-xs sm:text-sm"
          />
        </div>

        {/* Table with horizontal scroll on mobile */}
        <div className="w-full overflow-x-auto rounded-md border">
          <div className="min-w-[800px]">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map(headerGroup => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map(header => (
                      <TableHead 
                        key={header.id}
                        className="text-xs sm:text-sm"
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.length ? (
                  table.getRowModel().rows.map(row => (
                    <TableRow 
                      key={row.id} 
                      data-state={row.getIsSelected() && 'selected'}
                      className="text-xs sm:text-sm"
                    >
                      {row.getVisibleCells().map(cell => (
                        <TableCell key={cell.id}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell 
                      colSpan={columns.length} 
                      className="h-20 sm:h-24 text-center text-xs sm:text-sm text-muted-foreground"
                    >
                      No hay resultados.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Scroll indicator for mobile */}
        <div className="sm:hidden bg-muted/30 px-3 py-2 text-center border-t rounded-b-md">
          <p className="text-[10px] text-muted-foreground">
            ← Desliza para ver más columnas →
          </p>
        </div>

        {/* Pagination */}
        <div className="flex flex-col xs:flex-row items-center justify-between gap-2 py-2 sm:py-4">
          <div className="text-xs sm:text-sm text-muted-foreground order-2 xs:order-1">
            Página {table.getState().pagination.pageIndex + 1} de{' '}
            {table.getPageCount()}
          </div>
          <div className="flex items-center gap-2 order-1 xs:order-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="h-7 sm:h-8 gap-1 text-xs sm:text-sm"
            >
              <ChevronLeft className="h-3 w-3 sm:h-4 sm:w-4 shrink-0" />
              <span className="hidden xs:inline">Anterior</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="h-7 sm:h-8 gap-1 text-xs sm:text-sm"
            >
              <span className="hidden xs:inline">Siguiente</span>
              <ChevronRight className="h-3 w-3 sm:h-4 sm:w-4 shrink-0" />
            </Button>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}