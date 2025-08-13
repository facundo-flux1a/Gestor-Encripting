'use client';

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { DocumentEntity } from "@/lib/types";
import { Building, ArrowRight } from "lucide-react";
import Link from "next/link";

interface ProviderCardProps {
    provider: DocumentEntity;
}

export function ProviderCard({ provider }: ProviderCardProps) {
    return (
        <Card>
            <CardHeader>
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <CardTitle className="flex items-center gap-2 text-xl">
                            <Building className="h-5 w-5 text-primary" />
                            {provider.nombre}
                        </CardTitle>
                        <CardDescription>{provider.identificador_fiscal}</CardDescription>
                    </div>
                    {/* <Link href={`/proveedores/${provider.nombre}`} passHref>
                        <Button variant="outline" size="icon">
                            <ArrowRight className="h-4 w-4" />
                        </Button>
                    </Link> */}
                </div>
            </CardHeader>
            <CardContent>
                <p className="text-sm text-muted-foreground">
                    Aquí se mostrará un resumen de los productos o un enlace para ver más detalles.
                </p>
            </CardContent>
        </Card>
    );
}
