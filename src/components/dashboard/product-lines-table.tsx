import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Folder, TrendingUp, TrendingDown, Eye } from 'lucide-react';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import type { DocumentLine } from "@/lib/types";

interface ProductLinesTableProps {
    lines: DocumentLine[];
    providerFiscalId: string; // ✅ Necesitamos esto para armar la URL
}

const formatCurrency = (amount: number | string | null | undefined, currency: string = 'EUR') => {
    if (amount === null || amount === undefined) return '0,00 €';
    let numericAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    if (isNaN(numericAmount)) return '0,00 €';
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency }).format(numericAmount);
};

const formatDate = (date: string | null | undefined) => {
    if (!date) return '-';
    try {
        const d = new Date(date);
        const utcDate = new Date(d.valueOf() + d.getTimezoneOffset() * 60 * 1000);
        return new Intl.DateTimeFormat('es-ES', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(utcDate);
    } catch { return '-'; }
};

function ProductLineGroup({ group, providerFiscalId }: { group: DocumentLine[], providerFiscalId: string }) {
    const [isOpen, setIsOpen] = useState(false);

    const sortedGroup = [...group].sort((a, b) => {
        const da = a.fecha_emision || '';
        const db = b.fecha_emision || '';
        return db.localeCompare(da);
    });
    const line = sortedGroup[0];
    const totalQty = group.reduce((acc, curr) => acc + (Number(curr.cantidad) || 0), 0);
    const totalLineAmount = group.reduce((acc, curr) => acc + (Number(curr.importe_linea) || 0), 0);
    const numberOfPurchases = group.length;

    // 📈 Cálculo de Variación de Precio (Última Compra vs Promedio Histórico)
    let priceVariation = 0;
    const isPriceVariation = sortedGroup.length > 1;

    if (isPriceVariation) {
        const newestPrice = Number(sortedGroup[0].precio_unitario) || 0;
        const avgPrice = totalQty > 0 ? totalLineAmount / totalQty : 0; // Promedio ponderado

        if (avgPrice > 0) {
            priceVariation = ((newestPrice - avgPrice) / avgPrice) * 100;
        }
    }

    // ✅ Lógica de URL igual a la de las cards
    const identifier = line.codigo
        ? encodeURIComponent(line.codigo)
        : `DESC_${encodeURIComponent(line.descripcion || '')}`;
    const productUrl = `/proveedores/${encodeURIComponent(providerFiscalId)}/${identifier}`;

    // Componente de botón de ver detalle
    const ViewDetailButton = () => (
        <Link href={productUrl} onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary">
                <Eye className="h-4 w-4" />
            </Button>
        </Link>
    );

    if (group.length === 1) {
        return (
            <TableRow className="hover:bg-muted/50 transition-colors group/row">
                <TableCell className="max-w-[400px]" title={line.descripcion || ''}>
                    {line.fecha_emision && (
                        <span className="text-[10px] text-muted-foreground block mb-0.5">
                            ({formatDate(line.fecha_emision)})
                        </span>
                    )}
                    <span className="font-semibold">{line.descripcion || '-'}</span>
                </TableCell>
                <TableCell className="text-right tabular-nums">{Number(line.cantidad) || 0}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCurrency(line.precio_unitario)}</TableCell>
                <TableCell className="text-right tabular-nums font-bold text-primary">{formatCurrency(line.importe_linea)}</TableCell>
                <TableCell className="text-center">
                    <ViewDetailButton />
                </TableCell>
            </TableRow>
        );
    }

    return (
        <>
            <TableRow
                className="bg-muted/5 group/row hover:bg-muted/20 cursor-pointer transition-all border-l-2 border-transparent data-[state=open]:border-primary"
                onClick={() => setIsOpen(!isOpen)}
                data-state={isOpen ? 'open' : 'closed'}
            >
                <TableCell className="max-w-[400px] font-semibold py-4" title={line.descripcion || ''}>
                    <div className="flex items-center gap-3">
                        <div className="relative flex-shrink-0">
                            <Folder className={`w-6 h-6 ${isOpen ? 'text-primary' : 'text-muted-foreground'} fill-current opacity-20 transition-colors`} />
                            <div className="absolute -top-1.5 -right-1.5 bg-primary text-primary-foreground text-[9px] font-bold px-1 rounded-sm min-w-[15px] h-[15px] flex items-center justify-center shadow-sm border border-background">
                                {numberOfPurchases}
                            </div>
                        </div>

                        <div className="flex flex-col min-w-0 flex-1">
                            <span className="truncate group-hover/row:text-primary transition-colors">
                                {line.descripcion || '-'}
                            </span>
                            {line.codigo && (
                                <span className="text-[10px] text-muted-foreground font-mono opacity-60">
                                    {line.codigo}
                                </span>
                            )}
                        </div>

                        {isOpen ? (
                            <ChevronDown className="w-4 h-4 text-muted-foreground opacity-50" />
                        ) : (
                            <ChevronRight className="w-4 h-4 text-muted-foreground opacity-50" />
                        )}
                    </div>
                </TableCell>
                <TableCell className="text-right tabular-nums font-bold text-base">
                    {totalQty.toLocaleString('es-ES')}
                </TableCell>
                <TableCell className="text-right">
                    <div className="flex flex-col items-end justify-center gap-1">
                        <span className="tabular-nums font-semibold">{formatCurrency(totalQty > 0 ? totalLineAmount / totalQty : 0)}</span>

                        <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[9px] text-muted-foreground/70 font-bold uppercase tracking-[0.2em] bg-muted/50 px-1.5 py-0.5 rounded-sm">
                                Evolución
                            </span>

                            {/* 📈 Badge de Variación */}
                            {isPriceVariation && (
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <div className={`flex items-center px-2 py-0.5 rounded-sm text-xs font-bold cursor-help ${priceVariation > 0
                                                ? 'bg-red-500/10 text-red-600 dark:text-red-400'
                                                : priceVariation < 0
                                                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                                    : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                                                }`}>
                                                {priceVariation > 0 ? (
                                                    <TrendingUp className="w-3.5 h-3.5 mr-1" />
                                                ) : priceVariation < 0 ? (
                                                    <TrendingDown className="w-3.5 h-3.5 mr-1" />
                                                ) : (
                                                    <div className="w-3.5 h-0.5 bg-current rounded-full mr-1" /> // Línea horizontal representativa
                                                )}
                                                <span>
                                                    {priceVariation > 0 ? '+' : ''}
                                                    {priceVariation !== 0 ? `${priceVariation.toFixed(1)}%` : '0.0%'}
                                                </span>
                                            </div>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p className="max-w-[200px] text-center">Variación respecto a tu costo promedio histórico según el volumen comprado.</p>
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            )}
                        </div>
                    </div>
                </TableCell>
                <TableCell className="text-right tabular-nums font-black text-primary text-lg">
                    {formatCurrency(totalLineAmount)}
                </TableCell>
                <TableCell className="text-center">
                    <ViewDetailButton />
                </TableCell>
            </TableRow>

            {isOpen && sortedGroup.map((child, idx) => (
                <TableRow key={child.id || idx} className="bg-muted/5 hover:bg-muted/10 border-l-2 border-primary/30">
                    <TableCell className="pl-12 text-xs py-3" colSpan={2}>
                        <div className="flex items-center gap-3">
                            <span className="text-foreground font-medium">{formatDate(child.fecha_emision)}</span>
                            <span className="text-muted-foreground opacity-30">|</span>
                            <span className="text-muted-foreground font-mono text-[10px]">{child.numero_documento || '-'}</span>
                            <span className="text-muted-foreground truncate opacity-70 italic max-w-[250px]">- {child.descripcion}</span>
                        </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium text-xs text-muted-foreground">
                        {formatCurrency(child.precio_unitario)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-semibold text-xs text-foreground/80">
                        {formatCurrency(child.importe_linea)}
                    </TableCell>
                    <TableCell />
                </TableRow>
            ))}
        </>
    );
}

export function ProductLinesTable({ lines, providerFiscalId }: ProductLinesTableProps) {
    const totalCantidad = lines.reduce((acc, curr) => acc + (Number(curr.cantidad) || 0), 0);
    const totalImporte = lines.reduce((acc, curr) => acc + (Number(curr.importe_linea) || 0), 0);

    const groupedLines = React.useMemo(() => {
        const map = new Map<string, DocumentLine[]>();
        lines.forEach(line => {
            const key = line.codigo || line.descripcion || 'unknown';
            if (!map.has(key)) map.set(key, []);
            map.get(key)!.push(line);
        });

        return Array.from(map.values()).sort((a, b) => {
            const dateA = a.reduce((max, l) => l.fecha_emision && l.fecha_emision > max ? l.fecha_emision : max, '');
            const dateB = b.reduce((max, l) => l.fecha_emision && l.fecha_emision > max ? l.fecha_emision : max, '');
            return dateB.localeCompare(dateA);
        });
    }, [lines]);

    return (
        <div className="space-y-4 relative w-full">
            {lines.length > 0 && (
                <div className="flex justify-end pt-2 pb-4">
                    <div className="flex gap-6 items-end bg-primary/10 px-6 py-4 rounded-xl border-2 border-primary shadow-lg min-w-[350px] relative overflow-hidden group transition-all">
                        <div className="absolute -left-4 -bottom-4 text-primary/5 group-hover:text-primary/10 transition-colors">
                            <TrendingUp className="w-24 h-24" />
                        </div>
                        <div className="flex flex-col items-end z-10 font-bold">
                            <span className="text-[10px] uppercase tracking-wider text-primary mb-1">Total Unidades</span>
                            <span className="text-2xl font-black text-foreground">{totalCantidad.toLocaleString('es-ES')}</span>
                        </div>
                        <div className="h-10 w-px bg-primary/30 z-10"></div>
                        <div className="flex flex-col items-end z-10 w-[140px]">
                            <span className="text-[10px] uppercase tracking-wider text-primary mb-1">Importe Neto</span>
                            <span className="text-2xl font-black text-primary truncate max-w-full" title={formatCurrency(totalImporte)}>{formatCurrency(totalImporte)}</span>
                        </div>
                    </div>
                </div>
            )}

            <div className="rounded-xl border bg-card overflow-hidden shadow-sm">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-muted/50 border-b">
                            <TableHead className="py-4">Descripción / Producto</TableHead>
                            <TableHead className="text-right">Cantidad Total</TableHead>
                            <TableHead className="text-right">Precio Unitario</TableHead>
                            <TableHead className="text-right font-bold">Importe Total</TableHead>
                            <TableHead className="text-center w-[80px]">Ver</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {groupedLines.map((group, idx) => (
                            <ProductLineGroup key={idx} group={group} providerFiscalId={providerFiscalId} />
                        ))}
                        {lines.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={5} className="h-32 text-center text-muted-foreground italic">
                                    No hay artículos que coincidan con los filtros.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}