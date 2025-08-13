'use client';

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import type { DocumentEntity } from "@/lib/types";
import { Building, ArrowRight } from "lucide-react";
import Link from "next/link";

interface ProviderCardProps {
    provider: DocumentEntity;
}

export function ProviderCard({ provider }: ProviderCardProps) {
    if (!provider.nombre) return null;
    
    return (
        <Link href={`/proveedores/${encodeURIComponent(provider.nombre)}`} className="group">
            <Card className="h-full flex flex-col transition-all group-hover:border-primary group-hover:shadow-lg">
                <CardHeader className="flex-grow">
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
                        Ver detalles y productos del proveedor.
                    </p>
                </CardContent>
            </Card>
        </Link>
    );
}
