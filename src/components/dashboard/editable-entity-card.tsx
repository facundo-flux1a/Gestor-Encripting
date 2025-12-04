'use client';

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type DocumentUpdatePayload } from "@/lib/types";
import { Building, Phone, Mail, User, Trash2 } from "lucide-react";
import Link from 'next/link';
import { useWatch, type UseFormReturn } from "react-hook-form";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from "../ui/form";
import { Textarea } from "../ui/textarea";

interface EditableEntityCardProps {
    isEditing: boolean;
    form: UseFormReturn<DocumentUpdatePayload>;
    entityIndex: number;
    removeEntity: () => void;
}

export function EditableEntityCard({ isEditing, form, entityIndex, removeEntity }: EditableEntityCardProps) {
    const entity = useWatch({
        control: form.control,
        name: `entidades.${entityIndex}`
    });

    const renderEditableField = (fieldName: keyof typeof entity, label: string, isTextarea: boolean = false) => {
        return (
            <FormField
                control={form.control}
                name={`entidades.${entityIndex}.${fieldName}`}
                render={({ field }) => (
                    <FormItem>
                        <FormLabel className="text-xs sm:text-sm text-muted-foreground">
                            {label}
                        </FormLabel>
                        <FormControl>
                            {isTextarea ? (
                                <Textarea 
                                    {...field}
                                    value={field.value ?? ''} 
                                    className="text-xs sm:text-sm min-h-[60px] sm:min-h-[80px]"
                                />
                            ) : (
                                <Input 
                                    {...field}
                                    value={field.value ?? ''} 
                                    className="h-8 sm:h-9 text-xs sm:text-sm"
                                />
                            )}
                        </FormControl>
                        <FormMessage className="text-xs" />
                    </FormItem>
                )}
            />
        );
    };

    const capitalizedRole = entity.rol.charAt(0).toUpperCase() + entity.rol.slice(1);

    return (
        <Card>
            <CardHeader className="flex flex-row items-start sm:items-center justify-between pb-3 sm:pb-4 px-3 sm:px-6 py-3 sm:py-6">
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                    {entity.rol.toLowerCase().includes('cliente') || entity.rol.toLowerCase().includes('receptor') ? (
                        <User className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
                    ) : (
                        <Building className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
                    )}
                    {isEditing ? (
                        <div className="flex-1 min-w-0">
                            {renderEditableField('rol', 'Rol')}
                        </div>
                    ) : (
                        <span className="truncate" title={capitalizedRole}>
                            {capitalizedRole}
                        </span>
                    )}
                </CardTitle>
                {isEditing && (
                    <Button 
                        type="button" 
                        variant="ghost" 
                        size="icon" 
                        onClick={removeEntity}
                        className="h-8 w-8 sm:h-9 sm:w-9 shrink-0"
                    >
                        <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-destructive" />
                    </Button>
                )}
            </CardHeader>
            <CardContent className="space-y-3 text-xs sm:text-sm px-3 sm:px-6 pb-3 sm:pb-6">
                {isEditing ? (
                    <div className="space-y-3 sm:space-y-4">
                        {renderEditableField('nombre', 'Nombre')}
                        {renderEditableField('identificador_fiscal', 'Identificador Fiscal')}
                        {renderEditableField('direccion', 'Dirección', true)}
                        {renderEditableField('telefono', 'Teléfono')}
                        {renderEditableField('email', 'Email')}
                    </div>
                ) : (
                    <>
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
                    </>
                )}
            </CardContent>
        </Card>
    );
}