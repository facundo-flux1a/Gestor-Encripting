
'use client';

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type DocumentEntity } from "@/lib/types";
import { Building, Phone, Mail, User } from "lucide-react";
import Link from 'next/link';

interface EntityCardProps {
    entity: DocumentEntity;
    title: string;
}

export function EntityCard({ entity, title }: EntityCardProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    {title.toLowerCase().includes('cliente') ? <User className="h-5 w-5" /> : <Building className="h-5 w-5" />}
                    {title}
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
                <p className="font-semibold text-base">{entity.nombre}</p>
                <div className="space-y-1 text-muted-foreground">
                    {entity.identificador_fiscal && (
                        <p className="font-mono">
                            <Link 
                                href={`/proveedores/${encodeURIComponent(entity.identificador_fiscal)}`} 
                                className="hover:underline hover:text-primary"
                            >
                                {entity.identificador_fiscal}
                            </Link>
                        </p>
                    )}
                    <p>{entity.direccion}</p>
                    {entity.telefono && (
                        <p className="flex items-center gap-2">
                            <Phone className="h-4 w-4" /> {entity.telefono}
                        </p>
                    )}
                    {entity.email && (
                         <p className="flex items-center gap-2">
                            <Mail className="h-4 w-4" /> 
                            <a href={`mailto:${entity.email}`} className="hover:underline">{entity.email}</a>
                        </p>
                    )}
                </div>
            </CardContent>
        </Card>
    )
}
