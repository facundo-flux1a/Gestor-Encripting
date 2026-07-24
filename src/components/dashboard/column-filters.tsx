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

export interface FilterOption {
  value: string; // CIF hash o CIF raw — usado internamente como clave del filtro
  label: string; // Nombre canónico a mostrar en el dropdown
}

interface DataTableFacetedFilterProps<TData, TValue> {
  column?: Column<TData, TValue>;
  title?: string;
  options: FilterOption[];
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
                  const isSelected = selectedValues.has(option.value);
                  return (
                    <CommandItem
                      key={option.value}
                      value={option.label} // para la búsqueda del CommandInput
                      onSelect={() => {
                        if (isSelected) {
                          selectedValues.delete(option.value);
                        } else {
                          selectedValues.add(option.value);
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
                      <span className="truncate">{option.label}</span>
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

// ✅ Filtro de Cliente: agrupa por identificador_fiscal_hash — evita duplicados por variación de nombre
export function ClienteFilter<TData, TValue>({
  column,
  table,
}: {
  column?: Column<TData, TValue>;
  table?: Table<TData>;
}) {
  const rowCount = table?.getPreFilteredRowModel().rows.length ?? 0;
  const companyKey = useCompanyContext().selectedCompanyIds.join(',');

  // hash/cif → nombre canónico (el primero encontrado para ese hash)
  const clientes = useMemo((): FilterOption[] => {
    if (!table) return [];
    const hashToName = new Map<string, string>();
    table.getPreFilteredRowModel().rows.forEach((row: any) => {
      const cliente = row.original.entidades?.find(
        (e: any) => e.rol === 'cliente' || e.rol === 'receptor'
      );
      if (!cliente?.nombre || cliente.nombre === 'Sin cliente') return;
      const key: string = cliente.identificador_fiscal_hash
        || cliente.identificador_fiscal
        || cliente.nombre;
      if (key && !hashToName.has(key)) {
        hashToName.set(key, cliente.nombre);
      }
    });
    return Array.from(hashToName.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
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

// ✅ Filtro de Proveedor: agrupa por identificador_fiscal_hash — evita duplicados por variación de nombre
export function ProveedorFilter<TData, TValue>({
  column,
  table,
}: {
  column?: Column<TData, TValue>;
  table?: Table<TData>;
}) {
  const rowCount = table?.getPreFilteredRowModel().rows.length ?? 0;
  const companyKey = useCompanyContext().selectedCompanyIds.join(',');

  // hash/cif → nombre canónico (el primero encontrado para ese hash)
  const proveedores = useMemo((): FilterOption[] => {
    if (!table) return [];
    const hashToName = new Map<string, string>();
    table.getPreFilteredRowModel().rows.forEach((row: any) => {
      const nombre: string = row.original.proveedor;
      if (!nombre || nombre === 'N/A' || nombre === 'Sin proveedor') return;
      const emisor = row.original.entidades?.find(
        (e: any) => e.rol === 'proveedor' || e.rol === 'emisor'
      );
      const key: string = emisor?.identificador_fiscal_hash
        || emisor?.identificador_fiscal
        || nombre;
      if (key && !hashToName.has(key)) {
        hashToName.set(key, nombre);
      }
    });
    return Array.from(hashToName.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
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