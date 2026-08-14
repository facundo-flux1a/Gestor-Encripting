'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCompanyContext } from '@/context/CompanyProvider';
import { MainLayout } from '@/components/layout/main-layout';
import { PageHeader } from '@/components/layout/page-header';
import { getHealthCheckAnalytics } from '@/services/document-service';
import { diagnoseDocument } from '@/services/vertex-ai-service';
import { type Document } from '@/lib/types';
import {
    ShieldCheck,
    AlertCircle,
    CheckCircle2,
    AlertTriangle,
    ArrowRight,
    FileText,
    Search,
    Filter,
    RefreshCw,
    Eye,
    Info,
    Sparkles,
    Loader2
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { FiscalAuditConfirmDialog } from '@/components/dashboard/fiscal-audit-confirm-dialog';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { HealthCheckProvider } from '@/context/HealthCheckProvider';
import { HealthCheckTutorialRouter } from '@/components/tutorials/HealthCheckTutorialRouter';

export default function HealthCheckPage() {
    const router = useRouter(); // Initialize router
    const { selectedCompanyIds } = useCompanyContext();
    const [data, setData] = useState<{
        summary: { total: number; mismatches: number; logic_checks: number };
        documents: Document[];
        triggeredDiagnoses?: number[];
    } | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isPolling, setIsPolling] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    // AI Diagnosis State
    const [isDiagnosing, setIsDiagnosing] = useState<number | null>(null);
    const [diagnosisResult, setDiagnosisResult] = useState<any | null>(null);
    const [isDialogOpen, setIsDialogOpen] = useState(false);

    const loadHealthData = async (silent = false) => {
        if (!selectedCompanyIds || selectedCompanyIds.length === 0) {
            setData(null);
            setIsLoading(false);
            return;
        }

        try {
            if (!silent) setIsLoading(true);
            const companyIdsAsNumbers = selectedCompanyIds.map(id => Number(id));
            const result = await getHealthCheckAnalytics(companyIdsAsNumbers);

            // Si hay diagnósticos disparados, avisar al usuario (solo si no es polling silencioso)
            if (!silent && result.triggeredDiagnoses && result.triggeredDiagnoses.length > 0) {
                result.triggeredDiagnoses.forEach((docId: number) => {
                    const doc = result.documents.find((d: any) => d.id_documento === docId);
                    toast({
                        title: "Análisis IA en curso",
                        description: `Muvail AI está analizando la factura ${doc?.numero_documento || `#${docId}`} en segundo plano...`,
                        variant: "default",
                    });
                });
            }

            setData(result);

            // Verificar si necesitamos activar el polling
            const needsPolling = result.documents.some((doc: any) =>
                doc.mismatch_amount > 0.05 && (!doc.ai_suggestions || doc.ai_suggestions.length === 0)
            );
            setIsPolling(needsPolling);
        } catch (err) {
            console.error('Error loading health data:', err);
        } finally {
            if (!silent) setIsLoading(false);
        }
    };

    const handleDiagnose = async (docId: number, checkType?: string) => {
        try {
            setIsDiagnosing(docId);
            const result = await diagnoseDocument(docId, checkType);
            if (result.success) {
                setDiagnosisResult(result);
                setIsDialogOpen(true);
            } else {
                // @ts-ignore
                toast({
                    title: "Error en el diagnóstico",
                    description: result.error || "No se pudo completar el análisis inteligente del documento.",
                    variant: "destructive"
                });
            }
        } catch (err) {
            console.error('Error in AI diagnosis:', err);
        } finally {
            setIsDiagnosing(null);
        }
    };

    const [isConfirming, setIsConfirming] = useState<number | null>(null);
    const [auditConfirmDoc, setAuditConfirmDoc] = useState<Document | null>(null);

    const handleConfirm = async (docId: number) => {
        try {
            setIsConfirming(docId);
            const res = await fetch('/api/documents/health-confirm', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ documentId: docId }),
            });
            if (res.ok) {
                await loadHealthData();
            }
        } catch (err) {
            console.error('Error confirming document:', err);
        } finally {
            setIsConfirming(null);
            setAuditConfirmDoc(null);
        }
    };

    const filteredDocs = data?.documents.filter(doc =>
        doc.numero_documento?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        doc.entidades.some(e => e.rol === 'EMISOR' && e.nombre?.toLowerCase().includes(searchTerm.toLowerCase()))
    ) || [];

    const logicChecks = data?.summary.logic_checks ?? 0;
    const totalIssues = (data?.summary.mismatches ?? 0) + logicChecks;
    const healthScore = data && data.summary.total > 0
        ? Math.round(((data.summary.total - totalIssues) / data.summary.total) * 100)
        : 100;

    // Polling Effect: Refresca los datos cada 5 segundos si hay diagnósticos en curso
    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (isPolling) {
            console.log('🔄 [HealthCheck] Polling activo: esperando resultados de IA...');
            interval = setInterval(() => {
                loadHealthData(true);
            }, 5000);
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [isPolling, selectedCompanyIds]);

    useEffect(() => {
        loadHealthData();
    }, [selectedCompanyIds]);



    if (isLoading) {
        return (
            <MainLayout>
                <div className="flex-1 space-y-4 p-4 sm:p-6 lg:p-8">
                    <PageHeader title="Health Check" icon={ShieldCheck} />
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32" />)}
                    </div>
                    <Skeleton className="h-[400px] w-full" />
                </div>
            </MainLayout>
        );
    }

    if (!data || data.summary.total === 0) {
        return (
            <MainLayout>
                <div className="flex-1 space-y-4 p-4 sm:p-6 lg:p-8">
                    <PageHeader title="Health Check" icon={ShieldCheck} />
                    <div className="flex h-[400px] items-center justify-center text-center">
                        <div className="max-w-md space-y-4">
                            <div className="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-center">
                                <ShieldCheck className="h-8 w-8 text-muted-foreground" />
                            </div>
                            <h2 className="text-xl font-semibold">Sin datos para analizar</h2>
                            <p className="text-muted-foreground">Selecciona una empresa con documentos cargados para ver el estado de salud de tu auditoría.</p>
                        </div>
                    </div>
                </div>
            </MainLayout>
        );
    }

    return (
        <HealthCheckProvider>
        <MainLayout>
            <div className="flex-1 space-y-8 p-4 sm:p-6 lg:p-8 animate-in fade-in duration-500">
                <PageHeader title="Health Check" icon={ShieldCheck} data-tutorial="health-header">
                    <Button variant="outline" size="sm" onClick={loadHealthData} className="gap-2">
                        <RefreshCw className="h-4 w-4" />
                        Recalcular
                    </Button>
                </PageHeader>

                {/* KPI Section */}
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4" data-tutorial="health-kpis">
                    <Card className="relative overflow-hidden border-none shadow-xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 backdrop-blur-sm">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Score de Salud</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-end justify-between">
                                <div>
                                    <div className="text-4xl font-bold">{healthScore}%</div>
                                    <p className="text-xs text-muted-foreground mt-1">Precisión Operativa</p>
                                </div>
                                <div className={cn(
                                    "p-3 rounded-2xl",
                                    healthScore > 90 ? "bg-green-500/20 text-green-500" : "bg-amber-500/20 text-amber-500"
                                )}>
                                    {healthScore > 90 ? <CheckCircle2 className="h-6 w-6" /> : <ShieldCheck className="h-6 w-6" />}
                                </div>
                            </div>
                            <div className="mt-4 h-1.5 w-full bg-muted rounded-full overflow-hidden">
                                <div
                                    className={cn("h-full transition-all duration-1000", healthScore > 90 ? "bg-green-500" : "bg-amber-500")}
                                    style={{ width: `${healthScore}%` }}
                                />
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-none shadow-lg bg-card/50 backdrop-blur-sm">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Analizados</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-bold">{data.summary.total}</div>
                            <p className="text-xs text-muted-foreground mt-1">Documentos totales</p>
                            <div className="mt-4 flex items-center gap-1.5 text-xs text-green-500">
                                <FileText className="h-3 w-3" />
                                <span>En cumplimiento</span>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-none shadow-lg bg-card/50 backdrop-blur-sm">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Descuadres</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-bold text-red-500">{data.summary.mismatches}</div>
                            <p className="text-xs text-muted-foreground mt-1">Integridad matemática</p>
                            <div className="mt-4 flex items-center gap-1.5 text-xs text-red-500 font-medium">
                                <AlertCircle className="h-3 w-3" />
                                <span>Requieren revisión</span>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-none shadow-lg bg-card/50 backdrop-blur-sm">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Alertas Lógicas</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className={cn("text-3xl font-bold", logicChecks > 0 ? "text-amber-500" : "text-muted-foreground")}>{logicChecks}</div>
                            <p className="text-xs text-muted-foreground mt-1">Fecha o entidad anómala</p>
                            <div className={cn("mt-4 flex items-center gap-1.5 text-xs font-medium", logicChecks > 0 ? "text-amber-500" : "text-muted-foreground")}>
                                <AlertTriangle className="h-3 w-3" />
                                <span>{logicChecks > 0 ? 'Pendientes de validación' : 'Sin alertas'}</span>
                            </div>
                        </CardContent>
                    </Card>

                </div>

                {/* Main Section */}
                <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div className="space-y-1">
                            <h3 className="text-lg font-semibold flex items-center gap-2">
                                Audit Log: Incidencias Activas
                                <Badge variant="secondary" className="bg-red-500/10 text-red-500 border-none">{totalIssues}</Badge>
                            </h3>
                            <p className="text-sm text-muted-foreground">Listado de documentos con discrepancias detectadas por el motor de auditoría.</p>
                        </div>
                        <div className="flex items-center gap-2 w-full sm:w-auto">
                            <div className="relative w-full sm:w-64" data-tutorial="health-search">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Buscar factura o emisor..."
                                    className="pl-9 bg-muted/50 border-none ring-offset-background focus-visible:ring-primary"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                            <Button variant="outline" size="icon" className="shrink-0">
                                <Filter className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>

                    <Card className="border-none shadow-xl bg-card/30 backdrop-blur-md overflow-hidden" data-tutorial="health-table">
                        <Table>
                            <TableHeader className="bg-muted/50">
                                <TableRow>
                                    <TableHead className="w-[150px]">Factura</TableHead>
                                    <TableHead>Emisor</TableHead>
                                    <TableHead>Fecha</TableHead>
                                    <TableHead className="text-right">Importe</TableHead>
                                    <TableHead>Diagnóstico</TableHead>
                                    <TableHead className="text-right">Acción</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredDocs.length > 0 ? (
                                    filteredDocs.map((doc, rowIndex) => {
                                        const emisor = doc.entidades.find((e: any) => e.rol?.toUpperCase() === 'EMISOR' || e.rol?.toUpperCase() === 'PROVEEDOR')?.nombre || 'Desconocido';
                                        return (
                                            <TableRow
                                                key={doc.id_documento}
                                                className="group hover:bg-muted/30 transition-colors cursor-pointer"
                                                onClick={() => router.push(`/documento/${doc.id_documento}`)}
                                            >
                                                <TableCell className="font-medium">{doc.numero_documento || 'Provisional'}</TableCell>
                                                <TableCell>
                                                    <div className="flex flex-col">
                                                        <span className="font-medium text-sm group-hover:text-primary transition-colors">{emisor}</span>
                                                        <span className="text-xs text-muted-foreground">ID: #{doc.id_documento}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-sm text-muted-foreground">
                                                    {doc.fecha_emision ? new Date(doc.fecha_emision).toLocaleDateString('es-ES') : 'N/A'}
                                                </TableCell>
                                                <TableCell className="text-right font-semibold">
                                                    {new Intl.NumberFormat('es-ES', {
                                                        style: 'currency',
                                                        currency: (doc.moneda && doc.moneda.length === 3) ? doc.moneda : 'EUR'
                                                    }).format(doc.total || 0)}
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex flex-col gap-1">
                                                        {(() => {
                                                            const checkType = (doc as any).hcs_check_type ?? 'MISMATCH_MATEMATICO';
                                                            const motivo = (doc as any).hcs_motivo;
                                                            const mismatch = (doc as any).hcs_mismatch_amount ?? 0;

                                                            if (checkType === 'FECHA_ANOMALA') {
                                                                return (
                                                                    <div className="flex items-center gap-2 text-amber-500 bg-amber-500/5 px-2 py-1 rounded-md text-xs font-medium w-fit">
                                                                        <AlertTriangle className="h-3 w-3" />
                                                                        Fecha Anómala
                                                                    </div>
                                                                );
                                                            }
                                                            if (checkType === 'ENTIDAD_DUPLICADA') {
                                                                return (
                                                                    <div className="flex items-center gap-2 text-orange-500 bg-orange-500/5 px-2 py-1 rounded-md text-xs font-medium w-fit">
                                                                        <AlertTriangle className="h-3 w-3" />
                                                                        Entidad Duplicada
                                                                    </div>
                                                                );
                                                            }
                                                            if (mismatch <= 0.05) {
                                                                return (
                                                                    <div className="flex items-center gap-2 text-green-500 bg-green-500/5 px-2 py-1 rounded-md text-xs font-medium w-fit">
                                                                        <CheckCircle2 className="h-3 w-3" />
                                                                        Cuadrado — Pendiente confirmación
                                                                    </div>
                                                                );
                                                            }
                                                            return (
                                                                <div className="flex items-center gap-2 text-red-500 bg-red-500/5 px-2 py-1 rounded-md text-xs font-medium w-fit">
                                                                    <AlertTriangle className="h-3 w-3" />
                                                                    Error de Cuadre
                                                                </div>
                                                            );
                                                        })()}
                                                        {/* Motivo o desvío */}
                                                        {(() => {
                                                            const checkType = (doc as any).hcs_check_type ?? 'MISMATCH_MATEMATICO';
                                                            const motivo = (doc as any).hcs_motivo;
                                                            const mismatch = (doc as any).hcs_mismatch_amount ?? 0;
                                                            if (motivo && checkType !== 'MISMATCH_MATEMATICO') {
                                                                return (
                                                                    <span className="text-[10px] text-muted-foreground px-2 italic">{motivo}</span>
                                                                );
                                                            }
                                                            if (mismatch > 0.05 && doc.ai_suggestions && doc.ai_suggestions.length > 0) {
                                                                return (
                                                                    <div className="mt-2 p-2.5 bg-violet-500/5 border border-violet-500/10 rounded-lg text-xs text-violet-400 leading-relaxed italic line-clamp-3 max-w-[250px] shadow-sm">
                                                                        <Sparkles className="h-3 w-3 inline mr-1.5 mb-0.5 text-violet-500" />
                                                                        {doc.ai_suggestions[0].descripcion}
                                                                    </div>
                                                                );
                                                            }
                                                            if (mismatch > 0.05) {
                                                                return (
                                                                    <span className="text-[10px] text-red-400/70 px-2 italic">
                                                                        Desvío: {new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(mismatch)}
                                                                    </span>
                                                                );
                                                            }
                                                            return null;
                                                        })()}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex items-center justify-end gap-2">
                                                        {/* Botón IA — siempre disponible */}
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-8 gap-1.5 text-violet-500 hover:text-violet-600 hover:bg-violet-500/10"
                                                            data-tutorial={rowIndex === 0 ? 'health-ia' : undefined}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleDiagnose(doc.id_documento, (doc as any).hcs_check_type);
                                                            }}
                                                            disabled={isDiagnosing === doc.id_documento}
                                                        >
                                                            {isDiagnosing === doc.id_documento ? (
                                                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                            ) : (
                                                                <Sparkles className="h-3.5 w-3.5" />
                                                            )}
                                                            <span className="font-bold tracking-tight">IA</span>
                                                        </Button>
                                                        {/* Validar + Ver — spotlight conjunto en tutorial */}
                                                        <div
                                                            className="flex items-center gap-2"
                                                            data-tutorial={rowIndex === 0 ? 'health-validate' : undefined}
                                                        >
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                className="h-8 gap-1.5 text-green-500 hover:text-green-600 hover:bg-green-500/10"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    // Siempre mostrar el diálogo — si el doc está en Centro de Salud, tiene algún error activo
                                                                    setAuditConfirmDoc(doc);
                                                                }}
                                                                disabled={isConfirming === doc.id_documento}
                                                            >
                                                                {isConfirming === doc.id_documento ? (
                                                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                                ) : (
                                                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                                                )}
                                                                Validar
                                                            </Button>
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                className="h-8 gap-1 text-primary hover:text-primary"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    const checkType = (doc as any).hcs_check_type || 'MISMATCH_MATEMATICO';
                                                                    const motivo = (doc as any).hcs_motivo || '';
                                                                    router.push(`/documento/${doc.id_documento}?audit=true&checkType=${checkType}&motivo=${encodeURIComponent(motivo)}`);
                                                                }}
                                                            >
                                                                Ver <ArrowRight className="h-3 w-3" />
                                                            </Button>
                                                        </div>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                                            No se encontraron documentos con discrepancias.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </Card>
                </div>

                {/* AI Diagnosis Dialog */}
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogContent className="sm:max-w-[500px] border-none bg-card/95 backdrop-blur-xl shadow-2xl">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2 text-xl">
                                <Sparkles className="h-5 w-5 text-violet-500" />
                                Diagnóstico de Auditoría IA
                            </DialogTitle>
                            <DialogDescription className="text-zinc-400">
                                Análisis semántico del descuadre detectado.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-6 py-4">
                            {diagnosisResult?.incidents.map((incident: any, idx: number) => (
                                <div key={idx} className="bg-muted/50 p-4 rounded-xl space-y-3 border border-border/50">
                                    <div className="flex justify-between items-start">
                                        <Badge className={cn(
                                            "capitalize font-bold tracking-tight px-2 py-0.5",
                                            incident.severidad === 'alta' ? "bg-red-500/20 text-red-500" :
                                                incident.severidad === 'media' ? "bg-violet-500/20 text-violet-500" :
                                                    "bg-blue-500/20 text-blue-500"
                                        )}>
                                            {incident.tipo}
                                        </Badge>
                                    </div>
                                    <p className="text-sm leading-relaxed">{incident.descripcion}</p>

                                    {incident.sugerencia && incident.sugerencia !== 'N/A' && (
                                        <div className="bg-violet-500/5 p-4 rounded-xl border border-violet-500/20 flex gap-4 shadow-inner">
                                            <div className="bg-violet-500/10 p-2 rounded-full h-fit">
                                                <Info className="h-4 w-4 text-violet-500 shrink-0" />
                                            </div>
                                            <div className="space-y-1">
                                                <p className="text-[10px] font-black text-violet-500 uppercase tracking-widest">Sugerencia de Fix</p>
                                                <p className="text-sm text-violet-200 font-medium leading-relaxed">{incident.sugerencia}</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}

                            {!diagnosisResult?.incidents.length && (
                                <div className="text-center py-8 space-y-3">
                                    <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto" />
                                    <p className="text-sm text-muted-foreground">No se encontraron inconsistencias adicionales en este análisis profundo.</p>
                                </div>
                            )}
                        </div>

                        <div className="flex justify-end pt-4 border-t border-border/50">
                            <Button onClick={() => setIsDialogOpen(false)} className="bg-primary hover:bg-primary/90">
                                Entendido
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>

                {auditConfirmDoc && (
                    <FiscalAuditConfirmDialog
                        isOpen={!!auditConfirmDoc}
                        onClose={() => setAuditConfirmDoc(null)}
                        onConfirm={() => handleConfirm(auditConfirmDoc.id_documento)}
                        onEdit={() => {
                            const checkType = (auditConfirmDoc as any).hcs_check_type || 'MISMATCH_MATEMATICO';
                            const motivo = (auditConfirmDoc as any).hcs_motivo || (auditConfirmDoc as any).incidencia || '';
                            const docId = auditConfirmDoc.id_documento;
                            setAuditConfirmDoc(null);
                            router.push(`/documento/${docId}?audit=true&checkType=${checkType}&motivo=${encodeURIComponent(motivo)}`);
                        }}
                        documentNumber={auditConfirmDoc.numero_documento || `ID: ${auditConfirmDoc.id_documento}`}
                        motivo={(() => {
                            const parts: string[] = [];
                            if ((auditConfirmDoc as any).hcs_motivo) parts.push((auditConfirmDoc as any).hcs_motivo);
                            try {
                                const de = typeof (auditConfirmDoc as any).datos_extra === 'string'
                                    ? JSON.parse((auditConfirmDoc as any).datos_extra || '{}')
                                    : ((auditConfirmDoc as any).datos_extra || {});
                                if (de.fiscal_revision_reasons) {
                                    const r = de.fiscal_revision_reasons;
                                    const str = typeof r === 'string' ? r
                                        : Array.isArray(r) ? r.map((x: any) => typeof x === 'string' ? x : (x.message || x.code || '')).filter(Boolean).join(' | ')
                                        : typeof r === 'object' && r !== null ? (r.message || r.code || JSON.stringify(r)) : '';
                                    if (str && !parts.some(p => p.includes(str.slice(0, 20)))) parts.push(str);
                                }
                            } catch {}
                            return parts.filter(Boolean).join(' | ') || undefined;
                        })()}
                        checkType={(auditConfirmDoc as any).hcs_check_type || undefined}
                        isConfirming={isConfirming === auditConfirmDoc.id_documento}
                    />
                )}
            </div>
            <HealthCheckTutorialRouter />
        </MainLayout>
        </HealthCheckProvider>
    );
}
