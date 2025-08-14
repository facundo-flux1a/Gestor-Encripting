
'use client';

import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import type { ProviderWithStats } from "@/lib/types";
import { Building, ArrowRight, Euro, FileText } from "lucide-react";
import Link from "next/link";

interface ProviderCardProps {
    provider: ProviderWithStats;
}

const formatCurrency = (amount: number | null | undefined) => {
    if (amount === null || amount === undefined) return '0 €';
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0 }).format(amount);
};

export function ProviderCard({ provider }: ProviderCardProps) {
    if (!provider.nombre || !provider.identificador_fiscal) return null;
    
    const providerUrl = `/proveedores/${encodeURIComponent(provider.identificador_fiscal)}`;

    return (
        <Link href={providerUrl} className="group flex">
            <Card className="h-full w-full flex flex-col justify-between transition-all hover:border-primary hover:shadow-lg">
                <div className="flex-grow">
                    <CardHeader>
                        <div className="flex items-start justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <div className="bg-muted rounded-lg p-2">
                                    <Building className="h-6 w-6 text-primary" />
                                </div>
                                <div>
                                    <CardTitle className="text-lg font-bold">
                                        {provider.nombre}
                                    </CardTitle>
                                    <CardDescription className="font-mono">{provider.identificador_fiscal}</CardDescription>
                                </div>
                            </div>
                            <ArrowRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1 flex-shrink-0" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-muted-foreground">
                            Ver análisis, productos y documentos del proveedor.
                        </p>
                    </CardContent>
                </div>
                <CardFooter className="flex justify-between text-sm text-muted-foreground border-t pt-4">
                    <div className="flex items-center gap-2" title="Gasto Total">
                        <Euro className="h-4 w-4" />
                        <span className="font-semibold">{formatCurrency(provider.totalSpent)}</span>
                    </div>
                    <div className="flex items-center gap-2" title="Documentos Totales">
                        <FileText className="h-4 w-4" />
                        <span className="font-semibold">{provider.totalDocuments} docs.</span>
                    </div>
                </CardFooter>
            </Card>
        </Link>
    );
}
