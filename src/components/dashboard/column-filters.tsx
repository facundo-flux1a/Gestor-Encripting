'use client';

import { Column, Table } from '@tanstack/react-table';
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

// ✅ Filtro de Cliente: Trae todos desde API y filtra por los que están en la tabla
export function ClienteFilter<TData, TValue>({
  column,
  table,
}: {
  column?: Column<TData, TValue>;
  table?: Table<TData>;
}) {
  const [clientes, setClientes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const { selectedCompanyIds } = useCompanyContext();

  useEffect(() => {
    async function fetchAndFilterClientes() {
      if (!table) {
        console.warn('⚠️ [ClienteFilter] No se proporcionó table');
        return;
      }

      setLoading(true);
      try {
        // 1️⃣ Traer TODOS los clientes desde la API (sin filtrar)
        const params = new URLSearchParams();
        if (selectedCompanyIds.length > 0) {
          params.set('empresaIds', JSON.stringify(selectedCompanyIds));
        }

        console.log('📡 [ClienteFilter] Llamando API para traer todos los clientes...');
        const response = await fetch(`/api/filters/clientes?${params}`);
        const data = await response.json();
        const todosLosClientes = data.clientes || [];

        console.log('📦 [ClienteFilter] Clientes totales de API:', todosLosClientes.length);

        // 2️⃣ Extraer clientes que REALMENTE están en la tabla actual
        const allRows = table.getPreFilteredRowModel().rows;
        const clientesEnTabla = new Set<string>();
        
        allRows.forEach((row: any) => {
          const cliente = row.original.entidades?.find(
            (e: any) => e.rol === 'cliente' || e.rol === 'receptor'
          );
          
          if (cliente?.nombre && cliente.nombre !== 'Sin cliente') {
            clientesEnTabla.add(cliente.nombre);
          }
        });

        console.log('📊 [ClienteFilter] Clientes en tabla actual:', clientesEnTabla.size);

        // 3️⃣ Filtrar: Solo mostrar los que están en AMBOS lados
        const clientesFiltrados = todosLosClientes
          .filter((nombre: string) => clientesEnTabla.has(nombre))
          .sort();

        console.log('✅ [ClienteFilter] Clientes filtrados para mostrar:', clientesFiltrados.length);
        
        setClientes(clientesFiltrados);
      } catch (error) {
        console.error('❌ Error al cargar clientes:', error);
        setClientes([]);
      } finally {
        setLoading(false);
      }
    }

    fetchAndFilterClientes();
  }, [selectedCompanyIds, table]);

  return (
    <DataTableFacetedFilter
      column={column}
      title="Cliente"
      options={clientes}
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
  const [proveedores, setProveedores] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const { selectedCompanyIds } = useCompanyContext();

  useEffect(() => {
    async function fetchAndFilterProveedores() {
      if (!table) {
        console.warn('⚠️ [ProveedorFilter] No se proporcionó table');
        return;
      }

      setLoading(true);
      try {
        // 1️⃣ Traer TODOS los proveedores desde la API (sin filtrar)
        const params = new URLSearchParams();
        if (selectedCompanyIds.length > 0) {
          params.set('empresaIds', JSON.stringify(selectedCompanyIds));
        }

        console.log('📡 [ProveedorFilter] Llamando API para traer todos los proveedores...');
        const response = await fetch(`/api/filters/proveedores?${params}`);
        const data = await response.json();
        const todosLosProveedores = data.proveedores || [];

        console.log('📦 [ProveedorFilter] Proveedores totales de API:', todosLosProveedores.length);

        // 2️⃣ Extraer proveedores que REALMENTE están en la tabla actual
        const allRows = table.getPreFilteredRowModel().rows;
        const proveedoresEnTabla = new Set<string>();
        
        allRows.forEach((row: any) => {
          const proveedor = row.original.proveedor;
          
          if (proveedor && proveedor !== 'N/A' && proveedor !== 'Sin proveedor') {
            proveedoresEnTabla.add(proveedor);
          }
        });

        console.log('📊 [ProveedorFilter] Proveedores en tabla actual:', proveedoresEnTabla.size);

        // 3️⃣ Filtrar: Solo mostrar los que están en AMBOS lados
        const proveedoresFiltrados = todosLosProveedores
          .filter((nombre: string) => proveedoresEnTabla.has(nombre))
          .sort();

        console.log('✅ [ProveedorFilter] Proveedores filtrados para mostrar:', proveedoresFiltrados.length);
        
        setProveedores(proveedoresFiltrados);
      } catch (error) {
        console.error('❌ Error al cargar proveedores:', error);
        setProveedores([]);
      } finally {
        setLoading(false);
      }
    }

    fetchAndFilterProveedores();
  }, [selectedCompanyIds, table]);

  return (
    <DataTableFacetedFilter
      column={column}
      title="Proveedor"
      options={proveedores}
    />
  );
}