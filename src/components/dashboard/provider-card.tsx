
'use client';

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import type { DocumentEntity } from "@/lib/types";
import { Building, ArrowRight } from "lucide-react";
import Link from "next/link";

interface ProviderCardProps {
    provider: DocumentEntity;
}

export function ProviderCard({ provider }: ProviderCardProps) {
    if (!provider.nombre || !provider.identificador_fiscal) return null;
    
    const providerUrl = `/proveedores/${encodeURIComponent(provider.identificador_fiscal)}`;

    return (
        <Link href={providerUrl} className="group">
            <Card className="h-full flex flex-col justify-between transition-all hover:border-primary hover:shadow-lg">
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
            </Card>
        </Link>
    );
}
