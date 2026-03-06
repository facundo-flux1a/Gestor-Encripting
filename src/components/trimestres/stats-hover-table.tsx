import React from 'react';
import { cn } from '@/lib/utils';

interface TaxRowProps {
    label: string;
    value: number;
    isTotal?: boolean;
    className?: string;
    onClick?: () => void;
    isActive?: boolean;
}

const formatCurrency = (amount: number): string => {
    if (amount === null || amount === undefined || isNaN(amount)) return '0,00 €';

    const fixed = amount.toFixed(2);
    const parts = fixed.split('.');

    // Add thousands separator manually
    const formattedInteger = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');

    return `${formattedInteger},${parts[1]} €`;
};

const TaxRow = ({ label, value, isTotal, className, onClick, isActive = true }: TaxRowProps) => (
    <div
        className={cn(
            'flex justify-between items-center text-xs py-1 transition-all duration-200 rounded px-1.5 -mx-1.5',
            onClick ? 'cursor-pointer hover:bg-muted/80 active:scale-95' : '',
            !isActive && 'opacity-40 grayscale decoration-slice',
            className
        )}
        onClick={onClick}
    >
        <span className={cn(
            'text-muted-foreground transition-colors',
            isTotal && 'font-bold text-foreground',
            !isActive && 'line-through decoration-muted-foreground/50'
        )}>
            {label}
        </span>
        <span className={cn(
            'font-medium tabular-nums transition-colors',
            isTotal && 'font-bold',
            !isActive && 'line-through decoration-muted-foreground/50'
        )}>
            {formatCurrency(value)}
        </span>
    </div>
);

// ... existing imports

interface StatsHoverTableProps {
    bases: {
        base21: number;
        base15?: number;
        base10: number;
        base4: number;
        base0: number;
    };
    quotas: {
        iva21: number;
        iva15?: number;
        iva10: number;
        iva4: number;
    };
    recargo?: number;
    retencion?: number;
    type?: 'ingresos' | 'gastos';
    showBases?: boolean;
    showTotal?: boolean;
    totalBaseOverride?: number;
    totalIvaOverride?: number;
    totalOverride?: number;
}

