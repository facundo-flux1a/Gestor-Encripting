'use client';

import { Column, Table } from '@tanstack/react-table';
import { Check, ChevronsUpDown, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { useState, useMemo, useRef, useEffect } from 'react';
import { useCompanyContext } from '@/context/CompanyProvider';

/** Estilos compartidos — bordes suaves y transiciones */
export const filterInputClass =
  'h-8 rounded-xl border border-border/50 bg-background/90 shadow-sm backdrop-blur-sm transition-all duration-300 ease-out placeholder:text-muted-foreground/70 hover:border-primary/30 hover:shadow-md focus:border-primary/50 focus:ring-2 focus:ring-primary/15 focus:shadow-md';

export const filterPopoverClass =
  'rounded-2xl border border-border/40 bg-popover/95 p-0 shadow-xl backdrop-blur-md animate-in fade-in-0 zoom-in-95 duration-200';

export const filterSelectTriggerClass =
  'h-8 w-full rounded-xl border border-border/50 bg-background/90 text-xs shadow-sm transition-all duration-300 ease-out hover:border-primary/30 hover:shadow-md focus:ring-2 focus:ring-primary/15';

export const filterSelectContentClass =
  'rounded-xl border border-border/40 bg-popover/95 shadow-xl backdrop-blur-md animate-in fade-in-0 zoom-in-95 duration-200';

/** Filtro cmdk con includes (no fuzzy) */
export function includesCommandFilter(value: string, search: string): number {
  if (!search) return 1;
  return value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
}

/** Ordenar sugerencias: empieza por > includes antes > alfabético */
export function rankByIncludes(items: string[], search: string): string[] {
  const q = search.toLowerCase().trim();
  if (!q) return [...items].sort((a, b) => a.localeCompare(b, 'es'));

  return items
    .filter((item) => item.toLowerCase().includes(q))
    .sort((a, b) => {
      const al = a.toLowerCase();
      const bl = b.toLowerCase();
      const aStarts = al.startsWith(q) ? 0 : 1;
      const bStarts = bl.startsWith(q) ? 0 : 1;
      if (aStarts !== bStarts) return aStarts - bStarts;
      const aIdx = al.indexOf(q);
      const bIdx = bl.indexOf(q);
      if (aIdx !== bIdx) return aIdx - bIdx;
      return al.localeCompare(bl, 'es');
    });
}

export interface FilterOption {
  value: string;
  label: string;
}

export function FilterPlaceholder() {
  return <div className="h-8 w-full shrink-0" aria-hidden />;
}

interface DataTableFacetedFilterProps<TData, TValue> {
  column?: Column<TData, TValue>;
  title?: string;
  options: FilterOption[];
  isLoading?: boolean;
  /** Ocupa todo el ancho de la celda de filtro (fila inferior del header) */
  fullWidth?: boolean;
}

export function DataTableFacetedFilter<TData, TValue>({
  column,
  title,
  options,
  isLoading = false,
  fullWidth = false,
}: DataTableFacetedFilterProps<TData, TValue>) {
  const [open, setOpen] = useState(false);
  const selectedValues = new Set(column?.getFilterValue() as string[]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'h-8 rounded-xl border border-border/50 bg-background/90 text-xs shadow-sm',
            'transition-all duration-300 ease-out hover:border-primary/35 hover:bg-primary/5 hover:shadow-md',
            open && 'border-primary/45 bg-primary/5 shadow-md',
            fullWidth ? 'w-full justify-between px-2.5' : 'border-dashed'
          )}
          disabled={isLoading}
        >
          <span className="flex items-center gap-1.5 truncate">
            {isLoading ? (
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
            ) : (
              <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
            )}
            <span className="truncate">{fullWidth ? (title ?? 'Filtrar') : title}</span>
          </span>
          {selectedValues?.size > 0 && (
            <span className="ml-1.5 shrink-0 rounded-md bg-primary/15 px-1.5 py-0.5 font-mono text-[10px]">
              {selectedValues.size}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className={cn(filterPopoverClass, 'w-[220px]')} align="start">
        <Command filter={includesCommandFilter}>
          <CommandInput placeholder={`Buscar ${title?.toLowerCase()}...`} className="h-9" />
          {isLoading ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              <Loader2 className="mx-auto h-4 w-4 animate-spin" />
            </div>
          ) : (
            <>
              <CommandEmpty className="py-4 text-xs">Sin coincidencias</CommandEmpty>
              <CommandList>
                <CommandGroup className="max-h-56 overflow-auto p-1">
                  {options.map((option) => {
                    const isSelected = selectedValues.has(option.value);
                    return (
                      <CommandItem
                        key={option.value}
                        value={option.label}
                        onSelect={() => {
                          if (isSelected) selectedValues.delete(option.value);
                          else selectedValues.add(option.value);
                          const filterValues = Array.from(selectedValues);
                          column?.setFilterValue(filterValues.length ? filterValues : undefined);
                        }}
                        className="rounded-lg transition-colors duration-200 cursor-pointer"
                      >
                        <div
                          className={cn(
                            'mr-2 flex h-4 w-4 items-center justify-center rounded-md border transition-all duration-200',
                            isSelected
                              ? 'border-primary bg-primary text-primary-foreground scale-100'
                              : 'border-border/60 opacity-60 scale-95'
                          )}
                        >
                          <Check className={cn('h-3 w-3', !isSelected && 'invisible')} />
                        </div>
                        <span className="truncate">{option.label}</span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** Filtro texto con sugerencias includes mientras escribes */
export function TextColumnFilter<TData>({
  column,
  table,
  placeholder = 'Filtrar...',
}: {
  column: Column<TData, unknown>;
  table: Table<TData>;
  placeholder?: string;
}) {
  const rowCount = table.getPreFilteredRowModel().rows.length;
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState((column.getFilterValue() as string) ?? '');
  const inputRef = useRef<HTMLInputElement>(null);
  const filterValue = (column.getFilterValue() as string) ?? '';

  useEffect(() => {
    setInputValue(filterValue);
  }, [filterValue]);

  const suggestions = useMemo(() => {
    const unique = new Set<string>();
    table.getPreFilteredRowModel().rows.forEach((row) => {
      const val = row.getValue(column.id);
      if (val != null && String(val).trim() !== '') {
        unique.add(String(val));
      }
    });
    return rankByIncludes(Array.from(unique), inputValue).slice(0, 10);
  }, [table, column.id, inputValue, rowCount]);

  const applyFilter = (value: string) => {
    setInputValue(value);
    column.setFilterValue(value.trim() || undefined);
    setOpen(false);
  };

  const showSuggestions = open && inputValue.trim().length > 0 && suggestions.length > 0;

  return (
    <div className="relative w-full min-w-0">
      <div className="relative flex items-center gap-1">
        <Input
          ref={inputRef}
          value={inputValue}
          onChange={(e) => {
            const v = e.target.value;
            setInputValue(v);
            column.setFilterValue(v || undefined);
            setOpen(v.trim().length > 0);
          }}
          onFocus={() => inputValue.trim() && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 180)}
          placeholder={placeholder}
          className={cn(filterInputClass, 'w-full pr-7 text-xs')}
        />
        {inputValue && (
          <button
            type="button"
            onClick={() => applyFilter('')}
            className="absolute right-2 rounded-full p-0.5 text-muted-foreground/70 transition-all duration-200 hover:bg-muted hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {showSuggestions && (
        <ul
          className={cn(
            'absolute z-[200] mt-1.5 w-full overflow-hidden rounded-xl border border-border/40',
            'bg-popover/95 py-1 shadow-xl backdrop-blur-md',
            'animate-in fade-in-0 slide-in-from-top-1 duration-200'
          )}
        >
          {suggestions.map((suggestion) => (
            <li key={suggestion}>
              <button
                type="button"
                className={cn(
                  'w-full px-3 py-1.5 text-left text-xs transition-colors duration-200',
                  'hover:bg-primary/10 hover:text-primary',
                  inputValue.toLowerCase() === suggestion.toLowerCase() && 'bg-primary/5'
                )}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyFilter(suggestion)}
              >
                {highlightMatch(suggestion, inputValue)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function highlightMatch(text: string, query: string) {
  if (!query.trim()) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded bg-primary/20 px-0.5 font-medium text-primary">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

/** Select de trimestre (Q1–Q4 + año) */
export function TrimestreFilter<TData>({
  column,
  table,
}: {
  column: Column<TData, unknown>;
  table: Table<TData>;
}) {
  const rowCount = table.getPreFilteredRowModel().rows.length;
  const current = (column.getFilterValue() as string) ?? '';

  const options = useMemo(() => {
    const map = new Map<string, string>();
    table.getPreFilteredRowModel().rows.forEach((row: any) => {
      const anio = row.original?.año_trimestre;
      const t = row.original?.num_trimestre;
      if (anio && t) {
        const value = `${anio}-Q${t}`;
        map.set(value, `Q${t} ${anio}`);
      }
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([value, label]) => ({ value, label }));
  }, [table, rowCount]);

  return (
    <div className="w-full min-w-0">
      <Select
        value={current || '__all__'}
        onValueChange={(v) => column.setFilterValue(v === '__all__' ? undefined : v)}
      >
        <SelectTrigger className={filterSelectTriggerClass}>
          <SelectValue placeholder="Trimestre" />
        </SelectTrigger>
        <SelectContent className={filterSelectContentClass}>
          <SelectItem value="__all__" className="rounded-lg transition-colors duration-200">
            Todos
          </SelectItem>
          {options.map((opt) => (
            <SelectItem
              key={opt.value}
              value={opt.value}
              className="rounded-lg transition-colors duration-200"
            >
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function FacetedColumnFilter<TData>({
  column,
  table,
  title,
  getValueFromRow,
  extraOptions = [],
}: {
  column: Column<TData, unknown>;
  table: Table<TData>;
  title: string;
  getValueFromRow?: (row: TData) => string | null | undefined;
  extraOptions?: string[];
}) {
  const rowCount = table.getPreFilteredRowModel().rows.length;

  const options = useMemo((): FilterOption[] => {
    const map = new Map<string, string>();
    table.getPreFilteredRowModel().rows.forEach((row) => {
      const raw = getValueFromRow
        ? getValueFromRow(row.original)
        : (row.getValue(column.id) as string | null | undefined);
      if (raw != null && String(raw).trim() !== '') {
        const value = String(raw);
        if (!map.has(value)) map.set(value, value);
      }
    });
    extraOptions.forEach((opt) => {
      if (opt?.trim() && !map.has(opt)) map.set(opt, opt);
    });
    return Array.from(map.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'es'));
  }, [table, column.id, rowCount, getValueFromRow, extraOptions]);

  return (
    <DataTableFacetedFilter column={column} title={title} options={options} isLoading={false} fullWidth />
  );
}

/** Filtro multi-select para valores de columna (CIF, tipo doc, empresa…) */
export function facetedArrayFilter(rowValue: string, filterValue: unknown): boolean {
  if (!filterValue || (Array.isArray(filterValue) && filterValue.length === 0)) return true;
  if (Array.isArray(filterValue)) return filterValue.includes(rowValue);
  if (typeof filterValue === 'string') {
    return rowValue.toLowerCase().includes(filterValue.toLowerCase());
  }
  return true;
}

export function IncidenciasFilter<TData>({
  column,
}: {
  column: Column<TData, unknown>;
}) {
  const current = (column.getFilterValue() as string) ?? '';

  return (
    <div className="w-full min-w-0">
      <Select
        value={current || '__all__'}
        onValueChange={(v) => column.setFilterValue(v === '__all__' ? undefined : v)}
      >
        <SelectTrigger className={filterSelectTriggerClass}>
          <SelectValue placeholder="Estado" />
        </SelectTrigger>
        <SelectContent className={filterSelectContentClass}>
          <SelectItem value="__all__" className="rounded-lg transition-colors duration-200">
            Todos
          </SelectItem>
          <SelectItem value="ok" className="rounded-lg transition-colors duration-200">
            OK
          </SelectItem>
          <SelectItem value="con_incidencias" className="rounded-lg transition-colors duration-200">
            Con incidencias
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

export function TipoDocumentoFilter<TData>({
  column,
  table,
}: {
  column: Column<TData, unknown>;
  table: Table<TData>;
}) {
  const extraOptions =
    (column.columnDef.meta as { filterExtraOptions?: string[] } | undefined)?.filterExtraOptions ?? [];

  return (
    <FacetedColumnFilter
      column={column}
      table={table}
      title="Tipo"
      getValueFromRow={(row: any) => row.tipo_documento}
      extraOptions={extraOptions}
    />
  );
}

export function CifFilter<TData>({
  column,
  table,
}: {
  column: Column<TData, unknown>;
  table: Table<TData>;
}) {
  return (
    <FacetedColumnFilter
      column={column}
      table={table}
      title="CIF"
      getValueFromRow={(row: any) => row.cif}
    />
  );
}

export function EmpresaSistemaFilter<TData>({
  column,
  table,
}: {
  column: Column<TData, unknown>;
  table: Table<TData>;
}) {
  return (
    <FacetedColumnFilter
      column={column}
      table={table}
      title="Empresa"
      getValueFromRow={(row: any) => row.empresa_nombre || 'Sin empresa'}
    />
  );
}

export function ClienteFilter<TData, TValue>({
  column,
  table,
}: {
  column?: Column<TData, TValue>;
  table?: Table<TData>;
}) {
  const rowCount = table?.getPreFilteredRowModel().rows.length ?? 0;
  const companyKey = useCompanyContext().selectedCompanyIds.join(',');

  const clientes = useMemo((): FilterOption[] => {
    if (!table) return [];
    const hashToName = new Map<string, string>();
    table.getPreFilteredRowModel().rows.forEach((row: any) => {
      const cliente = row.original.entidades?.find(
        (e: any) => e.rol === 'cliente' || e.rol === 'receptor'
      );
      if (!cliente?.nombre || cliente.nombre === 'Sin cliente') return;
      const key: string =
        cliente.identificador_fiscal_hash || cliente.identificador_fiscal || cliente.nombre;
      if (key && !hashToName.has(key)) hashToName.set(key, cliente.nombre);
    });
    return Array.from(hashToName.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'es'));
  }, [table, rowCount, companyKey]);

  return (
    <DataTableFacetedFilter column={column} title="Cliente" options={clientes} isLoading={false} fullWidth />
  );
}

export function ProveedorFilter<TData, TValue>({
  column,
  table,
}: {
  column?: Column<TData, TValue>;
  table?: Table<TData>;
}) {
  const rowCount = table?.getPreFilteredRowModel().rows.length ?? 0;
  const companyKey = useCompanyContext().selectedCompanyIds.join(',');

  const proveedores = useMemo((): FilterOption[] => {
    if (!table) return [];
    const hashToName = new Map<string, string>();
    table.getPreFilteredRowModel().rows.forEach((row: any) => {
      const nombre: string = row.original.proveedor;
      if (!nombre || nombre === 'N/A' || nombre === 'Sin proveedor') return;
      const emisor = row.original.entidades?.find(
        (e: any) => e.rol === 'proveedor' || e.rol === 'emisor'
      );
      const key: string = emisor?.identificador_fiscal_hash || emisor?.identificador_fiscal || nombre;
      if (key && !hashToName.has(key)) hashToName.set(key, nombre);
    });
    return Array.from(hashToName.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'es'));
  }, [table, rowCount, companyKey]);

  return (
    <DataTableFacetedFilter column={column} title="Proveedor" options={proveedores} isLoading={false} fullWidth />
  );
}
