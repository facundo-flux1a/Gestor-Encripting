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
            <Card className="h-full transition-all group-hover:border-primary group-hover:shadow-lg">
                <CardHeader>
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <CardTitle className="flex items-center gap-2 text-xl">
                                <Building className="h-5 w-5 text-primary" />
                                {provider.nombre}
                            </CardTitle>
                            <CardDescription>{provider.identificador_fiscal}</CardDescription>
                        </div>
                        <ArrowRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1" />
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
