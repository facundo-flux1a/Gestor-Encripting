
'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle2, User, Building, Phone, Mail, FileText, Info, Trash2, PlusCircle, FileUp, Box, ChevronsRight, Tag, Percent, ArrowRight, Search, ChevronLeft, ChevronRight, Euro, History } from "lucide-react";
import { format } from 'date-fns';
import { type Document, type IvaDetail, type DocumentLine, type DocumentUpdatePayload } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import type { UseFormReturn } from "react-hook-form";
import { useFieldArray, useWatch } from "react-hook-form";
import { cn } from "@/lib/utils";
import React, { useMemo, useState, useEffect, KeyboardEvent } from "react";
import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FinancialDetailsCard } from "./financial-details-card";
import { EditableEntityCard } from './editable-entity-card';

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
    
    const [lineaFilters, setLineaFilters] = useState<string[]>([]);
    const [currentLineaSearch, setCurrentLineaSearch] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    
    const provider = useMemo(() => 
        doc.entidades.find(e => e.rol === 'proveedor' || e.rol === 'emisor'),
    [doc.entidades]);

    useEffect(() => {
        if (isEditing) {
            if (entidadFields.length === 0 && doc.entidades?.length > 0) {
                form.reset({ ...form.getValues(), entidades: doc.entidades });
            }
            if (lineaFields.length === 0 && doc.lineas?.length > 0) {
                form.reset({ ...form.getValues(), lineas: doc.lineas });
            }
            if (ivaFields.length === 0 && doc.iva_details?.length > 0) {
                form.reset({ ...form.getValues(), iva_details: doc.iva_details });
            }
        }
    }, [isEditing, doc.id_documento, doc.entidades, doc.lineas, doc.iva_details, form]);

    const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter' && currentLineaSearch.trim() !== '') {
            setLineaFilters([...lineaFilters, currentLineaSearch.trim()]);
            setCurrentLineaSearch('');
        }
    };

    const removeFilter = (filterToRemove: string) => {
        setLineaFilters(lineaFilters.filter(f => f !== filterToRemove));
    };

    const filteredLineaFields = useMemo(() => {
        let fields = lineaFields.map((field, index) => ({ field, originalIndex: index }));
        if (lineaFilters.length === 0) {
            return fields;
        }

        return fields.filter(({ field }) => {
            return lineaFilters.every(filter => {
                const lowercasedFilter = filter.toLowerCase();
                 return Object.values(field).some(value => {
                    if (value === null || value === undefined) {
                        return false;
                    }
                    if (typeof value === 'string' || typeof value === 'number') {
                        return String(value).toLowerCase().includes(lowercasedFilter);
                    }
                    return false;
                });
            })
        });
    }, [lineaFields, lineaFilters]);

    const totalPages = Math.ceil(filteredLineaFields.length / ITEMS_PER_PAGE);

    const paginatedLineaFields = useMemo(() => {
        return filteredLineaFields.slice(
            (currentPage - 1) * ITEMS_PER_PAGE,
            currentPage * ITEMS_PER_PAGE
        );
    }, [filteredLineaFields, currentPage]);
    
    React.useEffect(() => {
        setCurrentPage(1);
    }, [lineaFilters]);

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
    
    return (
        <>
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
                                                <SelectItem value="Nomina">Nómina</SelectItem>
                                                <SelectItem value="Contrato">Contrato</SelectItem>
                                                <SelectItem value="Alquiler">Alquiler</SelectItem>
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
                        
                        <FormItem>
                             <FormLabel className="text-muted-foreground text-xs">Fecha Creación</FormLabel>
                             <p className="text-sm font-medium">{formatDate(doc.fecha_creacion)}</p>
                        </FormItem>
                        
                        {renderEditableField("moneda", "Moneda")}
                        
                         <FormItem>
                             <FormLabel className="text-muted-foreground text-xs">Estado</FormLabel>
                             {doc.verificado ? (
                                  <Badge variant="secondary" className="flex items-center gap-2 bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300">
                                      <CheckCircle2 className="h-4 w-4" /> Verificado
                                  </Badge>
                             ) : (
                                 <Badge variant="destructive" className="flex items-center gap-2">
                                     <AlertCircle className="h-4 w-4" /> Pendiente de Revisión
                                 </Badge>
                             )}
                         </FormItem>
                    </div>

                    {!doc.verificado && doc.incidencia_razon && (
                        <Alert variant="destructive" className="mt-6">
                            <AlertCircle className="h-4 w-4" />
                            <AlertTitle>Incidencia Detectada</AlertTitle>
                            <AlertDescription>
                                {doc.incidencia_razon}
                            </AlertDescription>
                        </Alert>
                    )}
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {entidadFields.map((field, index) => (
                    <EditableEntityCard 
                        key={field.id}
                        isEditing={isEditing}
                        form={form}
                        entityIndex={index}
                        removeEntity={() => removeEntidad(index)}
                    />
                ))}
            </div>

            {isEditing && (
                 <Button type="button" variant="outline" size="sm" onClick={() => appendEntidad({ rol: 'Otro', nombre: '', direccion: '', identificador_fiscal: '', telefono: '', email: '', datos_extra: null })}>
                    <PlusCircle className="mr-2 h-4 w-4" /> Añadir Entidad
                </Button>
            )}

            <FinancialDetailsCard doc={doc} isEditing={isEditing} form={form} />

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
                                placeholder="Buscar y presionar Enter..."
                                value={currentLineaSearch}
                                onChange={(e) => setCurrentLineaSearch(e.target.value)}
                                onKeyDown={handleSearchKeyDown}
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
                    {lineaFilters.length > 0 && (
                        <div className="flex items-center gap-2 flex-wrap mb-4">
                            <span className="text-sm font-medium">Filtros:</span>
                            {lineaFilters.map((filter) => (
                                <Badge key={filter} variant="secondary" className="pl-2">
                                    {filter}
                                    <Button
                                        variant="ghost" size="icon" className="ml-1 h-5 w-5 p-0"
                                        onClick={() => removeFilter(filter)}
                                    >
                                        <X className="h-3 w-3" />
                                    </Button>
                                </Badge>
                            ))}
                        </div>
                    )}
                     <div className="space-y-4">
                        {paginatedLineaFields.map(({ field, originalIndex }) => {
                            const currentLinea = formValues.lineas?.[originalIndex] || field;
                            return (
                                <div key={field.id} className={cn(
                                    "p-4 rounded-lg",
                                    isEditing ? "bg-muted/30 border" : "border-b last:border-b-0"
                                )}>
                                    {isEditing ? (
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
                                        <div className="flex flex-col md:flex-row md:items-start gap-4">
                                            <Box className="h-8 w-8 text-primary flex-shrink-0 mt-1 hidden md:block" />
                                            <div className="flex-grow">
                                                <p className="font-semibold text-base">{currentLinea.descripcion}</p>
                                                <p className="text-sm text-muted-foreground font-mono">{currentLinea.codigo}</p>
                                                <div className="flex items-center gap-4 mt-2 text-sm">
                                                    <Badge variant="secondary">Cant: {currentLinea.cantidad}</Badge>
                                                    <Badge variant="outline" className="text-destructive border-destructive/50">Dto: {currentLinea.descuento_porcentaje || 0}%</Badge>
                                                    {provider && currentLinea.codigo && (
                                                        <Button size="sm" variant="link" asChild className="p-0 h-auto">
                                                            <Link href={`/proveedores/${encodeURIComponent(provider.identificador_fiscal!)}/${encodeURIComponent(currentLinea.codigo)}`}>
                                                                <History className="mr-2 h-4 w-4" />
                                                                Ver Historial
                                                            </Link>
                                                         </Button>
                                                     )}
                                                </div>
                                            </div>
                                            <div className="flex-shrink-0 text-right space-y-2">
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
                                    {lineaFilters.length > 0 ? "Prueba con otro término de búsqueda." : "No hay líneas de documento."}
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
                                type="button"
                                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                disabled={currentPage === 1}
                            >
                                <ChevronLeft className="h-4 w-4" />
                                Anterior
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                type="button"
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
        </>
    );
}
