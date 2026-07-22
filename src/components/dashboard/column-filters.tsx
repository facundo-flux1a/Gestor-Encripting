'use client';

import { Column, Table } from '@tanstack/react-table';
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useState, useMemo } from 'react';
import { useCompanyContext } from '@/context/CompanyProvider';

interface DataTableFacetedFilterProps<TData, TValue> {
  column?: Column<TData, TValue>;
  title?: string;
  options: string[];
  isLoading?: boolean;
}

export function DataTableFacetedFilter<TData, TValue>({
  column,
  title,
  options,
  isLoading = false,
}: DataTableFacetedFilterProps<TData, TValue>) {
  const [open, setOpen] = useState(false);
  const selectedValues = new Set(column?.getFilterValue() as string[]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 border-dashed"
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <ChevronsUpDown className="mr-2 h-4 w-4" />
          )}
          {title}
          {selectedValues?.size > 0 && (
            <>
              <span className="mx-2 h-4 w-[1px] bg-border" />
              <span className="rounded-sm bg-primary/10 px-1 font-mono text-xs">
                {selectedValues.size}
              </span>
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0" align="start">
        <Command>
          <CommandInput placeholder={`Buscar ${title?.toLowerCase()}...`} />
          {isLoading ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              <div className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Cargando...</span>
              </div>
            </div>
          ) : (
            <>
              <CommandEmpty>No se encontraron resultados</CommandEmpty>
              <CommandGroup className="max-h-64 overflow-auto">
                {options.map((option) => {
                  const isSelected = selectedValues.has(option);
                  return (
                    <CommandItem
                      key={option}
                      onSelect={() => {
                        if (isSelected) {
                          selectedValues.delete(option);
                        } else {
                          selectedValues.add(option);
                        }
                        const filterValues = Array.from(selectedValues);
                        column?.setFilterValue(
                          filterValues.length ? filterValues : undefined
                        );
                      }}
                    >
                      <div
                        className={cn(
                          'mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary',
                          isSelected
                            ? 'bg-primary text-primary-foreground'
                            : 'opacity-50 [&_svg]:invisible'
                        )}
                      >
                        <Check className={cn('h-4 w-4')} />
                      </div>
                      <span className="truncate">{option}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ✅ Filtro de Cliente: Trae todos desde API y filtra por los que están en la tabla
export function ClienteFilter<TData, TValue>({
  column,
  table,
}: {
  column?: Column<TData, TValue>;
  table?: Table<TData>;
}) {
  // Opciones desde la tabla ya cargada — sin /api/filters (antes: ~2.6s × N remounts)
  const rowCount = table?.getPreFilteredRowModel().rows.length ?? 0;
  const companyKey = useCompanyContext().selectedCompanyIds.join(',');

  const clientes = useMemo(() => {
    if (!table) return [];
    const names = new Set<string>();
    table.getPreFilteredRowModel().rows.forEach((row: any) => {
      const cliente = row.original.entidades?.find(
        (e: any) => e.rol === 'cliente' || e.rol === 'receptor'
      );
      if (cliente?.nombre && cliente.nombre !== 'Sin cliente') {
        names.add(cliente.nombre);
      }
    });
    return Array.from(names).sort();
  }, [table, rowCount, companyKey]);

  return (
    <DataTableFacetedFilter
      column={column}
      title="Cliente"
      options={clientes}
      isLoading={false}
    />
  );
}

// ✅ Filtro de Proveedor: Trae todos desde API y filtra por los que están en la tabla
export function ProveedorFilter<TData, TValue>({
  column,
  table,
}: {
  column?: Column<TData, TValue>;
  table?: Table<TData>;
}) {
  // Opciones desde la tabla ya cargada — sin /api/filters (antes: ~2.6s × N remounts)
  const rowCount = table?.getPreFilteredRowModel().rows.length ?? 0;
  const companyKey = useCompanyContext().selectedCompanyIds.join(',');

  const proveedores = useMemo(() => {
    if (!table) return [];
    const names = new Set<string>();
    table.getPreFilteredRowModel().rows.forEach((row: any) => {
      const proveedor = row.original.proveedor;
      if (proveedor && proveedor !== 'N/A' && proveedor !== 'Sin proveedor') {
        names.add(proveedor);
      }
    });
    return Array.from(names).sort();
  }, [table, rowCount, companyKey]);

  return (
    <DataTableFacetedFilter
      column={column}
      title="Proveedor"
      options={proveedores}
      isLoading={false}
    />
  );
}