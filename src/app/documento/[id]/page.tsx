import { MainLayout, MainLayoutHeader } from "@/components/layout/main-layout";
import { getDocumentById } from "@/services/document-service";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { IvaBadge } from "@/components/dashboard/iva-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertCircle, CheckCircle2, FileText, User, Building, Phone, Mail, Calendar, Hash } from "lucide-react";
import { format } from 'date-fns';

const formatCurrency = (amount: number, currency: string = 'EUR') => {
    return new Intl.NumberFormat('es-ES', {
        style: 'currency',
        currency,
    }).format(amount);
};

const formatDate = (date: string | null) => {
    if (!date) return 'N/A';
    try {
        return format(new Date(date), 'dd/MM/yyyy');
    } catch {
        return 'Fecha inválida';
    }
}

export default async function DocumentoPage({ params }: { params: { id: string } }) {
    const id = parseInt(params.id, 10);
    const doc = await getDocumentById(id);

    if (!doc) {
        notFound();
    }

    const renderJsonData = (data: any) => {
        if (!data) return <p className="text-sm text-muted-foreground">No hay datos extra.</p>;
        return (
            <pre className="text-sm bg-muted/50 p-4 rounded-lg overflow-x-auto">
                {JSON.stringify(data, null, 2)}
            </pre>
        );
    }

    return (
        <MainLayout>
            <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
                <MainLayoutHeader>
                    <div className="flex items-center justify-between space-y-2">
                        <div>
                            <h2 className="text-3xl font-bold tracking-tight">Detalles del Documento</h2>
                            <p className="text-muted-foreground">
                                Vista completa del documento: {doc.numero_factura}
                            </p>
                        </div>
                    </div>
                </MainLayoutHeader>
                <div className="grid gap-8">
                    <Card>
                        <CardHeader>
                            <CardTitle>Información General</CardTitle>
                            <CardDescription>{doc.tipo_documento}</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="grid md:grid-cols-3 gap-6 text-sm">
                                <div><span className="font-semibold block">Nº Documento</span>{doc.numero_factura}</div>
                                <div><span className="font-semibold block">Fecha Emisión</span>{formatDate(doc.fecha_emision)}</div>
                                <div><span className="font-semibold block">Fecha Vencimiento</span>{formatDate(doc.fecha_vencimiento)}</div>
                                <div><span className="font-semibold block">Fecha Creación</span>{formatDate(doc.fecha_creacion)}</div>
                                <div><span className="font-semibold block">Moneda</span>{doc.moneda}</div>
                                <div><span className="font-semibold block">Estado</span>
                                    {doc.incidencia ? (
                                        <Badge variant="destructive" className="flex items-center gap-2 w-fit mt-1">
                                            <AlertCircle className="h-4 w-4" />
                                            Con Incidencia
                                        </Badge>
                                    ) : (
                                        <Badge variant="secondary" className="flex items-center gap-2 w-fit mt-1">
                                            <CheckCircle2 className="h-4 w-4" />
                                            Verificado
                                        </Badge>
                                    )}
                                </div>
                            </div>
                            {doc.datos_extra && <div className="mt-6"><h4 className="font-semibold mb-2">Datos Extra del Documento</h4>{renderJsonData(doc.datos_extra)}</div>}
                        </CardContent>
                    </Card>

                    <div className="grid gap-8 md:grid-cols-2">
                        {doc.entidades.map((entidad, index) => (
                             <Card key={index}>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        {entidad.rol.toLowerCase().includes('proveedor') || entidad.rol.toLowerCase().includes('emisor') ? <Building /> : <User />}
                                        {entidad.rol}
                                    </CardTitle>
                                    <CardDescription>{entidad.nombre}</CardDescription>
                                </CardHeader>
                                <CardContent className="text-sm space-y-2">
                                    <p className="flex items-center gap-2"><Hash className="text-muted-foreground" /> {entidad.identificador_fiscal}</p>
                                    <p className="flex items-center gap-2"><Mail className="text-muted-foreground" /> {entidad.email || 'N/A'}</p>
                                    <p className="flex items-center gap-2"><Phone className="text-muted-foreground" /> {entidad.telefono || 'N/A'}</p>
                                    <p className="flex items-start gap-2"><FileText className="text-muted-foreground mt-1" /> <span className="flex-1">{entidad.direccion || 'N/A'}</span></p>
                                    {entidad.datos_extra && <div className="pt-4"><h4 className="font-semibold mb-2">Datos Extra de la Entidad</h4>{renderJsonData(entidad.datos_extra)}</div>}
                                </CardContent>
                            </Card>
                        ))}
                    </div>

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
                                            <TableCell>{line.codigo || 'N/A'}</TableCell>
                                            <TableCell>{line.descripcion}</TableCell>
                                            <TableCell className="text-right">{line.cantidad} {line.unidad}</TableCell>
                                            <TableCell className="text-right">{formatCurrency(line.precio_unitario, doc.moneda)}</TableCell>
                                            <TableCell className="text-right">{line.descuento_porcentaje}%</TableCell>
                                            <TableCell className="text-right font-medium">{formatCurrency(line.importe_linea, doc.moneda)}</TableCell>
                                        </TableRow>
                                    ))}
                                    {doc.lineas.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No hay líneas en este documento.</TableCell></TableRow>}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader><CardTitle>Detalles Financieros</CardTitle></CardHeader>
                        <CardContent>
                            <div className="grid md:grid-cols-2 gap-8">
                                <div>
                                    <h4 className="font-semibold mb-4 text-lg">Resumen de Impuestos</h4>
                                    <div className="space-y-2">
                                        {doc.iva_details.map((iva, index) => (
                                            <div key={index} className="flex justify-between items-center p-2 rounded-md bg-muted/50">
                                                <div className="flex items-center gap-2">
                                                    <IvaBadge iva={iva} />
                                                    <span>{`${iva.tipo_impuesto} (${iva.porcentaje}%)`}</span>
                                                </div>
                                                <span className="font-mono">{formatCurrency(iva.cuota, doc.moneda)}</span>
                                            </div>
                                        ))}
                                         {doc.iva_details.length === 0 && <p className="text-sm text-muted-foreground">No hay impuestos detallados.</p>}
                                    </div>
                                </div>
                                <div className="space-y-2 text-lg">
                                     <div className="flex justify-between font-medium"><span className="text-muted-foreground">Base Imponible</span><span>{formatCurrency(doc.base_imponible, doc.moneda)}</span></div>
                                     <div className="flex justify-between font-medium"><span className="text-muted-foreground">Total IVA</span><span>{formatCurrency(doc.iva, doc.moneda)}</span></div>
                                     <div className="flex justify-between font-bold text-primary text-xl border-t pt-2 mt-2"><span className="text-foreground">Total</span><span>{formatCurrency(doc.total, doc.moneda)}</span></div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                    
                    <Card>
                        <CardHeader><CardTitle>Archivos Adjuntos</CardTitle></CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Nombre Archivo</TableHead>
                                        <TableHead>Tipo</TableHead>
                                        <TableHead>Ruta</TableHead>
                                        <TableHead>Fecha Subida</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {doc.archivos.map((file, index) => (
                                         <TableRow key={index}>
                                            <TableCell>{file.nombre_archivo}</TableCell>
                                            <TableCell>{file.tipo_archivo}</TableCell>
                                            <TableCell className="truncate max-w-xs">{file.ruta_archivo}</TableCell>
                                            <TableCell>{formatDate(file.fecha_subida)}</TableCell>
                                        </TableRow>
                                    ))}
                                    {doc.archivos.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No hay archivos adjuntos.</TableCell></TableRow>}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                    
                    <Card>
                        <CardHeader><CardTitle>Observaciones</CardTitle></CardHeader>
                        <CardContent className="space-y-4">
                           <p className="text-sm text-muted-foreground border p-4 rounded-lg">{doc.observaciones || "No hay observaciones."}</p>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </MainLayout>
    );
}
