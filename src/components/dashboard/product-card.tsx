'use client';

import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import type { DocumentLine } from "@/lib/types";
import { Euro, Calendar, ArrowRight } from "lucide-react";

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

    const productUrl = `/proveedores/${encodeURIComponent(providerFiscalId)}/${encodeURIComponent(product.codigo || 'null')}`;
    
    return (
        <Link href={productUrl} className="group">
            <Card className="h-full flex flex-col transition-all group-hover:border-primary group-hover:shadow-lg">
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
                    <div className="flex justify-end pt-1 sm:pt-2">
                        <ArrowRight className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground transition-transform group-hover:translate-x-1" />
                    </div>
                </CardContent>
            </Card>
        </Link>
    );
}