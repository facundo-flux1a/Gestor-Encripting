
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
                        <FormLabel className="text-xs text-muted-foreground">{label}</FormLabel>
                        <FormControl>
                            {isTextarea ? (
                                <Textarea 
                                    {...field}
                                    value={field.value ?? ''} 
                                    className="text-sm h-20"
                                />
                            ) : (
                                <Input 
                                    {...field}
                                    value={field.value ?? ''} 
                                    className="h-8 text-sm"
                                />
                            )}
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )}
            />
        );
    };

    const capitalizedRole = entity.rol.charAt(0).toUpperCase() + entity.rol.slice(1);

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-4">
                <CardTitle className="flex items-center gap-2 text-lg">
                    {entity.rol.toLowerCase().includes('cliente') || entity.rol.toLowerCase().includes('receptor') ? <User className="h-5 w-5" /> : <Building className="h-5 w-5" />}
                    {isEditing ? renderEditableField('rol', 'Rol') : capitalizedRole}
                </CardTitle>
                 {isEditing && (
                    <Button type="button" variant="ghost" size="icon" onClick={removeEntity}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                )}
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
                {isEditing ? (
                    <div className="space-y-4">
                        {renderEditableField('nombre', 'Nombre')}
                        {renderEditableField('identificador_fiscal', 'Identificador Fiscal')}
                        {renderEditableField('direccion', 'Dirección', true)}
                        {renderEditableField('telefono', 'Teléfono')}
                        {renderEditableField('email', 'Email')}
                    </div>
                ) : (
                    <>
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
                    </>
                )}
            </CardContent>
        </Card>
    );
}
