
'use client';

import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import type { DocumentEntity } from "@/lib/types";
import { Building, ArrowRight, BarChart3 } from "lucide-react";
import Link from "next/link";
import { Button } from "../ui/button";

interface ProviderCardProps {
    provider: DocumentEntity;
}

export function ProviderCard({ provider }: ProviderCardProps) {
    if (!provider.nombre || !provider.identificador_fiscal) return null;
    
    const providerUrl = `/proveedores/${encodeURIComponent(provider.identificador_fiscal)}`;
    const analyticsUrl = `${providerUrl}/analitica`;

    return (
        <Card className="h-full flex flex-col justify-between transition-all hover:border-primary hover:shadow-lg">
            <Link href={providerUrl} className="group flex-grow">
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
                        Ver documentos y productos del proveedor.
                    </p>
                </CardContent>
            </Link>
            <CardFooter className="pt-4 border-t">
                <Button variant="outline" size="sm" className="w-full" asChild>
                    <Link href={analyticsUrl}>
                        <BarChart3 className="mr-2 h-4 w-4" />
                        Ver Analítica
                    </Link>
                </Button>
            </CardFooter>
        </Card>
    );
}
