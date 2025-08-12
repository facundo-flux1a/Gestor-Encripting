import { MainLayout, MainLayoutHeader } from "@/components/layout/main-layout";
import { getDocumentById } from "@/services/document-service";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { IvaBadge } from "@/components/dashboard/iva-badge";
import { AlertCircle, CheckCircle2 } from "lucide-react";

const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-ES', {
        style: 'currency',
        currency: 'EUR',
    }).format(amount);
};

export default async function DocumentoPage({ params }: { params: { id: string } }) {
    const id = parseInt(params.id, 10);
    const doc = await getDocumentById(id);

    if (!doc) {
        notFound();
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
                <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
                    <Card className="lg:col-span-2">
                        <CardHeader>
                            <CardTitle>Información General</CardTitle>
                            <CardDescription>{doc.tipo_documento}</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <table className="w-full text-sm">
                                <tbody>
                                    <tr className="border-b"><td className="font-semibold p-2">Nº Factura</td><td className="p-2">{doc.numero_factura}</td></tr>
                                    <tr className="border-b"><td className="font-semibold p-2">Fecha</td><td className="p-2">{new Date(doc.fecha_subida).toLocaleDateString('es-ES')}</td></tr>
                                    <tr className="border-b"><td className="font-semibold p-2">Proveedor/Cliente</td><td className="p-2">{doc.proveedor}</td></tr>
                                    <tr className="border-b"><td className="font-semibold p-2">CIF</td><td className="p-2">{doc.cif}</td></tr>
                                    <tr className="border-b"><td className="font-semibold p-2">Nombre Archivo</td><td className="p-2">{doc.nombre_archivo}</td></tr>
                                </tbody>
                            </table>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader>
                            <CardTitle>Detalles Financieros</CardTitle>
                        </CardHeader>
                        <CardContent>
                             <table className="w-full text-sm">
                                <tbody>
                                    <tr className="border-b"><td className="font-semibold p-2">Base Imponible</td><td className="p-2 text-right">{formatCurrency(doc.base_imponible)}</td></tr>
                                    {doc.iva_details.map((iva, index) => (
                                        <tr key={index} className="border-b">
                                            <td className="font-semibold p-2 pl-6 flex items-center gap-2">
                                                <IvaBadge iva={iva} />
                                                {`${iva.tipo_impuesto} (${iva.porcentaje}%)`}
                                            </td>
                                            <td className="p-2 text-right">{formatCurrency(iva.cuota)}</td>
                                        </tr>
                                    ))}
                                    <tr className="border-b"><td className="font-semibold p-2">Total IVA</td><td className="p-2 text-right font-bold">{formatCurrency(doc.iva)}</td></tr>
                                    <tr><td className="font-semibold p-2 text-lg">Total</td><td className="p-2 text-right font-bold text-lg">{formatCurrency(doc.total)}</td></tr>
                                </tbody>
                            </table>
                        </CardContent>
                    </Card>

                    <Card className="lg:col-span-3">
                        <CardHeader>
                            <CardTitle>Observaciones y Estado</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                           <p className="text-sm text-muted-foreground border p-4 rounded-lg">{doc.contenido || "No hay observaciones."}</p>
                           <div>
                                {doc.incidencia ? (
                                    <Badge variant="destructive" className="flex items-center gap-2 w-fit">
                                        <AlertCircle className="h-4 w-4" />
                                        Con Incidencia
                                    </Badge>
                                ) : (
                                    <Badge variant="secondary" className="flex items-center gap-2 w-fit">
                                        <CheckCircle2 className="h-4 w-4" />
                                        Verificado
                                    </Badge>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                </div>
            </div>
        </MainLayout>
    );
}
