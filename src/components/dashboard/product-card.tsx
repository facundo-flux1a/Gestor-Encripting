'use client';

import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import type { DocumentLine } from "@/lib/types";
import { Euro, Calendar, ArrowRight, Package, ShoppingCart } from "lucide-react";

interface ProductCardProps {
    product: DocumentLine;
    providerFiscalId: string;
}

const formatCurrency = (amount: number | string | null | undefined, currency: string = 'EUR') => {
    if (amount === null || amount === undefined) return 'N/A';

    let numericAmount: number;
    if (typeof amount === 'string') {
        numericAmount = parseFloat(amount);
    } else {
        numericAmount = amount;
    }

    if (isNaN(numericAmount)) return 'N/A';

    return new Intl.NumberFormat('es-ES', {
        style: 'currency',
        currency,
    }).format(numericAmount);
};

const formatDate = (date: string | null | undefined) => {
    if (!date) return 'N/A';
    try {
        const d = new Date(date);
        const utcDate = new Date(d.valueOf() + d.getTimezoneOffset() * 60 * 1000);
        return new Intl.DateTimeFormat('es-ES', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        }).format(utcDate);
    } catch {
        return 'Fecha inválida';
    }
};

export function ProductCard({ product, providerFiscalId }: ProductCardProps) {
    if (!product.descripcion) return null;

    const identifier = product.codigo
        ? encodeURIComponent(product.codigo)
        : `DESC_${encodeURIComponent(product.descripcion || '')}`;

    const productUrl = `/proveedores/${encodeURIComponent(providerFiscalId)}/${identifier}`;

    const vecesComprado = product.veces_comprado ? Number(product.veces_comprado) : 1;
    const isFolder = vecesComprado > 1;

    return (
        <Link href={productUrl} className="group relative block w-full outline-none mt-3">
            {isFolder && (
                <div className="absolute -top-[17px] left-0 w-max px-3 pb-[1px] h-[18px] flex items-end justify-center bg-card border border-b-0 border-border rounded-t-md transition-all duration-300 group-hover:border-primary z-0">
                    <span className="text-[10px] font-bold text-muted-foreground group-hover:text-primary transition-colors flex items-center gap-1.5 leading-none">
                        <ShoppingCart className="w-[10px] h-[10px]" />
                        x{vecesComprado}
                    </span>
                    {/* Parche visual para simular union Seamless de carpeta */}
                    <div className="absolute -bottom-[2px] left-[1px] right-[1px] h-[4px] bg-card z-10"></div>
                </div>
            )}
            <Card className={`h-full flex flex-col transition-all duration-300 group-hover:border-primary group-hover:shadow-lg bg-card relative z-10 ${isFolder ? 'rounded-tl-none' : ''}`}>
                <CardHeader className="flex-grow pb-2 px-3 sm:px-6 py-3 sm:py-6">
                    <CardDescription className="font-mono text-[10px] sm:text-xs break-all">
                        {product.codigo}
                    </CardDescription>
                    <CardTitle className="text-sm sm:text-base font-bold leading-tight break-words">
                        {product.descripcion}
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 sm:space-y-3 px-3 sm:px-6 pb-3 sm:pb-6">
                    <div className="flex items-center justify-between text-xs sm:text-sm text-primary font-semibold border-t pt-2 sm:pt-3">
                        <div className="flex items-center gap-1.5 sm:gap-2">
                            <Euro className="h-3 w-3 sm:h-4 sm:w-4 shrink-0" />
                            <span>Precio Unitario</span>
                        </div>
                        <span className="tabular-nums">
                            {formatCurrency(product.precio_unitario)}
                        </span>
                    </div>
                    <div className="flex items-center justify-between text-xs sm:text-sm text-muted-foreground">
                        <div className="flex items-center gap-1.5 sm:gap-2">
                            <Calendar className="h-3 w-3 sm:h-4 sm:w-4 shrink-0" />
                            <span>Última Compra</span>
                        </div>
                        <span className="tabular-nums">
                            {formatDate(product.fecha_emision)}
                        </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] sm:text-sm text-muted-foreground mt-1">
                        <div className="flex items-center gap-1.5 sm:gap-2">
                            <Package className="h-3 w-3 sm:h-4 sm:w-4 shrink-0" />
                            <span>Unidades Totales</span>
                        </div>
                        <span className="tabular-nums font-medium">
                            {product.total_cantidad_comprada ? Number(product.total_cantidad_comprada).toLocaleString('es-ES') : 0}
                        </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] sm:text-sm text-muted-foreground mt-1">
                        <div className="flex items-center gap-1.5 sm:gap-2">
                            <ShoppingCart className="h-3 w-3 sm:h-4 sm:w-4 shrink-0" />
                            <span>Veces Comprado</span>
                        </div>
                        <span className="tabular-nums font-medium">
                            {product.veces_comprado ? Number(product.veces_comprado).toLocaleString('es-ES') : 0}
                        </span>
                    </div>

                    <div className="flex justify-end pt-2 sm:pt-3 border-t mt-2">
                        <ArrowRight className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground transition-transform group-hover:translate-x-1" />
                    </div>
                </CardContent>
            </Card>
        </Link>
    );
}