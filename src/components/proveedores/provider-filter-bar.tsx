'use client';

import * as React from 'react';
import { Search, X, CalendarRange, DollarSign, ChevronDown, Clock, CalendarDays } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"

export interface ProviderFilterState {
    searchText: string;
    fechaDesde: string;
    fechaHasta: string;
    precioMin: string;
    precioMax: string;
    trimestre: string;
    anio: string;
    tipoPrecio: 'unitario' | 'total'; // ✅ Nuevo: Define qué campo filtrar
}

interface ProviderFilterBarProps {
    filters: ProviderFilterState;
    onFiltersChange: (filters: ProviderFilterState) => void;
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
                step={type === 'number' ? '0.01' : undefined}
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder={placeholder ?? (type === 'date' ? 'dd/mm/aaaa' : '0,00')}
                className="h-8 text-xs bg-muted/20"
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
                    className={cn('h-9 border-dashed gap-1.5', isActive && 'border-primary/50 bg-primary/5 text-primary')}
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
                <div className="rounded-lg border bg-popover p-4 shadow-xl w-[280px] space-y-4">
                    {children}
                </div>
            </CollapsibleContent>
        </Collapsible>
    );
}

export function ProviderFilterBar({
    filters,
    onFiltersChange,
}: ProviderFilterBarProps) {

    const update = (patch: Partial<ProviderFilterState>) =>
        onFiltersChange({ ...filters, ...patch });

    const isFechaActive = !!(filters.fechaDesde || filters.fechaHasta || (filters.trimestre && filters.trimestre !== 'all') || (filters.anio && filters.anio !== 'all'));
    const isPrecioActive = !!(filters.precioMin || filters.precioMax);

    const isAnyFilterActive = !!(
        filters.searchText ||
        isFechaActive ||
        isPrecioActive
    );

    const currentYear = new Date().getFullYear();
    const years = [currentYear.toString(), (currentYear - 1).toString(), (currentYear - 2).toString()];

    return (
        <div className="relative flex flex-wrap items-center gap-2 py-2">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="Filtrar por código o nombre..."
                    value={filters.searchText}
                    onChange={e => update({ searchText: e.target.value })}
                    className="h-9 pl-9 text-sm bg-background border-dashed"
                />
                {filters.searchText && (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground hover:text-foreground"
                        onClick={() => update({ searchText: '' })}
                    >
                        <X className="h-3.5 w-3.5" />
                    </Button>
                )}
            </div>

            <FilterGroup
                title="Fechas y Períodos"
                icon={<CalendarRange className="h-4 w-4" />}
                isActive={isFechaActive}
            >
                <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1.5">
                            <Label className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1">
                                <Clock className="w-3 h-3" /> Trimestre
                            </Label>
                            <Select value={filters.trimestre} onValueChange={(v) => update({ trimestre: v })}>
                                <SelectTrigger className="h-8 text-xs">
                                    <SelectValue placeholder="Trim." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Todo el año</SelectItem>
                                    <SelectItem value="1">1º Trim.</SelectItem>
                                    <SelectItem value="2">2º Trim.</SelectItem>
                                    <SelectItem value="3">3º Trim.</SelectItem>
                                    <SelectItem value="4">4º Trim.</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1">
                                <CalendarDays className="w-3 h-3" /> Año
                            </Label>
                            <Select value={filters.anio} onValueChange={(v) => update({ anio: v })}>
                                <SelectTrigger className="h-8 text-xs">
                                    <SelectValue placeholder="Año" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Cualquiera</SelectItem>
                                    {years.map(y => (
                                        <SelectItem key={y} value={y}>{y}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="pt-2 border-t border-border grid grid-cols-2 gap-2">
                        <RangeInput
                            label="Desde"
                            type="date"
                            value={filters.fechaDesde}
                            onChange={v => update({ fechaDesde: v })}
                        />
                        <RangeInput
                            label="Hasta"
                            type="date"
                            value={filters.fechaHasta}
                            onChange={v => update({ fechaHasta: v })}
                        />
                    </div>
                </div>
            </FilterGroup>

            <FilterGroup
                title="Rango de Precios"
                icon={<DollarSign className="h-4 w-4" />}
                isActive={isPrecioActive}
            >
                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <Label className="text-[10px] uppercase font-bold text-muted-foreground">Filtrar por:</Label>
                        <Select
                            value={filters.tipoPrecio}
                            onValueChange={(v: 'unitario' | 'total') => update({ tipoPrecio: v })}
                        >
                            <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="unitario">Precio Unitario</SelectItem>
                                <SelectItem value="total">Importe Total (Línea)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        <RangeInput
                            label="Mínimo"
                            value={filters.precioMin}
                            onChange={v => update({ precioMin: v })}
                        />
                        <RangeInput
                            label="Máximo"
                            value={filters.precioMax}
                            onChange={v => update({ precioMax: v })}
                        />
                    </div>
                </div>
            </FilterGroup>

            {isAnyFilterActive && (
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 text-xs text-muted-foreground hover:text-destructive flex items-center gap-1.5 ml-auto"
                    onClick={() => onFiltersChange({
                        searchText: '',
                        fechaDesde: '',
                        fechaHasta: '',
                        precioMin: '',
                        precioMax: '',
                        trimestre: 'all',
                        anio: 'all',
                        tipoPrecio: 'unitario'
                    })}
                >
                    <X className="h-3.5 w-3.5" />
                    Limpiar
                </Button>
            )}
        </div>
    );
}