
'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { IvaBadge } from "@/components/dashboard/iva-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertCircle, CheckCircle2, User, Building, Phone, Mail, FileText, Info, Trash2, PlusCircle, FileUp, Box, ChevronsRight, Tag, Percent, ArrowRight, Search, ChevronLeft, ChevronRight, Euro } from "lucide-react";
import { format } from 'date-fns';
import { type Document, type IvaDetail, type DocumentLine, type DocumentUpdatePayload } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import type { UseFormReturn } from "react-hook-form";
import { useFieldArray, useWatch } from "react-hook-form";
import { cn } from "@/lib/utils";
import React, { useMemo, useState, useEffect } from "react";
import { Separator } from "@/components/ui/separator";

const formatCurrency = (amount: number | string | null | undefined, currency: string = 'EUR') => {
    if (amount === null || amount === undefined) return 'N/A';
    
    let numericAmount: number;
    if (typeof amount === 'string') {
        numericAmount = parseFloat(amount);
    } else {
        numericAmount = amount;
    }
    
    if (isNaN(numericAmount)) return 'N/A';
    
    return new Intl.NumberFormat('es-ES', {
        style: 'currency',
        currency,
    }).format(numericAmount);
};

const formatDate = (date: string | null | undefined) => {
    if (!date) return 'N/A';
    try {
        const d = new Date(date);
        // Ensure date is treated as UTC to avoid timezone shifts
        const utcDate = new Date(d.valueOf() + d.getTimezoneOffset() * 60 * 1000);
        return format(utcDate, 'dd/MM/yyyy');
    } catch {
        return 'Fecha inválida';
    }
}

const formatDateForInput = (date: string | null | undefined): string => {
    if (!date) return '';
    try {
        const d = new Date(date);
        return d.toISOString().split('T')[0];
    } catch {
        return '';
    }
}

interface DocumentViewProps {
    doc: Document;
    isEditing: boolean;
    form: UseFormReturn<DocumentUpdatePayload>;
}

const ITEMS_PER_PAGE = 5;

