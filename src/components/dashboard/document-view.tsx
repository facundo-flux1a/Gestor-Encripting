'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle2, ShieldCheck, FileText, Info, Trash2, PlusCircle, Box, Search, ChevronLeft, ChevronRight, History, ArrowLeft, X, Calendar } from "lucide-react";
import { format } from 'date-fns';
import { type Document, type DocumentUpdatePayload } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import type { UseFormReturn } from "react-hook-form";
import { useFieldArray, useWatch } from "react-hook-form";
import { cn } from "@/lib/utils";
import React, { useMemo, useState, useEffect, KeyboardEvent, useRef } from "react";
import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useRouter } from 'next/navigation';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

const formatCurrency = (amount: number | string | null | undefined, currency: string = 'EUR'): string => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    if (!num && num !== 0) return 'N/A';
    const [int, dec] = num.toFixed(2).split('.');
    return `${int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${dec} €`;
};

const formatDate = (date: string | null | undefined) => {
    if (!date) return 'N/A';
    try {
        const d = new Date(date);
        return format(new Date(d.valueOf() + d.getTimezoneOffset() * 60 * 1000), 'dd/MM/yyyy');
    } catch { return 'Fecha inválida'; }
}

const formatDateForInput = (date: string | null | undefined): string => {
    if (!date) return '';
    try { return new Date(date).toISOString().split('T')[0]; }
    catch { return ''; }
}

interface DocumentViewProps {
    doc: Document;
    isEditing: boolean;
    form: UseFormReturn<DocumentUpdatePayload>;
}

const ITEMS_PER_PAGE = 5;

