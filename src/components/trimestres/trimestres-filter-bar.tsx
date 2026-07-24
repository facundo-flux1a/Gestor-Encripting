'use client';

import * as React from 'react';
import { Search, X, ChevronsUpDown, Check, Loader2, SlidersHorizontal, CalendarRange, DollarSign, ChevronDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
} from '@/components/ui/command';
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import type { Document } from '@/lib/types';

// ─────────────────────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────────────────────

export interface TrimestresFilterState {
    searchText: string;
    selectedTipos: string[];
    selectedProveedores: string[];
    selectedClientes: string[];
    selectedEmpresas: string[];
    fechaDesde: string;
    fechaHasta: string;
    baseMin: string;
    baseMax: string;
    ivaMin: string;
    ivaMax: string;
    totalMin: string;
    totalMax: string;
}

interface TrimestresFilterBarProps {
    /** Documentos del trimestre actual — para cruzar opciones de BD */
    documentos: Document[];
    filters: TrimestresFilterState;
    onFiltersChange: (filters: TrimestresFilterState) => void;
    empresaIds: number[];
    año: number;
    trimestre: number;
    /**
     * Cuando mostrarVacios=true, el filtro de empresa muestra TODAS las empresas del usuario
     * (aunque no tengan documentos en el trimestre actual).
     */
    mostrarVacios?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// SUBCOMPONENTES
// ─────────────────────────────────────────────────────────────────────────────

function MultiSelectFilter({
    title,
    options,
    selected,
    onChange,
    isLoading = false,
}: {
    title: string;
    options: string[];
    selected: string[];
    onChange: (v: string[]) => void;
    isLoading?: boolean;
}) {
    const [open, setOpen] = React.useState(false);

    const toggle = (value: string) => {
        onChange(selected.includes(value)
            ? selected.filter(v => v !== value)
            : [...selected, value]
        );
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 border-dashed gap-1.5" disabled={isLoading}>
                    {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ChevronsUpDown className="h-3.5 w-3.5" />}
                    <span>{title}</span>
                    {selected.length > 0 && (
                        <>
                            <span className="mx-1 h-4 w-px bg-border" />
                            <Badge variant="secondary" className="h-5 px-1 text-[10px] font-mono">{selected.length}</Badge>
                        </>
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[220px] p-0" align="start">
                <Command>
                    <CommandInput placeholder={`Buscar ${title.toLowerCase()}...`} />
                    {isLoading ? (
                        <div className="py-6 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" /> Cargando...
                        </div>
                    ) : (
                        <>
                            <CommandEmpty>Sin resultados</CommandEmpty>
                            <CommandGroup className="max-h-60 overflow-auto">
                                {options.map(option => {
                                    const isSelected = selected.includes(option);
                                    return (
                                        <CommandItem key={option} onSelect={() => toggle(option)}>
                                            <div className={cn(
                                                'mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary flex-shrink-0',
                                                isSelected ? 'bg-primary text-primary-foreground' : 'opacity-50 [&_svg]:invisible'
                                            )}>
                                                <Check className="h-4 w-4" />
                                            </div>
                                            <span className="truncate text-sm">{option}</span>
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

function RangeInput({
    label,
    value,
    onChange,
    placeholder,
    type = 'number',
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    type?: string;
}) {
    return (
        <div className="flex flex-col gap-1">
            <Label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{label}</Label>
            <Input
                type={type}
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder={placeholder ?? (type === 'date' ? 'dd/mm/aaaa' : '0,00')}
                className="h-7 text-xs"
            />
        </div>
    );
}

function FilterGroup({
    title,
    icon,
    isActive,
    children,
}: {
    title: string;
    icon: React.ReactNode;
    isActive: boolean;
    children: React.ReactNode;
}) {
    const [open, setOpen] = React.useState(false);

    React.useEffect(() => {
        if (isActive) setOpen(true);
    }, [isActive]);

    return (
        <Collapsible open={open} onOpenChange={setOpen}>
            <CollapsibleTrigger asChild>
                <Button
                    variant="outline"
                    size="sm"
                    className={cn('h-8 border-dashed gap-1.5', isActive && 'border-primary/50 bg-primary/5')}
                >
                    {icon}
                    <span>{title}</span>
                    {isActive && (
                        <>
                            <span className="mx-1 h-4 w-px bg-border" />
                            <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                        </>
                    )}
                    <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
                </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="absolute z-50 mt-1">
                <div className="rounded-lg border bg-popover p-3 shadow-xl w-60 space-y-3">
                    {children}
                </div>
            </CollapsibleContent>
        </Collapsible>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

export function TrimestresFilterBar({
    documentos,
    filters,
    onFiltersChange,
    empresaIds,
    año,
    trimestre,
    mostrarVacios = false,
}: TrimestresFilterBarProps) {

    // ── Opciones desde BD (tipos, proveedores, clientes) ──────────────────────
    const [tiposFromDB, setTiposFromDB] = React.useState<string[]>([]);
    const [proveedoresFromDB, setProveedoresFromDB] = React.useState<string[]>([]);
    const [clientesFromDB, setClientesFromDB] = React.useState<string[]>([]);
    const [loadingTipos, setLoadingTipos] = React.useState(false);
    const [loadingProveedores, setLoadingProveedores] = React.useState(false);
    const [loadingClientes, setLoadingClientes] = React.useState(false);

    // ── Empresas desde /api/companies (todas las del usuario) ─────────────────
    const [allEmpresas, setAllEmpresas] = React.useState<string[]>([]);
    const [loadingEmpresas, setLoadingEmpresas] = React.useState(false);

    // Cargar TODAS las empresas del usuario desde la BD
    React.useEffect(() => {
        setLoadingEmpresas(true);
        fetch('/api/companies')
            .then(r => r.json())
            .then((data: { name: string }[]) => {
                setAllEmpresas((data || []).map(c => c.name).sort());
            })
            .catch(() => setAllEmpresas([]))
            .finally(() => setLoadingEmpresas(false));
    }, []); // Solo una vez al montar

    // ── Empresas que SÍ tienen documentos en este trimestre ───────────────────
    const empresasConDocs = React.useMemo(() => {
        return new Set(documentos.map(d => d.empresa_nombre).filter(Boolean));
    }, [documentos]);

    // Si mostrarVacios=true → mostrar todas las empresas del usuario
    // Si mostrarVacios=false → solo las que tienen docs en el trimestre
    const empresasOptions = React.useMemo(() => {
        if (mostrarVacios) return allEmpresas;
        return allEmpresas.filter(nombre => empresasConDocs.has(nombre));
    }, [allEmpresas, empresasConDocs, mostrarVacios]);

    // ── Carga las otras opciones desde BD ─────────────────────────────────────
    React.useEffect(() => {
        if (empresaIds.length === 0) return;

        const params = new URLSearchParams({
            empresaIds: JSON.stringify(empresaIds),
            año: año.toString(),
            trimestre: trimestre.toString(),
        });

        setLoadingTipos(true);
        fetch(`/api/filters/tipos?${params}`)
            .then(r => r.json())
            .then(d => {
                const inTabla = new Set(documentos.map(doc => doc.tipo_documento).filter(Boolean));
                setTiposFromDB((d.tipos || []).filter((t: string) => inTabla.has(t)));
            })
            .catch(() => setTiposFromDB([]))
            .finally(() => setLoadingTipos(false));

        setLoadingProveedores(true);
        const cifToProvName = new Map<string, string>();
        const uniqueProvNamesNoCif = new Set<string>();

        documentos.forEach(doc => {
            const rawProv = doc.proveedor;
            if (!rawProv || rawProv === 'N/A') return;
            const cleanedCif = doc.cif ? doc.cif.toUpperCase().replace(/[\s\-./]/g, '').replace(/^ES/, '') : '';
            if (cleanedCif) {
                if (!cifToProvName.has(cleanedCif)) {
                    cifToProvName.set(cleanedCif, rawProv);
                }
            } else {
                uniqueProvNamesNoCif.add(rawProv);
            }
        });
        const finalProvs = [...Array.from(cifToProvName.values()), ...Array.from(uniqueProvNamesNoCif)].sort((a, b) => a.localeCompare(b));
        setProveedoresFromDB(finalProvs);
        setLoadingProveedores(false);

        setLoadingClientes(true);
        const cifToCliName = new Map<string, string>();
        const uniqueCliNamesNoCif = new Set<string>();

        documentos.forEach(doc => {
            const clientEntity = doc.entidades?.find(e => e.rol === 'cliente' || e.rol === 'receptor');
            const rawClient = clientEntity?.nombre;
            if (!rawClient || rawClient === 'N/A') return;
            const cleanedCif = clientEntity?.identificador_fiscal ? clientEntity.identificador_fiscal.toUpperCase().replace(/[\s\-./]/g, '').replace(/^ES/, '') : '';
            if (cleanedCif) {
                if (!cifToCliName.has(cleanedCif)) {
                    cifToCliName.set(cleanedCif, rawClient);
                }
            } else {
                uniqueCliNamesNoCif.add(rawClient);
            }
        });
        const finalClientes = [...Array.from(cifToCliName.values()), ...Array.from(uniqueCliNamesNoCif)].sort((a, b) => a.localeCompare(b));
        setClientesFromDB(finalClientes);
        setLoadingClientes(false);

    }, [empresaIds, año, trimestre, documentos]);

    // ── Helpers ───────────────────────────────────────────────────────────────
    const update = (patch: Partial<TrimestresFilterState>) =>
        onFiltersChange({ ...filters, ...patch });

    const isFechaActive = !!(filters.fechaDesde || filters.fechaHasta);
    const isNumerosActive = !!(
        filters.baseMin || filters.baseMax ||
        filters.ivaMin || filters.ivaMax ||
        filters.totalMin || filters.totalMax
    );

    const isAnyFilterActive = !!(
        filters.searchText ||
        filters.selectedTipos.length ||
        filters.selectedProveedores.length ||
        filters.selectedClientes.length ||
        filters.selectedEmpresas.length ||
        isFechaActive || isNumerosActive
    );

    const activeCount =
        filters.selectedTipos.length +
        filters.selectedProveedores.length +
        filters.selectedClientes.length +
        filters.selectedEmpresas.length +
        (isFechaActive ? 1 : 0) +
        (isNumerosActive ? 1 : 0);

    return (
        <div className="relative flex flex-wrap items-center gap-2 py-2">
            <SlidersHorizontal className="h-4 w-4 text-muted-foreground shrink-0" />

            {/* Búsqueda de texto */}
            <div className="relative flex-1 min-w-[180px] max-w-xs">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                    placeholder="Buscar en tabla..."
                    value={filters.searchText}
                    onChange={e => update({ searchText: e.target.value })}
                    className="h-8 pl-8 text-sm"
                />
                {filters.searchText && (
                    <button
                        onClick={() => update({ searchText: '' })}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                        <X className="h-3.5 w-3.5" />
                    </button>
                )}
            </div>

            <MultiSelectFilter title="Tipo" options={tiposFromDB} selected={filters.selectedTipos}
                onChange={v => update({ selectedTipos: v })} isLoading={loadingTipos} />
            <MultiSelectFilter title="Proveedor" options={proveedoresFromDB} selected={filters.selectedProveedores}
                onChange={v => update({ selectedProveedores: v })} isLoading={loadingProveedores} />
            <MultiSelectFilter title="Cliente" options={clientesFromDB} selected={filters.selectedClientes}
                onChange={v => update({ selectedClientes: v })} isLoading={loadingClientes} />

            {/* Empresa del sistema (desde BD, cruzada con docs del trimestre) */}
            <MultiSelectFilter title="Empresa" options={empresasOptions} selected={filters.selectedEmpresas}
                onChange={v => update({ selectedEmpresas: v })} isLoading={loadingEmpresas} />

            {/* Fechas */}
            <FilterGroup title="Fechas" icon={<CalendarRange className="h-3.5 w-3.5" />} isActive={isFechaActive}>
                <RangeInput type="date" label="Desde" value={filters.fechaDesde}
                    onChange={v => update({ fechaDesde: v })} />
                <RangeInput type="date" label="Hasta" value={filters.fechaHasta}
                    onChange={v => update({ fechaHasta: v })} />
                {isFechaActive && (
                    <Button variant="ghost" size="sm" className="w-full h-7 text-xs text-muted-foreground"
                        onClick={() => update({ fechaDesde: '', fechaHasta: '' })}>
                        <X className="h-3 w-3 mr-1" /> Limpiar fechas
                    </Button>
                )}
            </FilterGroup>

            {/* Importes */}
            <FilterGroup title="Importes" icon={<DollarSign className="h-3.5 w-3.5" />} isActive={isNumerosActive}>
                <div className="space-y-2.5">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Base Imponible</p>
                    <div className="grid grid-cols-2 gap-2">
                        <RangeInput label="Desde" value={filters.baseMin} onChange={v => update({ baseMin: v })} placeholder="Min" />
                        <RangeInput label="Hasta" value={filters.baseMax} onChange={v => update({ baseMax: v })} placeholder="Max" />
                    </div>
                    <div className="h-px bg-border" />
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">IVA</p>
                    <div className="grid grid-cols-2 gap-2">
                        <RangeInput label="Desde" value={filters.ivaMin} onChange={v => update({ ivaMin: v })} placeholder="Min" />
                        <RangeInput label="Hasta" value={filters.ivaMax} onChange={v => update({ ivaMax: v })} placeholder="Max" />
                    </div>
                    <div className="h-px bg-border" />
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Total</p>
                    <div className="grid grid-cols-2 gap-2">
                        <RangeInput label="Desde" value={filters.totalMin} onChange={v => update({ totalMin: v })} placeholder="Min" />
                        <RangeInput label="Hasta" value={filters.totalMax} onChange={v => update({ totalMax: v })} placeholder="Max" />
                    </div>
                </div>
                {isNumerosActive && (
                    <Button variant="ghost" size="sm" className="w-full h-7 text-xs text-muted-foreground mt-1"
                        onClick={() => update({ baseMin: '', baseMax: '', ivaMin: '', ivaMax: '', totalMin: '', totalMax: '' })}>
                        <X className="h-3 w-3 mr-1" /> Limpiar importes
                    </Button>
                )}
            </FilterGroup>

            {/* Limpiar todo */}
            {isAnyFilterActive && (
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onFiltersChange({
                        searchText: '', selectedTipos: [], selectedProveedores: [],
                        selectedClientes: [], selectedEmpresas: [],
                        fechaDesde: '', fechaHasta: '',
                        baseMin: '', baseMax: '', ivaMin: '', ivaMax: '', totalMin: '', totalMax: '',
                    })}
                    className="h-8 gap-1.5 text-muted-foreground hover:text-foreground"
                >
                    <X className="h-3.5 w-3.5" />
                    Limpiar
                    {activeCount > 0 && (
                        <Badge variant="secondary" className="h-5 px-1 text-[10px]">{activeCount}</Badge>
                    )}
                </Button>
            )}
        </div>
    );
}
