
'use client';

import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import type { DocumentLine } from "@/lib/types";
import { Euro, Calendar, ArrowRight } from "lucide-react";

interface ProductCardProps {
    product: DocumentLine;
    providerId: string;
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
        // Ensure date is treated as UTC to avoid timezone shifts
        const utcDate = new Date(d.valueOf() + d.getTimezoneOffset() * 60 * 1000);
        return new Intl.DateTimeFormat('es-ES', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        }).format(utcDate);
    } catch {
        return 'Fecha inválida';
    }
}


export function ProductCard({ product, providerId }: ProductCardProps) {
    if (!product.descripcion) return null;

    const productUrl = `/proveedores/${encodeURIComponent(providerId)}/${encodeURIComponent(product.codigo || 'null')}`;
    
    return (
        <Link href={productUrl} className="group">
            <Card className="h-full flex flex-col transition-all group-hover:border-primary group-hover:shadow-lg">
                <CardHeader className="flex-grow pb-2">
                    <CardDescription className="font-mono text-xs">{product.codigo}</CardDescription>
                    <CardTitle className="text-base font-bold leading-tight">
                        {product.descripcion}
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="flex items-center justify-between text-sm text-primary font-semibold border-t pt-3">
                        <div className="flex items-center gap-2">
                            <Euro className="h-4 w-4" />
                            <span>Precio Unitario</span>
                        </div>
                        <span>{formatCurrency(product.precio_unitario)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4" />
                             <span>Última Compra</span>
                        </div>
                        <span>{formatDate(product.fecha_emision)}</span>
                    </div>
                    <div className="flex justify-end pt-2">
                        <ArrowRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1" />
                    </div>
                </CardContent>
            </Card>
        </Link>
    );
}
