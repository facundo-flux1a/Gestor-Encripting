'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Info, AlertCircle, CheckCircle2, RotateCw, X, Eye, PlusCircle, History, Trash2, ShieldCheck, Sparkles as SparklesIcon } from 'lucide-react';
import { DocumentView } from './document-view';
import { FinancialDetailsCard } from './financial-details-card';
import { EditableEntityCard } from './editable-entity-card';
import { type Document, type DocumentUpdatePayload } from '@/lib/types';
import { UseFormReturn, useFieldArray } from 'react-hook-form';
import { Form } from '@/components/ui/form';
import { cn, fixMinioUrl } from '@/lib/utils';
import { toggleContextItem, deleteHistoryItem, type Incident as AIIncident } from '@/services/vertex-ai-service';
import { useToast } from "@/hooks/use-toast";

interface AuditSplitViewProps {
    doc: Document;
    form: UseFormReturn<DocumentUpdatePayload>;
    suggestions: AIIncident[];
    onClose: () => void;
    isFixed: boolean;
    onSubmit: (data: DocumentUpdatePayload) => Promise<void>;
    isSaving: boolean;
    onHistoryUpdate: () => void;
    checkType?: string;
    motivo?: string;
}

export function AuditSplitView({
    doc,
    form,
    suggestions: currentSuggestions,
    onClose,
    isFixed,
    onSubmit,
    isSaving,
    onHistoryUpdate,
    checkType = 'MISMATCH_MATEMATICO',
    motivo = ''
}: AuditSplitViewProps) {
    const { toast } = useToast();
    const [iframeKey, setIframeKey] = React.useState(0);
    const documentUrl = doc.archivos?.[0]?.ruta_archivo;
    const documentName = doc.archivos?.[0]?.nombre_archivo || `documento_${doc.id_documento}.pdf`;

    const { fields: entidadFields, append: appendEntidad, remove: removeEntidad } = useFieldArray({
        control: form.control,
        name: "entidades"
    });

    const rawDocumentUrl = fixMinioUrl(documentUrl || '');
    // Para el visor del PDF en auditoría usamos embed directo (evita descarga automática de Google Docs Viewer)
    const pdfViewerUrl = rawDocumentUrl ? `${rawDocumentUrl}#toolbar=1&navpanes=0&scrollbar=1` : '';

    const handleToggleContext = async (id: number, current: boolean) => {
        const res = await toggleContextItem(id, !current);
        if (res.success) {
            onHistoryUpdate();
        }
    };

    const handleDeleteItem = async (id: number) => {
        const res = await deleteHistoryItem(id);
        if (res.success) {
            onHistoryUpdate();
            toast({ title: "Hallazgo eliminado", description: "Se ha quitado del historial." });
        }
    };

    // Agrupar historial por número de análisis (Vienen del padre centralizado)
    const groupedHistory = React.useMemo(() => {
        const groups: Record<number, AIIncident[]> = {};

        currentSuggestions.forEach(h => {
            const nro = h.analisis_nro || 0;
            if (!groups[nro]) groups[nro] = [];
            groups[nro].push(h);
        });

        return groups;
    }, [currentSuggestions]);

    return (
        <div className="fixed inset-0 z-50 bg-background flex flex-col animate-in fade-in duration-300">
            {/* Header */}
            <header className="h-14 border-b px-4 flex items-center justify-between bg-card shrink-0">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={onClose}>
                        <X className="h-5 w-5" />
                    </Button>
                    <div>
                        <h2 className="text-sm font-bold truncate max-w-[200px] sm:max-w-md">
                            Modo Auditoría: {documentName}
                        </h2>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">Muvail AI · Auditoría Inteligente</span>
                            {isFixed ? (
                                <Badge variant="secondary" className="bg-green-500/10 text-green-500 border-none text-[10px] py-0 h-4 uppercase font-bold tracking-tighter">
                                    <CheckCircle2 className="h-2.5 w-2.5 mr-1" /> Documento Cuadrado
                                </Badge>
                            ) : checkType === 'FECHA_ANOMALA' || checkType === 'ENTIDAD_DUPLICADA' ? (
                                <Badge variant="secondary" className="bg-orange-500/10 text-orange-500 border-none text-[10px] py-0 h-4 uppercase font-bold tracking-tighter">
                                    <AlertCircle className="h-2.5 w-2.5 mr-1" /> Alerta Lógica Activa
                                </Badge>
                            ) : (
                                <Badge variant="secondary" className="bg-violet-500/10 text-violet-500 border-none text-[10px] py-0 h-4 uppercase font-bold tracking-tighter">
                                    <AlertCircle className="h-2.5 w-2.5 mr-1" /> Descuadre Activo
                                </Badge>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        type="submit"
                        size="sm"
                        form="audit-form"
                        className="bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-500/20"
                        disabled={isSaving || !form.formState.isDirty}
                    >
                        {isSaving ? (
                            <RotateCw className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                            <CheckCircle2 className="h-4 w-4 mr-2" />
                        )}
                        {isSaving ? 'Guardando...' : 'Guardar Cambios'}
                    </Button>
                </div>
            </header>

            {/* Main Split Layout */}
            <div className="flex-1 flex overflow-hidden">
                {/* Left Panel: Editor & Suggestions (Formulario) */}
                <div className="w-5/12 flex flex-col bg-background border-r overflow-hidden shadow-xl z-10">
                    <ScrollArea className="flex-1">
                        <div className="p-4 space-y-6 pb-20">
                            {/* Logic Alert Panel */}
                            {!isFixed && checkType !== 'MISMATCH_MATEMATICO' && (
                                <div className="p-4 rounded-xl bg-orange-500/5 border border-orange-500/20 text-center space-y-2 animate-in zoom-in-95 duration-500">
                                    <div className="h-10 w-10 bg-orange-500/20 text-orange-600 rounded-full flex items-center justify-center mx-auto">
                                        <AlertCircle className="h-5 w-5" />
                                    </div>
                                    <h4 className="text-sm font-bold text-orange-700 dark:text-orange-400">
                                        {checkType === 'FECHA_ANOMALA' ? 'Fecha Anómala' : 'Entidad Duplicada'}
                                    </h4>
                                    <p className="text-xs text-muted-foreground italic">
                                        {motivo || 'Revisa la información del documento.'}
                                    </p>
                                </div>
                            )}

                            {/* Mensaje de Felicidades si ya está Healthy */}
                            {isFixed && (
                                <div className="p-4 rounded-xl bg-green-500/5 border border-green-500/20 text-center space-y-2 animate-in zoom-in-95 duration-500">
                                    <div className="h-10 w-10 bg-green-500/20 text-green-600 rounded-full flex items-center justify-center mx-auto">
                                        <CheckCircle2 className="h-5 w-5" />
                                    </div>
                                    <h4 className="text-sm font-bold text-green-700 dark:text-green-400">Documento Cuadrado</h4>
                                    <p className="text-xs text-muted-foreground italic">
                                        Los totales coinciden perfectamente con los impuestos desglosados.
                                    </p>
                                </div>
                            )}

                            {/* Editor Form */}
                            <div className="space-y-4">
                                <Form {...form}>
                                    <form
                                        id="audit-form"
                                        className="contents"
                                        onSubmit={form.handleSubmit(onSubmit)}
                                    >
                                        <div className="space-y-4">
                                            
                                            {/* 1. Entidades Compactas */}
                                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                                {entidadFields.map((field, index) => (
                                                    <EditableEntityCard
                                                        key={field.id}
                                                        isEditing={true}
                                                        form={form}
                                                        entityIndex={index}
                                                        removeEntity={() => removeEntidad(index)}
                                                    />
                                                ))}
                                            </div>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={() => appendEntidad({
                                                    rol: 'Otro',
                                                    nombre: '',
                                                    direccion: '',
                                                    identificador_fiscal: '',
                                                    telefono: '',
                                                    email: '',
                                                    datos_extra: null
                                                })}
                                                className="w-full border-dashed text-xs"
                                            >
                                                <PlusCircle className="mr-2 h-3.5 w-3.5" />
                                                Añadir Entidad
                                            </Button>

                                            {/* 2. Información General (Compacta, sin líneas) */}
                                            <DocumentView doc={doc} isEditing={true} form={form} hideLines={true} />

                                            {/* 3. Desglose Financiero y Totales */}
                                            <div className="pt-2">
                                                <FinancialDetailsCard
                                                    doc={doc}
                                                    isEditing={true}
                                                    form={form}
                                                />
                                            </div>

                                        </div>
                                    </form>
                                </Form>
                            </div>


                            {/* AI Context & History Manager - SOLO SI NO ESTÁ CUADRADO Y ES DESCUADRE MATEMATICO */}
                            {!isFixed && checkType === 'MISMATCH_MATEMATICO' && (
                                <div className="space-y-4 animate-in slide-in-from-right-4 duration-500 mt-8 pt-8 border-t">
                                    <h3 className="text-sm font-bold flex items-center justify-between text-violet-500 dark:text-violet-400">
                                        <div className="flex items-center gap-2">
                                            <History className="h-4 w-4" />
                                            Historial de Auditoría IA
                                        </div>
                                        <Badge variant="outline" className="text-[10px] border-violet-500/30 text-violet-500">
                                            {Object.keys(groupedHistory).length} Intentos
                                        </Badge>
                                    </h3>

                                    <div className="space-y-4">
                                        {Object.entries(groupedHistory).sort((a, b) => Number(b[0]) - Number(a[0])).map(([nro, items]) => (
                                            <div key={nro} className="space-y-3">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] font-black uppercase text-muted-foreground tracking-tighter">Análisis Nº{nro}</span>
                                                    <div className="h-px flex-1 bg-border/50" />
                                                </div>

                                                {items.map((s, i) => (
                                                    <div key={s.id || i} className={cn(
                                                        "p-4 rounded-xl border transition-all duration-300 relative overflow-hidden group shadow-sm",
                                                        s.include_in_context ? "bg-violet-500/5 border-violet-500/20" : "bg-muted/30 border-transparent opacity-60 grayscale-[0.5]"
                                                    )}>
                                                        <div className={cn(
                                                            "absolute top-0 left-0 w-1.5 h-full opacity-60",
                                                            s.include_in_context ? "bg-violet-500" : "bg-muted-foreground"
                                                        )} />

                                                        <div className="flex justify-between items-start gap-4">
                                                            <div className="flex-1 space-y-1">
                                                                <p className="text-xs font-bold text-foreground leading-snug">{s.descripcion}</p>
                                                            </div>

                                                            <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-6 w-6 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                                                                    onClick={() => s.id && handleDeleteItem(s.id)}
                                                                >
                                                                    <Trash2 className="h-3 w-3" />
                                                                </Button>
                                                            </div>
                                                        </div>

                                                        <div className={cn(
                                                            "mt-2 p-2 rounded-lg border shadow-inner",
                                                            s.include_in_context ? "bg-violet-500/10 border-violet-500/10" : "bg-muted/50 border-transparent"
                                                        )}>
                                                            <p className={cn(
                                                                "text-[11px] leading-relaxed font-medium italic",
                                                                s.include_in_context ? "text-violet-700 dark:text-violet-300" : "text-muted-foreground"
                                                            )}>
                                                                "{s.sugerencia}"
                                                            </p>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                        </div>
                    </ScrollArea>
                </div>

                {/* Right Panel: Document Viewer (PDF) */}
                <div className="w-7/12 bg-muted/10 relative group">
                    {documentUrl ? (
                        <>
                            <object
                                key={iframeKey}
                                data={pdfViewerUrl}
                                type="application/pdf"
                                className="w-full h-full border-0"
                                title="Document Preview"
                            >
                                {/* Fallback si el browser no soporta object embed */}
                                <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
                                    <Eye className="h-10 w-10 opacity-20" />
                                    <p className="text-sm">El visor no pudo cargar el PDF.</p>
                                    <Button variant="outline" size="sm" onClick={() => window.open(rawDocumentUrl, '_blank')}>
                                        Abrir en nueva pestaña
                                    </Button>
                                </div>
                            </object>
                            {/* Toolbar panel derecho */}
                            <div className="absolute top-4 right-4 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button
                                    variant="secondary"
                                    size="icon"
                                    className="h-8 w-8 shadow-lg bg-background/80 backdrop-blur"
                                    onClick={() => setIframeKey(prev => prev + 1)}
                                    title="Recargar visor"
                                >
                                    <RotateCw className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant="secondary"
                                    size="icon"
                                    className="h-8 w-8 shadow-lg bg-background/80 backdrop-blur"
                                    onClick={() => window.open(documentUrl, '_blank')}
                                    title="Abrir en pestaña nueva"
                                >
                                    <Eye className="h-4 w-4" />
                                </Button>
                            </div>
                        </>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                            <Eye className="h-12 w-12 mb-4 opacity-20" />
                            <p>No hay archivo para previsualizar</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Custom Styles for Independent Scrolling */}
            <style jsx global>{`
                .fixed-layout {
                    height: 100vh;
                    overflow: hidden;
                }
            `}</style>
        </div>
    );
}