export function StatsHoverTable({
    bases,
    quotas,
    recargo,
    retencion,
    type = 'ingresos',
    showBases = true,
    showTotal = true,
    totalBaseOverride,
    totalIvaOverride,
    totalOverride
}: StatsHoverTableProps) {
    // Estado para claves desactivadas
    const [disabledKeys, setDisabledKeys] = React.useState<Set<string>>(new Set());

    const toggleKey = (key: string) => {
        const newSet = new Set(disabledKeys);
        if (newSet.has(key)) {
            newSet.delete(key);
        } else {
            newSet.add(key);
        }
        setDisabledKeys(newSet);
    };

    // Helper para verificar si está activo
    const isActive = (key: string) => !disabledKeys.has(key);
    const hasDisabledKeys = disabledKeys.size > 0;

    // 🔄 CÁLCULO DINÁMICO DE TOTALES BASADO EN ESTADO
    const currentBases = {
        base21: isActive('base21') ? bases.base21 : 0,
        base15: isActive('base15') ? (bases.base15 || 0) : 0,
        base10: isActive('base10') ? bases.base10 : 0,
        base4: isActive('base4') ? bases.base4 : 0,
        base0: isActive('base0') ? bases.base0 : 0,
    };

    const currentQuotas = {
        iva21: isActive('iva21') ? quotas.iva21 : 0,
        iva15: isActive('iva15') ? (quotas.iva15 || 0) : 0,
        iva10: isActive('iva10') ? quotas.iva10 : 0,
        iva4: isActive('iva4') ? quotas.iva4 : 0,
    };

    const currentRecargo = isActive('recargo') ? (recargo || 0) : 0;
    const currentRetencion = isActive('retencion') ? (retencion || 0) : 0;

    const calculatedTotalBase =
        (isActive('base21') ? bases.base21 : 0) +
        (isActive('base15') ? (bases.base15 || 0) : 0) +
        (isActive('base10') ? bases.base10 : 0) +
        (isActive('base4') ? bases.base4 : 0) +
        (isActive('base0') ? bases.base0 : 0);
    const calculatedTotalIVA =
        (isActive('iva21') ? quotas.iva21 : 0) +
        (isActive('iva15') ? (quotas.iva15 || 0) : 0) +
        (isActive('iva10') ? quotas.iva10 : 0) +
        (isActive('iva4') ? quotas.iva4 : 0);

    // Delta de bases desactivadas (lo que el usuario removió)
    const disabledBasesDelta =
        (!isActive('base21') ? bases.base21 : 0) +
        (!isActive('base15') ? (bases.base15 || 0) : 0) +
        (!isActive('base10') ? bases.base10 : 0) +
        (!isActive('base4') ? bases.base4 : 0) +
        (!isActive('base0') ? bases.base0 : 0);

    // Delta de cuotas desactivadas (AHORA SOLO IVA)
    const disabledQuotasDelta =
        (!isActive('iva21') ? quotas.iva21 : 0) +
        (!isActive('iva15') ? (quotas.iva15 || 0) : 0) +
        (!isActive('iva10') ? quotas.iva10 : 0) +
        (!isActive('iva4') ? quotas.iva4 : 0);

    // Si hay override del backend, anclar a él y restar exactamente lo desactivado
    const totalBase = totalBaseOverride !== undefined
        ? Math.abs(totalBaseOverride) - Math.abs(disabledBasesDelta)
        : calculatedTotalBase;

    const totalIVA = totalIvaOverride !== undefined
        ? Math.abs(totalIvaOverride) - Math.abs(disabledQuotasDelta)
        : Math.abs(calculatedTotalIVA);

    const grandTotal = totalOverride !== undefined
        ? Math.abs(totalOverride) - Math.abs(disabledBasesDelta) - Math.abs(disabledQuotasDelta) - (!isActive('recargo') ? Math.abs(recargo || 0) : 0) + (!isActive('retencion') ? Math.abs(retencion || 0) : 0)
        : (totalBase + totalIVA + currentRecargo - currentRetencion);

    return (
        <div className="min-w-[240px] p-1 space-y-3 select-none">
            {/* Bases Section */}
            {showBases && ( // 🆕 Conditional rendering
                <div className="space-y-0.5">
                    <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Bases Imponibles</div>

                    <TaxRow
                        label="Base 21%"
                        value={bases.base21}
                        onClick={() => toggleKey('base21')}
                        isActive={isActive('base21')}
                    />
                    {bases.base15 !== undefined && bases.base15 !== 0 && (
                        <TaxRow
                            label="Base 15%"
                            value={bases.base15}
                            onClick={() => toggleKey('base15')}
                            isActive={isActive('base15')}
                        />
                    )}
                    <TaxRow
                        label="Base 10%"
                        value={bases.base10}
                        onClick={() => toggleKey('base10')}
                        isActive={isActive('base10')}
                    />
                    <TaxRow
                        label="Base 4%"
                        value={bases.base4}
                        onClick={() => toggleKey('base4')}
                        isActive={isActive('base4')}
                    />
                    <TaxRow
                        label="Base 0%"
                        value={bases.base0}
                        onClick={() => toggleKey('base0')}
                        isActive={isActive('base0')}
                    />

                    <div className="border-t pt-1 mt-1 transition-all">
                        <TaxRow label="Total Bases" value={totalBase} isTotal />
                    </div>
                </div>
            )}

            {/* IVA Section */}
            <div className="space-y-0.5">
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 mt-2">Cuotas IVA</div>

                <TaxRow
                    label="IVA 21%"
                    value={quotas.iva21}
                    onClick={() => toggleKey('iva21')}
                    isActive={isActive('iva21')}
                />
                {quotas.iva15 !== undefined && quotas.iva15 !== 0 && (
                    <TaxRow
                        label="IVA 15%"
                        value={quotas.iva15}
                        onClick={() => toggleKey('iva15')}
                        isActive={isActive('iva15')}
                    />
                )}
                <TaxRow
                    label="IVA 10%"
                    value={quotas.iva10}
                    onClick={() => toggleKey('iva10')}
                    isActive={isActive('iva10')}
                />
                <TaxRow
                    label="IVA 4%"
                    value={quotas.iva4}
                    onClick={() => toggleKey('iva4')}
                    isActive={isActive('iva4')}
                />

                <div className="border-t pt-1 mt-1 transition-all">
                    <TaxRow label="Total IVA" value={totalIVA} isTotal />
                </div>
            </div>

            {/* Recargo Equivalencia */}
            {(recargo || 0) > 0 && (
                <div className="space-y-0.5">
                    <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 mt-2">Recargos</div>
                    <TaxRow
                        label="Recargo Equiv."
                        value={recargo!}
                        className="text-amber-600"
                        onClick={() => toggleKey('recargo')}
                        isActive={isActive('recargo')}
                    />
                </div>
            )}

            {/* Retenciones IRPF — fuera del bloque IVA, explica la diferencia con el total */}
            {(retencion || 0) > 0 && (
                <div className="space-y-0.5">
                    <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">IRPF</div>
                    <TaxRow
                        label="Retenciones"
                        value={-retencion!}
                        className="text-red-500"
                        onClick={() => toggleKey('retencion')}
                        isActive={isActive('retencion')}
                    />
                </div>
            )}

            {/* Grand Total */}
            {showTotal && (
                <div className={cn(
                    "border-t-2 pt-2 mt-2 transition-colors duration-300",
                    type === 'ingresos' ? "border-green-500/20" : "border-red-500/20"
                )}>
                    <div className="flex justify-between items-center">
                        <span className="font-bold text-sm">TOTAL {type === 'ingresos' ? 'FACTURADO' : 'GASTADO'}</span>
                        <span className={cn(
                            "font-bold text-sm tabular-nums transition-all duration-300",
                            type === 'ingresos' ? "text-green-600" : "text-red-600",
                            // Si hay cosas desactivadas, mostrar con un indicador visual extra (opcional)
                            disabledKeys.size > 0 && "scale-105"
                        )}>
                            {formatCurrency(grandTotal)}
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
}
