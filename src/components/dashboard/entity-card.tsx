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
            <CardHeader className="px-3 sm:px-6 py-3 sm:py-6">
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                    {title.toLowerCase().includes('cliente') || title.toLowerCase().includes('receptor') ? (
                        <User className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
                    ) : (
                        <Building className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
                    )}
                    <span className="truncate" title={title}>
                        {title}
                    </span>
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 sm:space-y-3 text-xs sm:text-sm px-3 sm:px-6 pb-3 sm:pb-6">
                <p className="font-semibold text-sm sm:text-base break-words">
                    {entity.nombre}
                </p>
                <div className="space-y-1 sm:space-y-1.5 text-muted-foreground">
                    {entity.identificador_fiscal && (
                        <p className="font-mono text-xs sm:text-sm break-all">
                            <Link 
                                href={`/proveedores/${encodeURIComponent(entity.identificador_fiscal)}`} 
                                className="hover:underline hover:text-primary transition-colors"
                            >
                                {entity.identificador_fiscal}
                            </Link>
                        </p>
                    )}
                    {entity.direccion && (
                        <p className="break-words text-xs sm:text-sm">
                            {entity.direccion}
                        </p>
                    )}
                    {entity.telefono && (
                        <p className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm">
                            <Phone className="h-3 w-3 sm:h-4 sm:w-4 shrink-0" /> 
                            <span className="break-all">{entity.telefono}</span>
                        </p>
                    )}
                    {entity.email && (
                        <p className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm">
                            <Mail className="h-3 w-3 sm:h-4 sm:w-4 shrink-0" /> 
                            <a 
                                href={`mailto:${entity.email}`} 
                                className="hover:underline transition-colors break-all"
                            >
                                {entity.email}
                            </a>
                        </p>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}