export function DocumentView({ doc, isEditing, form }: DocumentViewProps) {
    const router = useRouter();
    const { fields: lineaFields, append: appendLinea, remove: removeLinea } = useFieldArray({ control: form.control, name: "lineas" });
    const formValues = useWatch({ control: form.control });
    const [lineaFilters, setLineaFilters] = useState<string[]>([]);
    const [currentLineaSearch, setCurrentLineaSearch] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [trimestresDisponibles, setTrimestresDisponibles] = useState<any[]>([]);
    const [loadingTrimestres, setLoadingTrimestres] = useState(false);
    const [showTrimestreConfirm, setShowTrimestreConfirm] = useState(false);
    const [pendingTrimestre, setPendingTrimestre] = useState<{ año: number, trimestre: number, existe: boolean } | null>(null);
    const isInitializedRef = useRef(false);
    const provider = useMemo(() => doc.entidades.find(e => e.rol === 'proveedor' || e.rol === 'emisor'), [doc.entidades]);

    useEffect(() => {
        if (isEditing && !isInitializedRef.current && doc.lineas?.length > 0) {
            form.setValue('lineas', doc.lineas);
            isInitializedRef.current = true;
        }
        if (!isEditing) isInitializedRef.current = false;
    }, [isEditing, doc.lineas, form]);

    useEffect(() => {
        if (isEditing && doc.empresa_id) {
            setLoadingTrimestres(true);
            fetch(`/api/trimestres/disponibles?empresa_id=${doc.empresa_id}`)
                .then(res => res.json())
                .then(data => setTrimestresDisponibles(data))
                .catch(err => console.error('Error cargando trimestres:', err))
                .finally(() => setLoadingTrimestres(false));
        }
    }, [isEditing, doc.empresa_id]);

    const handleTrimestreChange = (value: string) => {
        const [año, trimestre] = value.split('-').map(Number);
        const trimestreInfo = trimestresDisponibles.find(t => t.año === año && t.trimestre === trimestre);
        setPendingTrimestre({ año, trimestre, existe: trimestreInfo?.existe || false });
        setShowTrimestreConfirm(true);
    };

    const confirmTrimestreChange = () => {
        if (pendingTrimestre) {
            form.setValue('año_trimestre', pendingTrimestre.año, { shouldDirty: true });
            form.setValue('num_trimestre', pendingTrimestre.trimestre, { shouldDirty: true });
            setShowTrimestreConfirm(false);
            setPendingTrimestre(null);
        }
    };

    const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter' && currentLineaSearch.trim()) {
            setLineaFilters([...lineaFilters, currentLineaSearch.trim()]);
            setCurrentLineaSearch('');
        }
    };

    const filteredLineaFields = useMemo(() => {
        let fields = lineaFields.map((field, index) => ({ field, originalIndex: index }));
        if (!lineaFilters.length) return fields;
        return fields.filter(({ field }) => lineaFilters.every(filter =>
            Object.values(field).some(value => value && String(value).toLowerCase().includes(filter.toLowerCase()))
        ));
    }, [lineaFields, lineaFilters]);

    const totalPages = Math.ceil(filteredLineaFields.length / ITEMS_PER_PAGE);
    const paginatedLineaFields = useMemo(() =>
        filteredLineaFields.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE),
        [filteredLineaFields, currentPage]);

    useEffect(() => setCurrentPage(1), [lineaFilters]);

    const renderEditableField = (fieldName: string, label: string, isCurrency = false, placeholder?: string) => (
        <FormField control={form.control} name={fieldName as keyof DocumentUpdatePayload} render={({ field }) => (
            <FormItem>
                <FormLabel className="text-muted-foreground text-xs sm:text-sm">{label}</FormLabel>
                <FormControl>
                    {isEditing ? (
                        <Input {...field} type={isCurrency ? 'number' : 'text'} step={isCurrency ? '0.01' : undefined}
                            className="h-8 sm:h-9 text-xs sm:text-sm" placeholder={placeholder} value={field.value ?? ''}
                            onChange={e => field.onChange(isCurrency ? (e.target.value === '' ? 0 : parseFloat(e.target.value)) : (e.target.value || null))}
                        />
                    ) : (
                        <p className="text-xs sm:text-sm font-medium break-words">
                            {isCurrency ? formatCurrency(field.value ?? doc[fieldName as keyof Document], doc.moneda) : (field.value ?? doc[fieldName as keyof Document] ?? 'N/A')}
                        </p>
                    )}
                </FormControl>
                <FormMessage />
            </FormItem>
        )} />
    );

    const renderEditableDate = (fieldName: string, label: string) => (
        <FormField control={form.control} name={fieldName as keyof DocumentUpdatePayload} render={({ field }) => (
            <FormItem>
                <FormLabel className="text-muted-foreground text-xs sm:text-sm">{label}</FormLabel>
                <FormControl>
                    {isEditing ? (
                        <Input type="date" className="h-8 sm:h-9 text-xs sm:text-sm"
                            value={formatDateForInput(field.value ?? doc[fieldName as keyof Document])}
                            onChange={e => field.onChange(e.target.value || null)}
                        />
                    ) : (
                        <p className="text-xs sm:text-sm font-medium">{formatDate(field.value ?? doc[fieldName as keyof Document])}</p>
                    )}
                </FormControl>
                <FormMessage />
            </FormItem>
        )} />
    );

    const getStatusBadge = () => {
        if (doc.incidencia) return <Badge variant="destructive" className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm"><AlertCircle className="h-3 w-3 sm:h-4 sm:w-4 shrink-0 animate-pulse" /> <span className="hidden xs:inline">Pendiente de Revisión</span><span className="xs:hidden">Pendiente</span></Badge>;
        if (doc.verificado) return <Badge variant="secondary" className="flex items-center gap-1.5 sm:gap-2 bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300 text-xs sm:text-sm"><ShieldCheck className="h-3 w-3 sm:h-4 sm:w-4 shrink-0" /> Validado</Badge>;
        return <Badge variant="secondary" className="flex items-center gap-1.5 sm:gap-2 bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300 text-xs sm:text-sm"><CheckCircle2 className="h-3 w-3 sm:h-4 sm:w-4 shrink-0" /> Verificado</Badge>;
    };

    // CONTINÚA EN PARTE 2...// CONTINUACIÓN DE PARTE 1

    return (
        <>
            <div className="mb-3 sm:mb-4 animate-fade-in">
                <Button variant="ghost" size="sm" onClick={() => router.back()} className="gap-1.5 sm:gap-2 h-8 sm:h-9 text-xs sm:text-sm group">
                    <ArrowLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0 group-hover:-translate-x-1" /> Volver
                </Button>
            </div>

            <Card className="mb-3 sm:mb-4 lg:mb-6 animate-fade-in">
                <CardHeader className="px-3 py-3 sm:px-4 lg:px-6 sm:py-4">
                    <CardTitle className="flex items-center gap-2 text-base sm:text-lg lg:text-xl bg-gradient-to-r from-blue-600 to-cyan-600 dark:from-blue-400 dark:to-cyan-400 bg-clip-text text-transparent">
                        <Info className="h-4 w-4 sm:h-5 sm:w-5 shrink-0 text-blue-600 dark:text-blue-400" /> Información General
                    </CardTitle>
                    {isEditing ? (
                        <div className="text-xs sm:text-sm text-muted-foreground mt-2">
                            <FormField control={form.control} name="tipo_documento" render={({ field }) => (
                                <FormItem><FormControl><Input {...field} placeholder="Tipo de Documento" className="text-xs sm:text-sm h-8 sm:h-9" value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                            )} />
                        </div>
                    ) : <CardDescription className="text-xs sm:text-sm mt-1">{doc.tipo_documento}</CardDescription>}
                </CardHeader>
                <CardContent className="px-3 sm:px-4 lg:px-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
                        {renderEditableField("numero_documento", "Nº Documento")}
                        {renderEditableDate("fecha_emision", "Fecha Emisión")}
                        {renderEditableDate("fecha_vencimiento", "Fecha Vencimiento")}
                        <FormItem>
                            <FormLabel className="text-muted-foreground text-xs sm:text-sm">Fecha Creación</FormLabel>
                            <p className="text-xs sm:text-sm font-medium">{formatDate(doc.fecha_creacion)}</p>
                        </FormItem>
                        {renderEditableField("moneda", "Moneda")}
                        <FormItem>
                            <FormLabel className="text-muted-foreground text-xs sm:text-sm flex items-center gap-1">
                                <Calendar className="h-3.5 w-3.5" /> Trimestre
                            </FormLabel>
                            {isEditing ? (
                                <Select value={`${formValues.año_trimestre || doc.año_trimestre}-${formValues.num_trimestre || doc.num_trimestre}`}
                                    onValueChange={handleTrimestreChange} disabled={loadingTrimestres}>
                                    <SelectTrigger className="h-8 sm:h-9 text-xs sm:text-sm">
                                        <SelectValue placeholder={loadingTrimestres ? "Cargando..." : "Seleccionar trimestre"} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {!trimestresDisponibles.length && !loadingTrimestres && <div className="p-2 text-xs text-muted-foreground text-center">No hay trimestres disponibles</div>}
                                        {trimestresDisponibles.map((t) => (
                                            <SelectItem key={`${t.año}-${t.trimestre}`} value={`${t.año}-${t.trimestre}`}>
                                                {t.año} - T{t.trimestre}
                                                {!t.existe && <Badge variant="outline" className="text-[10px] ml-1 bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400 border-green-300 dark:border-green-800">Crear nuevo</Badge>}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            ) : <p className="text-xs sm:text-sm font-medium">{doc.año_trimestre && doc.num_trimestre ? `${doc.año_trimestre} - T${doc.num_trimestre}` : 'N/A'}</p>}
                        </FormItem>
                        <FormItem>
                            <FormLabel className="text-muted-foreground text-xs sm:text-sm">Estado</FormLabel>
                            {getStatusBadge()}
                        </FormItem>
                    </div>
                    {/* SECCIÓN DE INCIDENCIAS MÚLTIPLES */}
                    {doc.incidencias && doc.incidencias.length > 0 ? (
                        <div className="mt-4 sm:mt-6 space-y-2">
                            {doc.incidencias.filter(i => !i.validado).map((incidencia) => (
                                <Alert key={incidencia.id} variant="destructive" className="text-xs sm:text-sm animate-in slide-in-from-top-2 fade-in duration-300">
                                    <AlertCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                                    <AlertTitle className="text-sm sm:text-base font-semibold">Incidencia #{incidencia.id}</AlertTitle>
                                    <AlertDescription className="text-xs sm:text-sm">{incidencia.descripcion}</AlertDescription>
                                </Alert>
                            ))}
                        </div>
                    ) : doc.incidencia && doc.incidencia_razon && (
                        /* FALLBACK PARA LEGACY SI NO HAY ARRAY DE INCIDENCIAS */
                        <Alert variant="destructive" className="mt-4 sm:mt-6 text-xs sm:text-sm">
                            <AlertCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                            <AlertTitle className="text-sm sm:text-base font-semibold">Incidencia Detectada</AlertTitle>
                            <AlertDescription className="text-xs sm:text-sm">{doc.incidencia_razon}</AlertDescription>
                        </Alert>
                    )}
                </CardContent>
            </Card>

            <AlertDialog open={showTrimestreConfirm} onOpenChange={setShowTrimestreConfirm}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                            <Calendar className="h-5 w-5 text-primary" />
                            {pendingTrimestre?.existe ? '¿Mover documento a este trimestre?' : '¿Crear y mover a nuevo trimestre?'}
                        </AlertDialogTitle>
                        <AlertDialogDescription className="space-y-3">
                            <p>Estás preparando el documento para moverlo al trimestre <strong className="text-foreground">{pendingTrimestre?.año} - T{pendingTrimestre?.trimestre}</strong>.</p>
                            {!pendingTrimestre?.existe && (
                                <div className="flex items-start gap-2 p-3 rounded-md bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800">
                                    <Info className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
                                    <div className="text-xs text-green-800 dark:text-green-300">
                                        <p className="font-semibold">Este trimestre aún no existe</p>
                                        <p>Se creará automáticamente al guardar el documento.</p>
                                    </div>
                                </div>
                            )}
                            <p className="text-xs text-muted-foreground"><strong>Importante:</strong> El cambio no se aplicará hasta que presiones el botón verde "Guardar".</p>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => { setShowTrimestreConfirm(false); setPendingTrimestre(null); }}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmTrimestreChange}>Preparar cambio</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <Card className="animate-fade-in">
                <CardHeader className="px-3 py-3 sm:px-4 lg:px-6 sm:py-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 sm:h-5 sm:w-5 shrink-0 text-primary" />
                            <CardTitle className="text-base sm:text-lg lg:text-xl bg-gradient-to-r from-purple-600 to-pink-600 dark:from-purple-400 dark:to-pink-400 bg-clip-text text-transparent">Líneas del Documento</CardTitle>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="relative flex-1 sm:flex-none group">
                                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground shrink-0" />
                                <Input placeholder="Buscar y Enter..." value={currentLineaSearch} onChange={(e) => setCurrentLineaSearch(e.target.value)}
                                    onKeyDown={handleSearchKeyDown} className="h-8 sm:h-9 pl-7 sm:pl-8 w-full sm:w-40 lg:w-56 text-xs sm:text-sm" />
                            </div>
                            {isEditing && (
                                <Button type="button" size="sm" variant="outline" onClick={() => appendLinea({ codigo: '', descripcion: '', cantidad: 1, unidad: 'unidad', precio_unitario: 0, descuento_porcentaje: 0, precio_neto: 0, importe_linea: 0, datos_extra: null })}
                                    className="h-8 sm:h-9 gap-1.5 sm:gap-2 text-xs sm:text-sm shrink-0">
                                    <PlusCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" /> <span className="hidden xs:inline">Añadir</span><span className="xs:hidden">+</span>
                                </Button>
                            )}
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="px-3 sm:px-4 lg:px-6">
                    {lineaFilters.length > 0 && (
                        <div className="flex items-center gap-2 flex-wrap mb-3 sm:mb-4">
                            <span className="text-xs sm:text-sm font-medium text-muted-foreground">Filtros:</span>
                            {lineaFilters.map((filter) => (
                                <Badge key={filter} variant="secondary" className="pl-2 text-xs">
                                    {filter}
                                    <Button variant="ghost" size="icon" className="ml-1 h-4 w-4 sm:h-5 sm:w-5 p-0 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-full"
                                        onClick={() => setLineaFilters(lineaFilters.filter(f => f !== filter))}>
                                        <X className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                                    </Button>
                                </Badge>
                            ))}
                        </div>
                    )}
                    <div className="space-y-3 sm:space-y-4">
                        {paginatedLineaFields.map(({ field, originalIndex }) => {
                            const currentLinea = formValues.lineas?.[originalIndex] || field;
                            return (
                                <div key={field.id} className={cn("p-3 sm:p-4 rounded-lg transition-all", isEditing ? "bg-muted/30 border hover:shadow-md" : "border-b last:border-b-0 hover:bg-accent/5")}>
                                    {isEditing ? (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                                            <FormField control={form.control} name={`lineas.${originalIndex}.descripcion`} render={({ field }) => (
                                                <FormItem className="sm:col-span-2"><FormLabel className="text-xs sm:text-sm">Descripción</FormLabel><FormControl><Textarea {...field} value={field.value ?? ''} placeholder="Descripción" className="text-xs sm:text-sm min-h-[60px] sm:min-h-[80px]" /></FormControl></FormItem>
                                            )} />
                                            <FormField control={form.control} name={`lineas.${originalIndex}.codigo`} render={({ field }) => (<FormItem><FormLabel className="text-xs sm:text-sm">Código</FormLabel><FormControl><Input {...field} value={field.value ?? ''} placeholder="SKU-123" className="h-8 sm:h-9 text-xs sm:text-sm" /></FormControl></FormItem>)} />
                                            <FormField control={form.control} name={`lineas.${originalIndex}.cantidad`} render={({ field }) => (<FormItem><FormLabel className="text-xs sm:text-sm">Cantidad</FormLabel><FormControl><Input type="number" step="0.01" {...field} value={field.value ?? 0} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} className="h-8 sm:h-9 text-xs sm:text-sm" /></FormControl></FormItem>)} />
                                            <FormField control={form.control} name={`lineas.${originalIndex}.precio_unitario`} render={({ field }) => (<FormItem><FormLabel className="text-xs sm:text-sm">P. Unitario</FormLabel><FormControl><Input type="number" step="0.01" {...field} value={field.value ?? 0} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} className="h-8 sm:h-9 text-xs sm:text-sm" /></FormControl></FormItem>)} />
                                            <FormField control={form.control} name={`lineas.${originalIndex}.descuento_porcentaje`} render={({ field }) => (<FormItem><FormLabel className="text-xs sm:text-sm">Dto. %</FormLabel><FormControl><Input type="number" step="0.01" {...field} value={field.value ?? 0} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} className="h-8 sm:h-9 text-xs sm:text-sm" /></FormControl></FormItem>)} />
                                            <FormField control={form.control} name={`lineas.${originalIndex}.importe_linea`} render={({ field }) => (<FormItem><FormLabel className="text-xs sm:text-sm">Importe</FormLabel><FormControl><Input type="number" step="0.01" {...field} value={field.value ?? 0} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} className="h-8 sm:h-9 text-xs sm:text-sm font-bold" /></FormControl></FormItem>)} />
                                            <div className="flex justify-end sm:col-span-2">
                                                <Button type="button" variant="ghost" size="icon" onClick={() => removeLinea(originalIndex)} className="h-8 w-8 sm:h-9 sm:w-9 hover:bg-red-50 dark:hover:bg-red-950/20">
                                                    <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-destructive" />
                                                </Button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4 group">
                                            <Box className="h-6 w-6 sm:h-8 sm:w-8 text-primary shrink-0 mt-0.5 sm:mt-1 hidden sm:block" />
                                            <div className="flex-1 min-w-0">
                                                <p className="font-semibold text-sm sm:text-base break-words">{currentLinea.descripcion}</p>
                                                <p className="text-xs sm:text-sm text-muted-foreground font-mono break-all">{currentLinea.codigo}</p>
                                                <div className="flex items-center gap-2 sm:gap-4 mt-1.5 sm:mt-2 flex-wrap">
                                                    <Badge variant="secondary" className="text-[10px] sm:text-xs">Cant: <span className="tabular-nums">{Math.round(currentLinea.cantidad)}</span></Badge>
                                                    <Badge variant="outline" className="text-[10px] sm:text-xs text-destructive border-destructive/50">Dto: <span className="tabular-nums">{currentLinea.descuento_porcentaje || 0}%</span></Badge>
                                                    {provider && currentLinea.codigo && (
                                                        <Button size="sm" variant="link" asChild className="p-0 h-auto text-xs sm:text-sm">
                                                            <Link href={`/proveedores/${encodeURIComponent(provider.identificador_fiscal!)}/${encodeURIComponent(currentLinea.codigo)}`}>
                                                                <History className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4 shrink-0" />
                                                                <span className="hidden xs:inline">Ver Historial</span><span className="xs:hidden">Historial</span>
                                                            </Link>
                                                        </Button>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="shrink-0 text-right space-y-1 sm:space-y-2">
                                                <p className="font-bold text-base sm:text-lg lg:text-xl text-primary tabular-nums">{formatCurrency(currentLinea.importe_linea, doc.moneda)}</p>
                                                <p className="text-xs sm:text-sm text-muted-foreground tabular-nums">{formatCurrency(currentLinea.precio_unitario, doc.moneda)} / {currentLinea.unidad}</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                        {!filteredLineaFields.length && (
                            <div className="text-center text-muted-foreground py-6 sm:py-8">
                                <Search className="mx-auto h-10 w-10 sm:h-12 sm:w-12 text-gray-400 animate-pulse" />
                                <h3 className="mt-2 text-sm sm:text-base font-medium">No se encontraron líneas</h3>
                                <p className="mt-1 text-xs sm:text-sm text-gray-500">{lineaFilters.length ? "Prueba con otro término." : "No hay líneas."}</p>
                            </div>
                        )}
                    </div>
                    {totalPages > 1 && (
                        <div className="flex flex-col xs:flex-row items-center justify-between sm:justify-end gap-2 pt-3 sm:pt-4">
                            <span className="text-xs sm:text-sm text-muted-foreground order-2 xs:order-1">Página {currentPage} de {totalPages}</span>
                            <div className="flex items-center gap-2 order-1 xs:order-2">
                                <Button variant="outline" size="sm" type="button" onClick={() => setCurrentPage(p => Math.max(p - 1, 1))} disabled={currentPage === 1} className="h-8 sm:h-9 text-xs sm:text-sm gap-1">
                                    <ChevronLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> <span className="hidden xs:inline">Anterior</span>
                                </Button>
                                <Button variant="outline" size="sm" type="button" onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))} disabled={currentPage === totalPages} className="h-8 sm:h-9 text-xs sm:text-sm gap-1">
                                    <span className="hidden xs:inline">Siguiente</span> <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                                </Button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </>
    );
}