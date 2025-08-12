'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { IvaBadge } from "@/components/dashboard/iva-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertCircle, CheckCircle2, FileText, User, Building, Phone, Mail, Calendar, Hash, FileUp, Info } from "lucide-react";
import { format } from 'date-fns';
import { type Document, type DocumentUpdatePayload } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import type { UseFormReturn } from "react-hook-form";

const formatCurrency = (amount: number, currency: string = 'EUR') => {
    return new Intl.NumberFormat('es-ES', {
        style: 'currency',
        currency,
    }).format(amount);
};

const formatDate = (date: string | null) => {
    if (!date) return 'N/A';
    try {
        const d = new Date(date);
        // add timezone offset to avoid being one day off
        const utcDate = new Date(d.valueOf() + d.getTimezoneOffset() * 60 * 1000);
        return format(utcDate, 'dd/MM/yyyy');
    } catch {
        return 'Fecha inválida';
    }
}

const renderJsonData = (data: any) => {
    if (!data) return <p className="text-sm text-muted-foreground">No hay datos extra.</p>;
    
    const jsonData = typeof data === 'string' ? JSON.parse(data) : data;

    return (
        <div className="text-xs bg-muted/30 p-4 rounded-lg mt-4 space-y-2 border">
             {Object.entries(jsonData).map(([key, value]) => (
                <div key={key} className="grid grid-cols-2 gap-2 text-xs">
                    <span className="font-semibold text-muted-foreground uppercase tracking-wider">{key}</span>
                    <span className="break-words">{typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value).replace(/"/g, '')}</span>
                </div>
            ))}
        </div>
    );
}

interface DocumentViewProps {
    doc: Document;
    isEditing: boolean;
    form: UseFormReturn<DocumentUpdatePayload>;
}

export function DocumentView({ doc, isEditing, form }: DocumentViewProps) {
    const renderEditableField = (name: keyof DocumentUpdatePayload, label: string, currentValue: string | number, type: string = "text", isCurrency: boolean = false) => {
        return (
             <FormField
                control={form.control}
                name={name}
                render={({ field }) => (
                    <FormItem>
                    <FormLabel className="text-muted-foreground text-xs">{label}</FormLabel>
                    <FormControl>
                        {isEditing ? (
                             <Input 
                                {...field} 
                                type={type} 
                                className="h-8 text-sm"
                                onChange={e => field.onChange(type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value)}
                             />
                        ) : (
                            <p className="text-sm font-medium">{isCurrency ? formatCurrency(currentValue as number, doc.moneda) : currentValue}</p>
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
                            <CardDescription>{doc.tipo_documento}</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="grid md:grid-cols-3 gap-6 text-sm">
                                <div>
                                    {renderEditableField("numero_factura", "Nº Documento", doc.numero_factura)}
                                </div>
                                <div>
                                    <FormField
                                        control={form.control}
                                        name="fecha_emision"
                                        render={({ field }) => (
                                            <FormItem>
                                            <FormLabel className="text-muted-foreground text-xs">Fecha Emisión</FormLabel>
                                            <FormControl>
                                                {isEditing ? (
                                                    <Input type="date" {...field} className="h-8 text-sm"/>
                                                ) : (
                                                    <p className="text-sm font-medium">{formatDate(doc.fecha_emision)}</p>
                                                )}
                                            </FormControl>
                                            <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>
                                <div><span className="font-semibold text-muted-foreground block">Fecha Vencimiento</span>{formatDate(doc.fecha_vencimiento)}</div>
                                <div><span className="font-semibold text-muted-foreground block">Fecha Creación</span>{formatDate(doc.fecha_creacion)}</div>
                                <div><span className="font-semibold text-muted-foreground block">Moneda</span>{doc.moneda}</div>
                                <div>
                                    <span className="font-semibold text-muted-foreground block">Estado</span>
                                    {doc.incidencia ? (
                                        <Badge variant="destructive" className="flex items-center gap-2">
                                            <AlertCircle className="h-4 w-4" /> Con Incidencia
                                        </Badge>
                                    ) : (
                                        <Badge variant="secondary" className="flex items-center gap-2">
                                            <CheckCircle2 className="h-4 w-4" /> Verificado
                                        </Badge>
                                    )}
                                </div>
                            </div>
                            {doc.datos_extra && <div className="mt-6"><h4 className="font-semibold mb-2 text-muted-foreground">Datos Extra del Documento</h4>{renderJsonData(doc.datos_extra)}</div>}
                        </CardContent>
                    </Card>

                    {/* Document Lines Card */}
                    <Card>
                        <CardHeader><CardTitle>Líneas del Documento</CardTitle></CardHeader>
                        <CardContent>
                             <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Código</TableHead>
                                        <TableHead>Descripción</TableHead>
                                        <TableHead className="text-right">Cantidad</TableHead>
                                        <TableHead className="text-right">P. Unitario</TableHead>
                                        <TableHead className="text-right">Dto. %</TableHead>
                                        <TableHead className="text-right">Importe</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {doc.lineas.map((line, index) => (
                                        <TableRow key={index}>
                                            <TableCell className="font-mono text-xs">{line.codigo || 'N/A'}</TableCell>
                                            <TableCell>{line.descripcion}</TableCell>
                                            <TableCell className="text-right">{line.cantidad} {line.unidad}</TableCell>
                                            <TableCell className="text-right">{formatCurrency(line.precio_unitario, doc.moneda)}</TableCell>
                                            <TableCell className="text-right">{line.descuento_porcentaje}%</TableCell>
                                            <TableCell className="text-right font-medium">{formatCurrency(line.importe_linea, doc.moneda)}</TableCell>
                                        </TableRow>
                                    ))}
                                    {doc.lineas.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No hay líneas en este documento.</TableCell></TableRow>}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </div>

                <div className="space-y-8">
                    {/* Entities Card */}
                    {doc.entidades.map((entidad, index) => {
                         const isProvider = entidad.rol.toLowerCase().includes('proveedor') || entidad.rol.toLowerCase().includes('emisor');
                         return (
                         <Card key={index}>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-xl">
                                    {isProvider ? <Building /> : <User />}
                                    {entidad.rol}
                                </CardTitle>
                                {isEditing && isProvider ? renderEditableField('proveedor', 'Nombre', entidad.nombre) : <CardDescription>{entidad.nombre}</CardDescription>}
                            </CardHeader>
                            <CardContent className="text-sm space-y-3">
                               <div className="flex items-center gap-3">
                                   <Hash className="text-muted-foreground w-4 h-4" /> 
                                   <span className="font-medium">ID Fiscal:</span>
                                   {isEditing && isProvider ? renderEditableField('cif', '', entidad.identificador_fiscal || '') : entidad.identificador_fiscal}
                                </div>
                                <p className="flex items-center gap-3"><Mail className="text-muted-foreground w-4 h-4" /> <span className="font-medium">Email:</span> {entidad.email || 'N/A'}</p>
                                <p className="flex items-center gap-3"><Phone className="text-muted-foreground w-4 h-4" /> <span className="font-medium">Teléfono:</span> {entidad.telefono || 'N/A'}</p>
                                <p className="flex items-start gap-3"><FileText className="text-muted-foreground w-4 h-4 mt-1" /> <span className="font-medium">Dirección:</span> <span className="flex-1">{entidad.direccion || 'N/A'}</span></p>
                                {entidad.datos_extra && <div className="pt-2"><h4 className="font-semibold mb-2 text-muted-foreground">Datos Extra de la Entidad</h4>{renderJsonData(entidad.datos_extra)}</div>}
                            </CardContent>
                        </Card>
                         )
                    })}
                     {/* Financial Details Card */}
                    <Card>
                        <CardHeader><CardTitle>Detalles Financieros</CardTitle></CardHeader>
                        <CardContent>
                            <div className="space-y-6">
                                <div>
                                    <h4 className="font-semibold mb-4 text-base text-muted-foreground">Resumen de Impuestos</h4>
                                    <div className="space-y-2">
                                        {doc.iva_details.map((iva, index) => (
                                            <div key={index} className="flex justify-between items-center p-3 rounded-md bg-muted/50">
                                                <div className="flex items-center gap-2">
                                                    <IvaBadge iva={iva} />
                                                    <span className="text-sm">{`${iva.tipo_impuesto} (${iva.porcentaje}%)`}</span>
                                                </div>
                                                <span className="font-mono text-sm">{formatCurrency(iva.cuota, doc.moneda)}</span>
                                            </div>
                                        ))}
                                         {doc.iva_details.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No hay impuestos detallados.</p>}
                                    </div>
                                </div>
                                <div className="space-y-2 text-base pt-4 border-t">
                                     <div className="flex justify-between font-medium">
                                        <span className="text-muted-foreground">Base Imponible</span>
                                        {isEditing ? renderEditableField('base_imponible', '', doc.base_imponible, 'number', true) : <span>{formatCurrency(doc.base_imponible, doc.moneda)}</span>}
                                     </div>
                                     <div className="flex justify-between font-medium"><span className="text-muted-foreground">Total IVA</span><span>{formatCurrency(doc.iva, doc.moneda)}</span></div>
                                     <div className="flex justify-between font-bold text-primary text-xl border-t pt-3 mt-3">
                                        <span className="text-foreground">Total</span>
                                        {isEditing ? renderEditableField('total', '', doc.total, 'number', true) : <span>{formatCurrency(doc.total, doc.moneda)}</span>}
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
            
            {/* Other Details Grid */}
            <div className="grid md:grid-cols-2 gap-8">
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
                       <div className="text-sm text-foreground bg-muted/30 border p-4 rounded-lg min-h-[100px]">
                        {doc.observaciones || "No hay observaciones."}
                       </div>
                    </CardContent>
                </Card>
            </div>
        </>
    );
}
