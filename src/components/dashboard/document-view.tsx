
'use client';

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { IvaBadge } from "@/components/dashboard/iva-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertCircle, CheckCircle2, User, Building, Phone, Mail, FileText, Info, Trash2, PlusCircle, FileUp } from "lucide-react";
import { format } from 'date-fns';
import { type Document } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import type { UseFormReturn } from "react-hook-form";
import { useFieldArray } from "react-hook-form";

const formatCurrency = (amount: number, currency: string = 'EUR') => {
    if (typeof amount !== 'number' || isNaN(amount)) return 'N/A';
    return new Intl.NumberFormat('es-ES', {
        style: 'currency',
        currency,
    }).format(amount);
};

const formatDate = (date: string | null) => {
    if (!date) return 'N/A';
    try {
        const d = new Date(date);
        const utcDate = new Date(d.valueOf() + d.getTimezoneOffset() * 60 * 1000);
        return format(utcDate, 'dd/MM/yyyy');
    } catch {
        return 'Fecha inválida';
    }
}

interface DocumentViewProps {
    doc: Document;
    isEditing: boolean;
    form: UseFormReturn<any>; // Use any to avoid excessive type mapping for now
}

export function DocumentView({ doc, isEditing, form }: DocumentViewProps) {
    const { fields: entidadFields, append: appendEntidad, remove: removeEntidad } = useFieldArray({ control: form.control, name: "entidades" });
    const { fields: lineaFields, append: appendLinea, remove: removeLinea } = useFieldArray({ control: form.control, name: "lineas" });
    const { fields: ivaFields, append: appendIva, remove: removeIva } = useFieldArray({ control: form.control, name: "iva_details" });


    const renderEditableField = (fieldName: string, label: string, isCurrency: boolean = false) => {
        return (
             <FormField
                control={form.control}
                name={fieldName}
                render={({ field }) => (
                    <FormItem>
                        <FormLabel className="text-muted-foreground text-xs">{label}</FormLabel>
                        <FormControl>
                            {isEditing ? (
                                <Input 
                                    {...field}
                                    type={isCurrency ? 'number' : 'text'} 
                                    className="h-8 text-sm"
                                    onChange={e => field.onChange(isCurrency ? parseFloat(e.target.value) || 0 : e.target.value)}
                                />
                            ) : (
                                <p className="text-sm font-medium">{isCurrency ? formatCurrency(field.value as number, doc.moneda) : field.value}</p>
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
                name={fieldName}
                render={({ field }) => (
                    <FormItem>
                        <FormLabel className="text-muted-foreground text-xs">{label}</FormLabel>
                        <FormControl>
                            {isEditing ? (
                                <Input type="date" {...field} className="h-8 text-sm"/>
                            ) : (
                                <p className="text-sm font-medium">{formatDate(field.value)}</p>
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
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-8">
                    {/* General Information Card */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2"><Info className="h-5 w-5" /> Información General</CardTitle>
                            <FormField
                                control={form.control}
                                name="tipo_documento"
                                render={({ field }) => isEditing ? (
                                     <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl>
                                            <SelectTrigger><SelectValue placeholder="Tipo de Documento" /></SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            <SelectItem value="Factura">Factura</SelectItem>
                                            <SelectItem value="Informe">Informe</SelectItem>
                                            <SelectItem value="Contrato">Contrato</SelectItem>
                                            <SelectItem value="Otro">Otro</SelectItem>
                                        </SelectContent>
                                    </Select>
                                ) : (
                                    <CardDescription>{field.value}</CardDescription>
                                )}
                            />
                        </CardHeader>
                        <CardContent>
                            <div className="grid md:grid-cols-3 gap-6 text-sm">
                                {renderEditableField("numero_factura", "Nº Documento")}
                                {renderEditableDate("fecha_emision", "Fecha Emisión")}
                                {renderEditableDate("fecha_vencimiento", "Fecha Vencimiento")}
                                {renderEditableDate("fecha_creacion", "Fecha Creación")}
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
                                                        <Checkbox checked={field.value} onCheckedChange={field.onChange} id="incidencia-check"/>
                                                        <label htmlFor="incidencia-check" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                                            Con Incidencia
                                                        </label>
                                                    </div>
                                                ) : (
                                                    field.value ? (
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
                            <CardTitle>Líneas del Documento</CardTitle>
                             {isEditing && <Button type="button" size="sm" variant="outline" onClick={() => appendLinea({ codigo: '', descripcion: '', cantidad: 1, unidad: 'ud', precio_unitario: 0, descuento_porcentaje: 0, precio_neto: 0, importe_linea: 0, datos_extra: null })}><PlusCircle className="mr-2" /> Añadir Línea</Button>}
                        </CardHeader>
                        <CardContent>
                             <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Código</TableHead>
                                        <TableHead>Descripción</TableHead>
                                        <TableHead>Cantidad</TableHead>
                                        <TableHead>Unidad</TableHead>
                                        <TableHead className="text-right">P. Unitario</TableHead>
                                        <TableHead className="text-right">Dto. %</TableHead>
                                        <TableHead className="text-right">Importe</TableHead>
                                        {isEditing && <TableHead></TableHead>}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {lineaFields.map((line, index) => (
                                        <TableRow key={line.id}>
                                            <TableCell className="font-mono text-xs w-24">
                                                {isEditing ? <FormField control={form.control} name={`lineas.${index}.codigo`} render={({field}) => <Input {...field} value={field.value || ''} className="h-8"/>} /> : (line as any).codigo || 'N/A'}
                                            </TableCell>
                                            <TableCell>
                                                {isEditing ? <FormField control={form.control} name={`lineas.${index}.descripcion`} render={({field}) => <Input {...field} value={field.value || ''} className="h-8"/>} /> : (line as any).descripcion}
                                            </TableCell>
                                            <TableCell className="w-24">
                                                {isEditing ? <FormField control={form.control} name={`lineas.${index}.cantidad`} render={({field}) => <Input type="number" {...field} value={field.value || 0} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} className="h-8"/>} /> : (line as any).cantidad}
                                            </TableCell>
                                            <TableCell className="w-20">
                                                {isEditing ? <FormField control={form.control} name={`lineas.${index}.unidad`} render={({field}) => <Input {...field} value={field.value || ''} className="h-8"/>} /> : (line as any).unidad}
                                            </TableCell>
                                            <TableCell className="text-right w-28">
                                                {isEditing ? <FormField control={form.control} name={`lineas.${index}.precio_unitario`} render={({field}) => <Input type="number" {...field} value={field.value || 0} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} className="h-8 text-right"/>} /> : formatCurrency((line as any).precio_unitario, doc.moneda)}
                                            </TableCell>
                                            <TableCell className="text-right w-20">
                                                {isEditing ? <FormField control={form.control} name={`lineas.${index}.descuento_porcentaje`} render={({field}) => <Input type="number" {...field} value={field.value || 0} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} className="h-8 text-right"/>} /> : `${(line as any).descuento_porcentaje}%`}
                                            </TableCell>
                                            <TableCell className="text-right font-medium w-28">
                                                {isEditing ? <FormField control={form.control} name={`lineas.${index}.importe_linea`} render={({field}) => <Input type="number" {...field} value={field.value || 0} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} className="h-8 text-right"/>} /> : formatCurrency((line as any).importe_linea, doc.moneda)}
                                            </TableCell>
                                            {isEditing && <TableCell><Button type="button" variant="ghost" size="icon" onClick={() => removeLinea(index)}><Trash2 className="h-4 w-4 text-destructive"/></Button></TableCell>}
                                        </TableRow>
                                    ))}
                                    {lineaFields.length === 0 && <TableRow><TableCell colSpan={isEditing ? 8 : 7} className="text-center text-muted-foreground py-8">No hay líneas en este documento.</TableCell></TableRow>}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </div>

                <div className="space-y-8">
                    {/* Entities Card */}
                    {entidadFields.map((entidad, index) => (
                         <Card key={entidad.id}>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-xl">
                                    {(entidad as any).rol.toLowerCase().includes('proveedor') || (entidad as any).rol.toLowerCase().includes('emisor') ? <Building /> : <User />}
                                    <FormField control={form.control} name={`entidades.${index}.rol`} render={({field}) => isEditing ? <Input {...field} className="h-8"/> : <span>{(entidad as any).rol}</span>} />
                                </CardTitle>
                                <FormField control={form.control} name={`entidades.${index}.nombre`} render={({field}) => isEditing ? <Input {...field} value={field.value || ''} className="h-8"/> : <CardDescription>{(entidad as any).nombre}</CardDescription>} />
                            </CardHeader>
                            <CardContent className="text-sm space-y-3">
                               <div className="flex items-center gap-3">
                                   <FileText className="text-muted-foreground w-4 h-4" /> 
                                   <span className="font-medium">ID Fiscal:</span>
                                   <FormField control={form.control} name={`entidades.${index}.identificador_fiscal`} render={({field}) => isEditing ? <Input {...field} value={field.value || ''} className="h-8"/> : <span>{(entidad as any).identificador_fiscal}</span>} />
                                </div>
                                <div className="flex items-center gap-3">
                                   <Mail className="text-muted-foreground w-4 h-4" /> 
                                   <span className="font-medium">Email:</span>
                                   <FormField control={form.control} name={`entidades.${index}.email`} render={({field}) => isEditing ? <Input type="email" {...field} value={field.value || ''} className="h-8"/> : <span>{(entidad as any).email || 'N/A'}</span>} />
                                </div>
                                <div className="flex items-center gap-3">
                                   <Phone className="text-muted-foreground w-4 h-4" /> 
                                   <span className="font-medium">Teléfono:</span>
                                   <FormField control={form.control} name={`entidades.${index}.telefono`} render={({field}) => isEditing ? <Input {...field} value={field.value || ''} className="h-8"/> : <span>{(entidad as any).telefono || 'N/A'}</span>} />
                                </div>
                                <div className="flex items-start gap-3">
                                   <FileText className="text-muted-foreground w-4 h-4 mt-1" /> 
                                   <span className="font-medium">Dirección:</span>
                                   <FormField control={form.control} name={`entidades.${index}.direccion`} render={({field}) => isEditing ? <Textarea {...field} value={field.value || ''} className="text-sm"/> : <span className="flex-1">{(entidad as any).direccion || 'N/A'}</span>} />
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                     {/* Financial Details Card */}
                    <Card>
                        <CardHeader className="flex-row items-center justify-between">
                            <CardTitle>Detalles Financieros</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-6">
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <h4 className="font-semibold text-base text-muted-foreground">Resumen de Impuestos</h4>
                                        {isEditing && <Button type="button" size="sm" variant="outline" onClick={() => appendIva({ tipo_impuesto: 'IVA', porcentaje: 21, base_imponible: 0, cuota: 0 })}><PlusCircle className="mr-2 h-4 w-4" />Añadir</Button>}
                                    </div>
                                    <div className="space-y-2">
                                        {ivaFields.map((iva, index) => (
                                            <div key={iva.id} className="flex justify-between items-center p-3 rounded-md bg-muted/50 gap-2">
                                                {isEditing ? (
                                                    <>
                                                        <FormField control={form.control} name={`iva_details.${index}.tipo_impuesto`} render={({field}) => <Input {...field} className="h-8 w-24" />}/>
                                                        <FormField control={form.control} name={`iva_details.${index}.porcentaje`} render={({field}) => <Input type="number" {...field} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} className="h-8 w-20" />} />
                                                        <FormField control={form.control} name={`iva_details.${index}.cuota`} render={({field}) => <Input type="number" {...field} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} className="h-8 w-24 text-right" />} />
                                                        <Button type="button" variant="ghost" size="icon" onClick={() => removeIva(index)}><Trash2 className="h-4 w-4 text-destructive"/></Button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <div className="flex items-center gap-2">
                                                            <IvaBadge iva={iva as any} />
                                                            <span className="text-sm">{`${(iva as any).tipo_impuesto} (${(iva as any).porcentaje}%)`}</span>
                                                        </div>
                                                        <span className="font-mono text-sm">{formatCurrency((iva as any).cuota, doc.moneda)}</span>
                                                    </>
                                                )}
                                            </div>
                                        ))}
                                         {ivaFields.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No hay impuestos detallados.</p>}
                                    </div>
                                </div>
                                <div className="space-y-2 text-base pt-4 border-t">
                                     <div className="flex justify-between font-medium items-center">
                                        <span className="text-muted-foreground">Base Imponible</span>
                                        {isEditing ? <FormField control={form.control} name='base_imponible' render={({field}) => <Input type="number" {...field} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} className="h-8 w-32 text-right" />} /> : <span>{formatCurrency(doc.base_imponible, doc.moneda)}</span>}
                                     </div>
                                     <div className="flex justify-between font-medium"><span className="text-muted-foreground">Total IVA</span><span>{formatCurrency(doc.iva, doc.moneda)}</span></div>
                                     <div className="flex justify-between font-bold text-primary text-xl border-t pt-3 mt-3 items-center">
                                        <span className="text-foreground">Total</span>
                                        {isEditing ? <FormField control={form.control} name='total' render={({field}) => <Input type="number" {...field} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} className="h-8 w-32 text-right" />} /> : <span>{formatCurrency(doc.total, doc.moneda)}</span>}
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
            
            {/* Other Details Grid */}
            <div className="grid md:grid-cols-2 gap-8 mt-8">
                {/* Attached Files Card */}
                <Card>
                    <CardHeader><CardTitle className="flex items-center gap-2"><FileUp /> Archivos Adjuntos</CardTitle></CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Nombre</TableHead>
                                    <TableHead>Tipo</TableHead>
                                    <TableHead>Subido el</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {doc.archivos.map((file, index) => (
                                     <TableRow key={index}>
                                        <TableCell className="font-medium">{file.nombre_archivo}</TableCell>
                                        <TableCell>{file.tipo_archivo}</TableCell>
                                        <TableCell>{formatDate(file.fecha_subida)}</TableCell>
                                    </TableRow>
                                ))}
                                {doc.archivos.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">No hay archivos adjuntos.</TableCell></TableRow>}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
                
                {/* Observations Card */}
                <Card>
                    <CardHeader><CardTitle>Observaciones</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        <FormField
                            control={form.control}
                            name="observaciones"
                            render={({ field }) => (
                                <FormItem>
                                    <FormControl>
                                    {isEditing ? (
                                        <Textarea {...field} value={field.value || ''} className="text-sm min-h-[120px]"/>
                                    ) : (
                                         <div className="text-sm text-foreground bg-muted/30 border p-4 rounded-lg min-h-[100px]">
                                            {field.value || "No hay observaciones."}
                                        </div>
                                    )}
                                    </FormControl>
                                </FormItem>
                            )}
                        />
                    </CardContent>
                </Card>
            </div>
        </>
    );
}
