
'use client';

import { MainLayout, MainLayoutHeader } from "@/components/layout/main-layout";
import { useParams, notFound } from "next/navigation";
import { useEffect, useState, useMemo } from "react";
import { getProductHistory } from "@/services/document-service";
import type { DocumentLine } from "@/lib/types";
import { Loader2, Package, Tag, FileText, Calendar, Link as LinkIcon, Euro, ShoppingCart, TrendingUp } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StatsCard } from "@/components/dashboard/stats-card";
import { ProductHistoryCharts } from "@/components/dashboard/product-history-charts";


const formatCurrency = (amount: number | string | null | undefined, currency: string = 'EUR') => {
    if (amount === null || amount === undefined) return 'N/A';
    let numericAmount: number;
    if (typeof amount === 'string') {
        numericAmount = parseFloat(amount);
    } else {
        numericAmount = amount;
    }
    if (isNaN(numericAmount)) return 'N/A';
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency }).format(numericAmount);
};

const formatDate = (date: string | null | undefined) => {
    if (!date) return 'N/A';
    try {
        const d = new Date(date);
        const utcDate = new Date(d.valueOf() + d.getTimezoneOffset() * 60 * 1000);
        return new Intl.DateTimeFormat('es-ES', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(utcDate);
    } catch {
        return 'Fecha inválida';
    }
}

export default function ProductDetailPage() {
    const params = useParams();
    const [productInfo, setProductInfo] = useState<DocumentLine | null>(null);
    const [history, setHistory] = useState<DocumentLine[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const providerId = params.name as string;
        const productCode = params.code as string;

        if (providerId && productCode) {
            async function fetchData() {
                setIsLoading(true);
                try {
                    const decodedProviderId = decodeURIComponent(providerId);
                    const decodedProductCode = decodeURIComponent(productCode);

                    const { productInfo, history } = await getProductHistory(decodedProviderId, decodedProductCode);

                    if (!productInfo) {
                        notFound();
                        return;
                    }

                    setProductInfo(productInfo);
                    setHistory(history);

                } catch (error) {
                    console.error("Failed to fetch product history", error);
                } finally {
                    setIsLoading(false);
                }
            }
            fetchData();
        } else {
            notFound();
        }
    }, [params]);
    
    const stats = useMemo(() => {
        if (history.length === 0) {
            return {
                averagePrice: 0,
                totalSpent: 0,
                totalQuantity: 0,
            };
        }
        
        const totalSpent = history.reduce((acc, item) => acc + (item.importe_linea || 0), 0);
        const totalQuantity = history.reduce((acc, item) => acc + (item.cantidad || 0), 0);
        const averagePrice = totalQuantity > 0 ? totalSpent / totalQuantity : 0;
        
        return { averagePrice, totalSpent, totalQuantity };

    }, [history]);

    if (isLoading) {
        return (
             <MainLayout>
                <div className="flex flex-1 items-center justify-center">
                     <Loader2 className="h-10 w-10 animate-spin text-primary" />
                </div>
            </MainLayout>
        )
    }

    if (!productInfo) {
        return notFound();
    }

    return (
        <MainLayout>
            <div className="flex-1 space-y-8 p-4 pt-6 md:p-8">
                <MainLayoutHeader>
                    <div className="flex items-center justify-between space-y-2">
                        <div>
                             <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                                <Package className="h-8 w-8 text-primary" />
                                {productInfo.descripcion}
                            </h2>
                            <p className="text-muted-foreground flex items-center gap-2 font-mono">
                                <Tag className="h-4 w-4" />
                                {productInfo.codigo}
                            </p>
                        </div>
                    </div>
                </MainLayoutHeader>
                
                <section className="grid gap-4 md:grid-cols-3">
                    <StatsCard title="Precio Promedio Ponderado" value={formatCurrency(stats.averagePrice)} icon={Euro} />
                    <StatsCard title="Total Gastado" value={formatCurrency(stats.totalSpent)} icon={ShoppingCart} />
                    <StatsCard title="Total Comprado" value={`${stats.totalQuantity.toLocaleString('es-ES')} unidades`} icon={TrendingUp} />
                </section>

                <section>
                    <ProductHistoryCharts history={history} />
                </section>

                <section>
                    <h3 className="text-2xl font-semibold tracking-tight mb-4 flex items-center gap-2">
                        <FileText className="h-6 w-6" />
                        Historial de Compras Detallado
                    </h3>
                    <div className="rounded-lg border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead><Calendar className="h-4 w-4 inline-block mr-2" />Fecha Emisión</TableHead>
                                    <TableHead>Nº Documento</TableHead>
                                    <TableHead className="text-right">Cantidad</TableHead>
                                    <TableHead className="text-right"><Euro className="h-4 w-4 inline-block mr-2" />P. Unitario</TableHead>
                                    <TableHead className="text-right"><Euro className="h-4 w-4 inline-block mr-2" />Total Línea</TableHead>
                                    <TableHead className="text-center">Acciones</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {history.map((item) => (
                                    <TableRow key={item.id}>
                                        <TableCell>{formatDate(item.fecha_emision)}</TableCell>
                                        <TableCell className="font-medium">{item.numero_documento}</TableCell>
                                        <TableCell className="text-right">
                                            <Badge variant="secondary">{item.cantidad} {item.unidad}</Badge>
                                        </TableCell>
                                        <TableCell className="text-right">{formatCurrency(item.precio_unitario)}</TableCell>
                                        <TableCell className="text-right font-semibold">{formatCurrency(item.importe_linea)}</TableCell>
                                        <TableCell className="text-center">
                                            <Button variant="outline" size="sm" asChild>
                                                <Link href={`/documento/${item.documento_id}`}>
                                                    <LinkIcon className="h-4 w-4 mr-2" />
                                                    Ver Doc.
                                                </Link>
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </section>
            </div>
        </MainLayout>
    );
}
