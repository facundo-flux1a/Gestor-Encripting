'use client';

import { Column } from '@tanstack/react-table';
import { Check, ChevronsUpDown } from 'lucide-react';
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
import { useState, useEffect } from 'react';
import { useCompanyContext } from '@/context/CompanyProvider';

interface DataTableFacetedFilterProps<TData, TValue> {
  column?: Column<TData, TValue>;
  title?: string;
  options: string[];
}

export function DataTableFacetedFilter<TData, TValue>({
  column,
  title,
  options,
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
        >
          <ChevronsUpDown className="mr-2 h-4 w-4" />
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
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ✅ Filtro de Cliente con carga dinámica
export function ClienteFilter<TData, TValue>({
  column,
}: {
  column?: Column<TData, TValue>;
}) {
  const [clientes, setClientes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const { selectedCompanyIds } = useCompanyContext();

  useEffect(() => {
    async function fetchClientes() {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (selectedCompanyIds.length > 0) {
          params.set('empresaIds', JSON.stringify(selectedCompanyIds));
        }

        const response = await fetch(`/api/filters/clientes?${params}`);
        const data = await response.json();
        setClientes(data.clientes || []);
      } catch (error) {
        console.error('❌ Error al cargar clientes:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchClientes();
  }, [selectedCompanyIds]);

  return (
    <DataTableFacetedFilter
      column={column}
      title="Cliente"
      options={clientes}
    />
  );
}

// ✅ Filtro de Proveedor con carga dinámica
export function ProveedorFilter<TData, TValue>({
  column,
}: {
  column?: Column<TData, TValue>;
}) {
  const [proveedores, setProveedores] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const { selectedCompanyIds } = useCompanyContext();

  useEffect(() => {
    async function fetchProveedores() {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (selectedCompanyIds.length > 0) {
          params.set('empresaIds', JSON.stringify(selectedCompanyIds));
        }

        const response = await fetch(`/api/filters/proveedores?${params}`);
        const data = await response.json();
        setProveedores(data.proveedores || []);
      } catch (error) {
        console.error('❌ Error al cargar proveedores:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchProveedores();
  }, [selectedCompanyIds]);

  return (
    <DataTableFacetedFilter
      column={column}
      title="Proveedor"
      options={proveedores}
    />
  );
}