export function DocumentView({ doc, isEditing, form }: DocumentViewProps) {
    const { fields: entidadFields, append: appendEntidad, remove: removeEntidad } = useFieldArray({ 
        control: form.control, 
        name: "entidades" 
    });
    
    const { fields: lineaFields, append: appendLinea, remove: removeLinea } = useFieldArray({ 
        control: form.control, 
        name: "lineas" 
    });
    
    const { fields: ivaFields, append: appendIva, remove: removeIva } = useFieldArray({ 
        control: form.control, 
        name: "iva_details" 
    });

    const formValues = useWatch({ control: form.control });
    const [lineaSearchTerm, setLineaSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);

    // Inicializar los arrays cuando cambie el documento o se inicie la edición
    useEffect(() => {
        if (isEditing) {
            // Solo resetear si los arrays están vacíos o si el documento cambió
            if (entidadFields.length === 0 && doc.entidades?.length > 0) {
                doc.entidades.forEach(entidad => appendEntidad(entidad));
            }
            if (lineaFields.length === 0 && doc.lineas?.length > 0) {
                doc.lineas.forEach(linea => appendLinea(linea));
            }
            if (ivaFields.length === 0 && doc.iva_details?.length > 0) {
                doc.iva_details.forEach(iva => appendIva(iva));
            }
        }
    }, [isEditing, doc.id_documento]); // Dependencia en doc.id_documento para detectar cambio de documento

    const filteredLineaFields = useMemo(() => {
        if (!lineaSearchTerm) {
            return lineaFields.map((field, index) => ({ field, originalIndex: index }));
        }
        const lowercasedFilter = lineaSearchTerm.toLowerCase();
        return lineaFields
            .map((field, index) => ({ field, originalIndex: index }))
            .filter(({ field }) => {
                return Object.values(field).some(value => {
                    if (value === null || value === undefined) {
                        return false;
                    }
                    if (typeof value === 'string' || typeof value === 'number') {
                        return String(value).toLowerCase().includes(lowercasedFilter);
                    }
                    return false;
                });
            });
    }, [lineaFields, lineaSearchTerm]);

    const totalPages = Math.ceil(filteredLineaFields.length / ITEMS_PER_PAGE);

    const paginatedLineaFields = useMemo(() => {
        return filteredLineaFields.slice(
            (currentPage - 1) * ITEMS_PER_PAGE,
            currentPage * ITEMS_PER_PAGE
        );
    }, [filteredLineaFields, currentPage]);
    
    React.useEffect(() => {
        setCurrentPage(1);
    }, [lineaSearchTerm]);

    const renderEditableField = (fieldName: string, label: string, isCurrency: boolean = false, placeholder?: string) => {
        return (
            <FormField
                control={form.control}
                name={fieldName as keyof DocumentUpdatePayload}
                render={({ field }) => (
                    <FormItem>
                        <FormLabel className="text-muted-foreground text-xs">{label}</FormLabel>
                        <FormControl>
                            {isEditing ? (
                                <Input 
                                    {...field}
                                    type={isCurrency ? 'number' : 'text'} 
                                    step={isCurrency ? '0.01' : undefined}
                                    className="h-8 text-sm"
                                    placeholder={placeholder}
                                    value={field.value ?? ''}
                                    onChange={e => {
                                        const value = e.target.value;
                                        if (isCurrency) {
                                            field.onChange(value === '' ? 0 : parseFloat(value));
                                        } else {
                                            field.onChange(value === '' ? null : value);
                                        }
                                    }}
                                />
                            ) : (
                                <p className="text-sm font-medium">
                                    {isCurrency 
                                        ? formatCurrency(field.value ?? doc[fieldName as keyof Document], doc.moneda) 
                                        : (field.value ?? doc[fieldName as keyof Document] ?? 'N/A')
                                    }
                                </p>
                            )}
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )}
            />
        )
    }

    const renderEditableDate = (fieldName: string, label: string) => {
        return (
            <FormField
                control={form.control}
                name={fieldName as keyof DocumentUpdatePayload}
                render={({ field }) => (
                    <FormItem>
                        <FormLabel className="text-muted-foreground text-xs">{label}</FormLabel>
                        <FormControl>
                            {isEditing ? (
                                <Input 
                                    type="date" 
                                    className="h-8 text-sm"
                                    value={formatDateForInput(field.value ?? doc[fieldName as keyof Document])}
                                    onChange={e => field.onChange(e.target.value || null)}
                                />
                            ) : (
                                <p className="text-sm font-medium">
                                    {formatDate(field.value ?? doc[fieldName as keyof Document])}
                                </p>
                            )}
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )}
            />
        )
    }

    // Función para obtener el valor actual (del form o del documento original)
    const getCurrentValue = (fieldName: string) => {
        return formValues[fieldName as keyof DocumentUpdatePayload] ?? doc[fieldName as keyof Document];
    };

    return (
        <>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-8">
                    {/* General Information Card */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Info className="h-5 w-5" /> Información General
                            </CardTitle>
                             <FormField
                                control={form.control}
                                name="tipo_documento"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormControl>
                                            {isEditing ? (
                                                <Select 
                                                    onValueChange={field.onChange} 
                                                    value={field.value ?? doc.tipo_documento}
                                                >
                                                    <SelectTrigger><SelectValue placeholder="Tipo de Documento" /></SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="Factura">Factura</SelectItem>
                                                        <SelectItem value="Informe">Informe</SelectItem>
                                                        <SelectItem value="Contrato">Contrato</SelectItem>
                                                        <SelectItem value="Otro">Otro</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            ) : (
                                                <CardDescription>
                                                    {field.value ?? doc.tipo_documento}
                                                </CardDescription>
                                            )}
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </CardHeader>
                        <CardContent>
                            <div className="grid md:grid-cols-3 gap-6 text-sm">
                                {renderEditableField("numero_factura", "Nº Documento")}
                                {renderEditableDate("fecha_emision", "Fecha Emisión")}
                                {renderEditableDate("fecha_vencimiento", "Fecha Vencimiento")}
                                
                                <FormField
                                    control={form.control}
                                    name="fecha_creacion"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-muted-foreground text-xs">Fecha Creación</FormLabel>
                                            <FormControl>
                                                <p className="text-sm font-medium">{formatDate(doc.fecha_creacion)}</p>
                                            </FormControl>
                                        </FormItem>
                                    )}
                                />
                                
                                {renderEditableField("moneda", "Moneda")}
                                
                                <FormField
                                    control={form.control}
                                    name="incidencia"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-muted-foreground text-xs">Estado</FormLabel>
                                            <FormControl>
                                                {isEditing ? (
                                                    <div className="flex items-center space-x-2 pt-2">
                                                        <Checkbox 
                                                            checked={field.value ?? doc.incidencia} 
                                                            onCheckedChange={field.onChange} 
                                                            id="incidencia-check"
                                                        />
                                                        <label 
                                                            htmlFor="incidencia-check" 
                                                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                                        >
                                                            Con Incidencia
                                                        </label>
                                                    </div>
                                                ) : (
                                                    (field.value ?? doc.incidencia) ? (
                                                        <Badge variant="destructive" className="flex items-center gap-2">
                                                            <AlertCircle className="h-4 w-4" /> Con Incidencia
                                                        </Badge>
                                                    ) : (
                                                        <Badge variant="secondary" className="flex items-center gap-2">
                                                            <CheckCircle2 className="h-4 w-4" /> Verificado
                                                        </Badge>
                                                    )
                                                )}
                                            </FormControl>
                                        </FormItem>
                                    )}
                                />
                            </div>
                        </CardContent>
                    </Card>

                    {/* Document Lines Card */}
                     <Card>
                        <CardHeader className="flex-row items-center justify-between">
                           <div className="flex items-center gap-2">
                                <FileText className="h-5 w-5" />
                                <CardTitle>Líneas del Documento</CardTitle>
                           </div>
                           <div className="flex items-center gap-2">
                                <div className="relative">
                                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input 
                                        placeholder="Buscar líneas..."
                                        value={lineaSearchTerm}
                                        onChange={(e) => setLineaSearchTerm(e.target.value)}
                                        className="h-9 pl-8 w-40 lg:w-56"
                                    />
                                </div>
                                {isEditing && (
                                    <Button 
                                        type="button" 
                                        size="sm" 
                                        variant="outline" 
                                        onClick={() => appendLinea({ 
                                            codigo: '', 
                                            descripcion: '', 
                                            cantidad: 1, 
                                            unidad: 'unidad', 
                                            precio_unitario: 0, 
                                            descuento_porcentaje: 0, 
                                            precio_neto: 0, 
                                            importe_linea: 0, 
                                            datos_extra: null 
                                        })}
                                    >
                                        <PlusCircle className="mr-2 h-4 w-4" /> Añadir
                                    </Button>
                                )}
                           </div>
                        </CardHeader>
                        <CardContent>
                             <div className="space-y-4">
                                {paginatedLineaFields.map(({ field, originalIndex }) => {
                                    const currentLinea = formValues.lineas?.[originalIndex] || field;
                                    return (
                                        <div key={field.id} className={cn(
                                            "p-4 rounded-lg",
                                            isEditing ? "bg-muted/30 border" : "border-b last:border-b-0"
                                        )}>
                                            {isEditing ? (
                                                // EDITING VIEW
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    <FormField control={form.control} name={`lineas.${originalIndex}.descripcion`} render={({field}) => (
                                                        <FormItem className="md:col-span-2">
                                                            <FormLabel>Descripción</FormLabel>
                                                            <FormControl>
                                                                <Textarea 
                                                                    {...field} 
                                                                    value={field.value ?? ''} 
                                                                    placeholder="Descripción del producto o servicio" 
                                                                />
                                                            </FormControl>
                                                        </FormItem>
                                                    )} />
                                                    <FormField control={form.control} name={`lineas.${originalIndex}.codigo`} render={({field}) => (
                                                        <FormItem>
                                                            <FormLabel>Código</FormLabel>
                                                            <FormControl>
                                                                <Input 
                                                                    {...field} 
                                                                    value={field.value ?? ''} 
                                                                    placeholder="SKU-123" 
                                                                />
                                                            </FormControl>
                                                        </FormItem>
                                                    )} />
                                                    <FormField control={form.control} name={`lineas.${originalIndex}.cantidad`} render={({field}) => (
                                                        <FormItem>
                                                            <FormLabel>Cantidad</FormLabel>
                                                            <FormControl>
                                                                <Input 
                                                                    type="number" 
                                                                    step="0.01"
                                                                    {...field} 
                                                                    value={field.value ?? 0} 
                                                                    onChange={e => field.onChange(parseFloat(e.target.value) || 0)} 
                                                                />
                                                            </FormControl>
                                                        </FormItem>
                                                    )} />
                                                     <FormField control={form.control} name={`lineas.${originalIndex}.precio_unitario`} render={({field}) => (
                                                        <FormItem>
                                                            <FormLabel>P. Unitario</FormLabel>
                                                            <FormControl>
                                                                <Input 
                                                                    type="number" 
                                                                    step="0.01"
                                                                    {...field} 
                                                                    value={field.value ?? 0} 
                                                                    onChange={e => field.onChange(parseFloat(e.target.value) || 0)} 
                                                                />
                                                            </FormControl>
                                                        </FormItem>
                                                    )} />
                                                     <FormField control={form.control} name={`lineas.${originalIndex}.descuento_porcentaje`} render={({field}) => (
                                                        <FormItem>
                                                            <FormLabel>Dto. %</FormLabel>
                                                            <FormControl>
                                                                <Input 
                                                                    type="number" 
                                                                    step="0.01"
                                                                    {...field} 
                                                                    value={field.value ?? 0} 
                                                                    onChange={e => field.onChange(parseFloat(e.target.value) || 0)} 
                                                                />
                                                            </FormControl>
                                                        </FormItem>
                                                    )} />
                                                    <FormField control={form.control} name={`lineas.${originalIndex}.importe_linea`} render={({field}) => (
                                                        <FormItem>
                                                            <FormLabel>Importe</FormLabel>
                                                            <FormControl>
                                                                <Input 
                                                                    type="number" 
                                                                    step="0.01"
                                                                    {...field} 
                                                                    value={field.value ?? 0} 
                                                                    onChange={e => field.onChange(parseFloat(e.target.value) || 0)} 
                                                                    className="font-bold" 
                                                                />
                                                            </FormControl>
                                                        </FormItem>
                                                    )} />
                                                    <div className="flex justify-end md:col-span-2">
                                                        <Button 
                                                            type="button" 
                                                            variant="ghost" 
                                                            size="icon" 
                                                            onClick={() => removeLinea(originalIndex)}
                                                        >
                                                            <Trash2 className="h-4 w-4 text-destructive"/>
                                                        </Button>
                                                    </div>
                                                </div>
                                            ) : (
                                                // READ-ONLY VIEW
                                                <div className="flex flex-col md:flex-row md:items-start gap-4">
                                                    <Box className="h-8 w-8 text-primary flex-shrink-0 mt-1 hidden md:block" />
                                                    <div className="flex-grow">
                                                        <p className="font-semibold text-base">{currentLinea.descripcion}</p>
                                                        <p className="text-sm text-muted-foreground font-mono">{currentLinea.codigo}</p>
                                                        <div className="flex items-center gap-4 mt-2 text-sm">
                                                            <Badge variant="secondary">Cant: {currentLinea.cantidad}</Badge>
                                                            <Badge variant="outline" className="text-destructive border-destructive/50">Dto: {currentLinea.descuento_porcentaje || 0}%</Badge>
                                                        </div>
                                                    </div>
                                                    <div className="flex-shrink-0 text-right">
                                                         <p className="font-bold text-lg text-primary">{formatCurrency(currentLinea.importe_linea, doc.moneda)}</p>
                                                         <p className="text-sm text-muted-foreground">{formatCurrency(currentLinea.precio_unitario, doc.moneda)} / {currentLinea.unidad}</p>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}

                                {filteredLineaFields.length === 0 && (
                                    <div className="text-center text-muted-foreground py-8">
                                        <Search className="mx-auto h-12 w-12 text-gray-400" />
                                        <h3 className="mt-2 text-sm font-medium">No se encontraron líneas</h3>
                                        <p className="mt-1 text-sm text-gray-500">
                                            {lineaSearchTerm ? "Prueba con otro término de búsqueda." : "No hay líneas de documento."}
                                        </p>
                                    </div>
                                )}
                            </div>
                             {totalPages > 1 && (
                                <div className="flex items-center justify-end space-x-2 pt-4">
                                    <span className="text-sm text-muted-foreground">
                                        Página {currentPage} de {totalPages}
                                    </span>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                        disabled={currentPage === 1}
                                    >
                                        <ChevronLeft className="h-4 w-4" />
                                        Anterior
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                        disabled={currentPage === totalPages}
                                    >
                                        Siguiente
                                        <ChevronRight className="h-4 w-4" />
                                    </Button>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                <div className="space-y-8">
                    {/* Entities Card */}
                    {(isEditing ? entidadFields : doc.entidades || []).map((entidad, index) => {
                        const currentEntidad = isEditing 
                            ? (formValues.entidades?.[index] || entidad)
                            : entidad;
                        
                        return (
                            <Card key={isEditing ? entidad.id : `entity-${index}`}>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2 text-xl">
                                        {(currentEntidad as any).rol?.toLowerCase().includes('proveedor') || 
                                         (currentEntidad as any).rol?.toLowerCase().includes('emisor') ? 
                                            <Building className="h-5 w-5" /> : 
                                            <User className="h-5 w-5" />
                                        }
                                        {isEditing ? (
                                            <FormField 
                                                control={form.control} 
                                                name={`entidades.${index}.rol`} 
                                                render={({field}) => (
                                                    <Input 
                                                        {...field} 
                                                        value={field.value ?? ''} 
                                                        className="h-8"
                                                        placeholder="Rol de la entidad"
                                                    />
                                                )} 
                                            />
                                        ) : (
                                            <span>{(currentEntidad as any).rol}</span>
                                        )}
                                        {isEditing && (
                                            <Button 
                                                type="button" 
                                                variant="ghost" 
                                                size="icon" 
                                                onClick={() => removeEntidad(index)}
                                                className="ml-auto"
                                            >
                                                <Trash2 className="h-4 w-4 text-destructive"/>
                                            </Button>
                                        )}
                                    </CardTitle>
                                    {isEditing ? (
                                        <FormField 
                                            control={form.control} 
                                            name={`entidades.${index}.nombre`} 
                                            render={({field}) => (
                                                <Input 
                                                    {...field} 
                                                    value={field.value ?? ''} 
                                                    className="h-8"
                                                    placeholder="Nombre de la entidad"
                                                />
                                            )} 
                                        />
                                    ) : (
                                        <CardDescription>{(currentEntidad as any).nombre}</CardDescription>
                                    )}
                                </CardHeader>
                                <CardContent className="text-sm space-y-3">
                                    <div className="flex items-center gap-3">
                                        <FileText className="text-muted-foreground w-4 h-4" /> 
                                        <span className="font-medium">ID Fiscal:</span>
                                        {isEditing ? (
                                            <FormField 
                                                control={form.control} 
                                                name={`entidades.${index}.identificador_fiscal`} 
                                                render={({field}) => (
                                                    <Input 
                                                        {...field} 
                                                        value={field.value ?? ''} 
                                                        className="h-8 flex-1"
                                                        placeholder="NIF/CIF"
                                                    />
                                                )} 
                                            />
                                        ) : (
                                            <span>{(currentEntidad as any).identificador_fiscal}</span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <Mail className="text-muted-foreground w-4 h-4" /> 
                                        <span className="font-medium">Email:</span>
                                        {isEditing ? (
                                            <FormField 
                                                control={form.control} 
                                                name={`entidades.${index}.email`} 
                                                render={({field}) => (
                                                    <Input 
                                                        type="email" 
                                                        {...field} 
                                                        value={field.value ?? ''} 
                                                        className="h-8 flex-1"
                                                        placeholder="email@ejemplo.com"
                                                    />
                                                )} 
                                            />
                                        ) : (
                                            <span>{(currentEntidad as any).email || 'N/A'}</span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <Phone className="text-muted-foreground w-4 h-4" /> 
                                        <span className="font-medium">Teléfono:</span>
                                        {isEditing ? (
                                            <FormField 
                                                control={form.control} 
                                                name={`entidades.${index}.telefono`} 
                                                render={({field}) => (
                                                    <Input 
                                                        {...field} 
                                                        value={field.value ?? ''} 
                                                        className="h-8 flex-1"
                                                        placeholder="123-456-789"
                                                    />
                                                )} 
                                            />
                                        ) : (
                                            <span>{(currentEntidad as any).telefono || 'N/A'}</span>
                                        )}
                                    </div>
                                    <div className="flex items-start gap-3">
                                        <FileText className="text-muted-foreground w-4 h-4 mt-1" /> 
                                        <span className="font-medium">Dirección:</span>
                                        {isEditing ? (
                                            <FormField 
                                                control={form.control} 
                                                name={`entidades.${index}.direccion`} 
                                                render={({field}) => (
                                                    <Textarea 
                                                        {...field} 
                                                        value={field.value ?? ''} 
                                                        className="text-sm flex-1"
                                                        placeholder="Dirección completa"
                                                    />
                                                )} 
                                            />
                                        ) : (
                                            <span className="flex-1">{(currentEntidad as any).direccion || 'N/A'}</span>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}

                    {/* Add Entity Button */}
                    {isEditing && (
                        <Card className="border-dashed">
                            <CardContent className="flex items-center justify-center py-8">
                                <Button 
                                    type="button" 
                                    variant="outline" 
                                    onClick={() => appendEntidad({
                                        rol: '',
                                        nombre: '',
                                        direccion: '',
                                        identificador_fiscal: '',
                                        telefono: '',
                                        email: '',
                                        datos_extra: null
                                    })}
                                >
                                    <PlusCircle className="mr-2 h-4 w-4" />
                                    Añadir Entidad
                                </Button>
                            </CardContent>
                        </Card>
                    )}

                    {/* Financial Details Card */}
                    <Card>
                        <CardHeader className="flex-row items-center justify-between">
                            <CardTitle className="flex items-center gap-2"><Euro className="h-5 w-5"/>Detalles Financieros</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-6">
                                {isEditing ? (
                                    // EDITING VIEW
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between">
                                            <h4 className="font-semibold text-muted-foreground">Desglose de Impuestos</h4>
                                             <Button 
                                                type="button" 
                                                size="sm" 
                                                variant="outline" 
                                                onClick={() => appendIva({ 
                                                    tipo_impuesto: 'IVA', 
                                                    porcentaje: 21, 
                                                    base_imponible: 0, 
                                                    cuota: 0 
                                                })}
                                            >
                                                <PlusCircle className="mr-2 h-4 w-4" />Añadir
                                            </Button>
                                        </div>

                                        <div className="space-y-4">
                                            {ivaFields.map((iva, index) => (
                                                <div key={iva.id} className="p-4 rounded-lg bg-muted/50 border relative">
                                                    <div className="grid grid-cols-2 gap-4">
                                                        <FormField control={form.control} name={`iva_details.${index}.tipo_impuesto`} render={({field}) => (
                                                            <FormItem>
                                                                <FormLabel>Tipo</FormLabel>
                                                                <FormControl><Input {...field} value={field.value ?? ''} placeholder="IVA" /></FormControl>
                                                            </FormItem>
                                                        )} />
                                                        <FormField control={form.control} name={`iva_details.${index}.porcentaje`} render={({field}) => (
                                                            <FormItem>
                                                                <FormLabel>Porcentaje %</FormLabel>
                                                                <FormControl><Input type="number" {...field} value={field.value ?? 0} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} placeholder="21" /></FormControl>
                                                            </FormItem>
                                                        )} />
                                                        <FormField control={form.control} name={`iva_details.${index}.base_imponible`} render={({field}) => (
                                                            <FormItem>
                                                                <FormLabel>Base</FormLabel>
                                                                <FormControl><Input type="number" {...field} value={field.value ?? 0} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} placeholder="Base" /></FormControl>
                                                            </FormItem>
                                                        )} />
                                                        <FormField control={form.control} name={`iva_details.${index}.cuota`} render={({field}) => (
                                                            <FormItem>
                                                                <FormLabel>Cuota</FormLabel>
                                                                <FormControl><Input type="number" {...field} value={field.value ?? 0} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} placeholder="Cuota" /></FormControl>
                                                            </FormItem>
                                                        )} />
                                                    </div>
                                                    <Button type="button" variant="ghost" size="icon" className="absolute top-2 right-2" onClick={() => removeIva(index)}>
                                                        <Trash2 className="h-4 w-4 text-destructive"/>
                                                    </Button>
                                                </div>
                                            ))}
                                        </div>

                                        <Separator className="my-6" />

                                        <div className="space-y-4">
                                            <h4 className="font-semibold text-muted-foreground">Totales</h4>
                                            <div className="grid grid-cols-2 gap-4">
                                            <FormField control={form.control} name='base_imponible' render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Base Imponible</FormLabel>
                                                    <FormControl><Input type="number" {...field} value={field.value ?? 0} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} /></FormControl>
                                                </FormItem>
                                            )} />
                                            <FormField control={form.control} name='iva' render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Total IVA</FormLabel>
                                                    <FormControl><Input type="number" {...field} value={field.value ?? 0} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} /></FormControl>
                                                </FormItem>
                                            )} />
                                            </div>
                                             <FormField control={form.control} name='total' render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-lg">Total</FormLabel>
                                                    <FormControl><Input type="number" {...field} value={field.value ?? 0} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} className="text-xl font-bold" /></FormControl>
                                                </FormItem>
                                            )} />
                                        </div>

                                    </div>
                                ) : (
                                    // READ-ONLY VIEW
                                    <>
                                        <div>
                                            <div className="flex items-center justify-between mb-2">
                                                <h4 className="font-semibold text-base text-muted-foreground">Resumen de Impuestos</h4>
                                            </div>
                                            <div className="space-y-2">
                                                {(doc.iva_details || []).map((iva, index) => (
                                                    <div key={`iva-${index}`} className="flex justify-between items-center p-3 rounded-md bg-muted/50 gap-2">
                                                        <div className="flex items-center gap-2">
                                                            <IvaBadge iva={iva} />
                                                            <span className="text-sm">
                                                                {`${iva.tipo_impuesto} (${iva.porcentaje}%)`}
                                                            </span>
                                                        </div>
                                                        <span className="font-mono text-sm">
                                                            {formatCurrency(iva.cuota, doc.moneda)}
                                                        </span>
                                                    </div>
                                                ))}
                                                {(doc.iva_details?.length || 0) === 0 && (
                                                    <p className="text-sm text-muted-foreground text-center py-4">
                                                        No hay impuestos detallados.
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                        
                                        <div className="space-y-2 text-base pt-4 border-t">
                                            <div className="flex justify-between font-medium items-center">
                                                <span className="text-muted-foreground">Base Imponible</span>
                                                <span className="font-mono">{formatCurrency(getCurrentValue('base_imponible'), doc.moneda)}</span>
                                            </div>
                                            <div className="flex justify-between font-medium items-center">
                                                <span className="text-muted-foreground">Total IVA</span>
                                                <span className="font-mono">{formatCurrency(getCurrentValue('iva'), doc.moneda)}</span>
                                            </div>
                                            <div className="flex justify-between font-bold text-lg items-center text-primary pt-2 mt-2 border-t">
                                                <span>Total</span>
                                                <span className="font-mono">{formatCurrency(getCurrentValue('total'), doc.moneda)}</span>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </>
    );
} 
