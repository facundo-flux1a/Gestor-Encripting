'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Eye, Trash2, Loader2, AlertTriangle, Filter, Folder, FolderOpen, ChevronDown, ChevronRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { classifyIncident } from '@/components/incidents/incidents-analytics';

interface AIIncident {
    id: number;
    documento_id: number;
    tipo: string;
    descripcion: string;
    severidad: 'baja' | 'media' | 'alta';
    provider: string;
    model: string;
    created_at: string;
    numero_documento: string;
    tipo_documento: string;
    empresa_nombre: string;
    fecha_emision: string;
    importe_total: number;
    proveedor_nombre: string;
}

interface GroupedAIIncidentsTableProps {
    empresaIds: number[];
    onRefresh?: () => void;
    typeFilter?: string | null;
}

const severityOrder = {
    alta: 3,
    media: 2,
    baja: 1,
};

const getFolderColor = (incidents: AIIncident[]) => {
    let maxSeverity = 0;
    incidents.forEach(inc => {
        const severity = severityOrder[inc.severidad] || 0;
        if (severity > maxSeverity) maxSeverity = severity;
    });

    if (maxSeverity === 3) return 'destructive'; // Alta - Rojo
    if (maxSeverity === 2) return 'warning';     // Media - Naranja/Amarillo
    return 'default';                            // Baja - Azul/Default
};

const colorClasses = {
    destructive: { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-500', hover: 'hover:bg-red-500/20', badge: 'bg-red-500/20 text-red-600' },
    warning: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-500', hover: 'hover:bg-amber-500/20', badge: 'bg-amber-500/20 text-amber-600' },
    default: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-500', hover: 'hover:bg-blue-500/20', badge: 'bg-blue-500/20 text-blue-600' },
};

export function GroupedAIIncidentsTable({ empresaIds, onRefresh, typeFilter }: GroupedAIIncidentsTableProps) {
    const router = useRouter();
    const { toast } = useToast();
    const [incidents, setIncidents] = useState<AIIncident[]>([]);
    const [loading, setLoading] = useState(true);
    const [severidadFilter, setSeveridadFilter] = useState<string>('all');
    const [providerFilter, setProviderFilter] = useState<string>('all');
    const [deletingId, setDeletingId] = useState<number | null>(null);

    // Grouping State
    const [expandedDocs, setExpandedDocs] = useState<Set<number>>(new Set());

    const loadIncidents = async () => {
        try {
            setLoading(true);

            const params = new URLSearchParams();

            if (empresaIds && empresaIds.length > 0) {
                empresaIds.forEach(id => params.append('empresaIds', id.toString()));
            }

            if (severidadFilter !== 'all') params.append('severidad', severidadFilter);
            if (providerFilter !== 'all') params.append('provider', providerFilter);

            const response = await fetch(`/api/ai-incidents?${params}`);

            if (!response.ok) {
                throw new Error('Error al cargar incidencias');
            }

            const data = await response.json();
            setIncidents(data);
        } catch (error) {
            console.error('❌ [AIIncidentsTable] Error:', error);
            toast({
                title: 'Error',
                description: 'No se pudieron cargar las incidencias de IA',
                variant: 'destructive',
            });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadIncidents();
    }, [empresaIds, severidadFilter, providerFilter]);

    const handleDelete = async (incidentId: number) => {
        if (!confirm('¿Estás seguro de eliminar esta incidencia?')) {
            return;
        }

        try {
            setDeletingId(incidentId);

            const response = await fetch('/api/ai-incidents', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ incidentId }),
            });

            if (!response.ok) {
                throw new Error('Error al eliminar incidencia');
            }

            toast({
                title: '✅ Éxito',
                description: 'Incidencia eliminada correctamente',
                className: "bg-gradient-to-br from-green-500 to-emerald-600 text-white",
            });

            loadIncidents();

            if (onRefresh) {
                onRefresh();
            }
        } catch (error) {
            console.error('Error deleting incident:', error);
            toast({
                title: '❌ Error',
                description: 'No se pudo eliminar la incidencia',
                variant: 'destructive',
            });
        } finally {
            setDeletingId(null);
        }
    };

    const toggleDoc = (docId: number) => {
        setExpandedDocs(prev => {
            const newSet = new Set(prev);
            if (newSet.has(docId)) newSet.delete(docId);
            else newSet.add(docId);
            return newSet;
        });
    };

    const groupedIncidents = useMemo(() => {
        const groups = new Map<number, AIIncident[]>();
        incidents.forEach(inc => {
            if (!groups.has(inc.documento_id)) {
                groups.set(inc.documento_id, []);
            }
            groups.get(inc.documento_id)!.push(inc);
        });
        const allGroups = Array.from(groups.entries());
        if (!typeFilter) return allGroups;
        // Filtrar grupos que tengan al menos una incidencia del tipo activo
        return allGroups.filter(([, docIncidents]) =>
            docIncidents.some(inc => classifyIncident(inc.descripcion) === typeFilter)
        );
    }, [incidents, typeFilter]);

    const getSeverityColor = (severity: string) => {
        switch (severity) {
            case 'alta': return 'destructive';
            case 'media': return 'default'; // Using default for orange-ish look usually or we can map to warning if badge supports
            case 'baja': return 'secondary';
            default: return 'outline';
        }
    };

    const getProviderColor = (provider: string) => {
        return provider === 'openai' ? 'default' : 'secondary';
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('es-AR', {
            style: 'currency',
            currency: 'ARS',
            minimumFractionDigits: 2,
        }).format(amount);
    };

    return (
        <Card className="transition-all duration-300 hover:shadow-lg border-none shadow-none bg-transparent">
            <CardHeader className="px-0 pt-0">
                <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 justify-between items-start sm:items-center">
                    <div className="space-y-1">
                        <CardTitle className="text-lg font-semibold flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-primary" />
                            Incidencias Detectadas
                        </CardTitle>
                        <CardDescription>
                            Agrupadas por documento
                        </CardDescription>
                    </div>

                    {/* Filtros */}
                    <div className="flex gap-2 w-full sm:w-auto">
                        <Select value={severidadFilter} onValueChange={setSeveridadFilter}>
                            <SelectTrigger className="w-[140px] h-8 text-xs">
                                <SelectValue placeholder="Severidad" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todas</SelectItem>
                                <SelectItem value="alta">Alta</SelectItem>
                                <SelectItem value="media">Media</SelectItem>
                                <SelectItem value="baja">Baja</SelectItem>
                            </SelectContent>
                        </Select>

                        <Select value={providerFilter} onValueChange={setProviderFilter}>
                            <SelectTrigger className="w-[140px] h-8 text-xs">
                                <SelectValue placeholder="Proveedor IA" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todos</SelectItem>
                                <SelectItem value="openai">OpenAI</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </CardHeader>

            <CardContent className="px-0 space-y-4">
                {typeFilter && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 border border-primary/20 text-sm">
                        <Filter className="h-4 w-4 text-primary shrink-0" />
                        <span>Filtrando por tipo: <span className="font-semibold text-primary">{typeFilter}</span></span>
                        <span className="ml-auto text-xs text-muted-foreground">{groupedIncidents.length} resultado(s)</span>
                    </div>
                )}
                {loading ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                ) : groupedIncidents.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground bg-muted/30 rounded-lg border border-dashed">
                        <AlertTriangle className="h-10 w-10 mx-auto mb-3 opacity-20" />
                        <p>No hay incidencias que mostrar</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {groupedIncidents.map(([docId, docIncidents]) => {
                            const firstInc = docIncidents[0];
                            const isGroup = docIncidents.length > 1;

                            if (!isGroup) {
                                // REENDERIZADO COMO ITEM ÚNICO (Card/Fila)
                                const incident = firstInc;
                                return (
                                    <div key={docId} className="group/item relative">
                                        <div className="flex flex-col sm:flex-row gap-3 p-4 rounded-lg border bg-card hover:shadow-md transition-all duration-200">
                                            {/* Icono + Info Principal */}
                                            <div className="flex items-start gap-3 flex-1">
                                                <div className={`mt-0.5 p-1.5 rounded-md ${incident.severidad === 'alta' ? 'bg-red-100 text-red-600' :
                                                        incident.severidad === 'media' ? 'bg-amber-100 text-amber-600' :
                                                            'bg-blue-100 text-blue-600'
                                                    }`}>
                                                    <AlertTriangle className="h-4 w-4" />
                                                </div>
                                                <div className="space-y-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-semibold text-sm">
                                                            {incident.numero_documento || 'Sin Número'}
                                                        </span>
                                                        <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-normal">
                                                            {incident.tipo}
                                                        </Badge>
                                                    </div>
                                                    <p className="text-sm text-muted-foreground line-clamp-2">
                                                        {incident.descripcion}
                                                    </p>
                                                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground pt-1">
                                                        <span className="flex items-center gap-1">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
                                                            {incident.empresa_nombre}
                                                        </span>
                                                        <span className="flex items-center gap-1">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
                                                            {formatCurrency(incident.importe_total)}
                                                        </span>
                                                        <span className="flex items-center gap-1">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
                                                            {incident.provider} / {incident.model}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Acciones + Severidad */}
                                            <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-2 pl-0 sm:pl-4 border-t sm:border-t-0 sm:border-l border-border mt-3 sm:mt-0 pt-3 sm:pt-0 shrink-0 min-w-[100px]">
                                                <Badge variant={getSeverityColor(incident.severidad)} className="mb-2 uppercase text-[10px]">
                                                    {incident.severidad}
                                                </Badge>
                                                <div className="flex gap-1">
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        className="h-7 w-7 p-0"
                                                        onClick={() => router.push(`/documento/${incident.documento_id}`)}
                                                        title="Ver Documento"
                                                    >
                                                        <Eye className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        className="h-7 w-7 p-0 text-destructive hover:text-destructive/90 hover:bg-destructive/10"
                                                        onClick={() => handleDelete(incident.id)}
                                                        title="Eliminar"
                                                    >
                                                        {deletingId === incident.id ? (
                                                            <Loader2 className="h-4 w-4 animate-spin" />
                                                        ) : (
                                                            <Trash2 className="h-4 w-4" />
                                                        )}
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            }

                            // RENDERIZADO COMO CARPETA (Múltiples incidencias)
                            const isExpanded = expandedDocs.has(docId);
                            const colorKey = getFolderColor(docIncidents);
                            const classes = colorClasses[colorKey as keyof typeof colorClasses];

                            return (
                                <div key={docId} className="group/folder">
                                    <button
                                        onClick={() => toggleDoc(docId)}
                                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border shadow-sm ${classes.bg} ${classes.border} ${classes.hover} transition-all duration-200 text-left`}
                                    >
                                        <div className={`${classes.text} shrink-0`}>
                                            {isExpanded ? <FolderOpen className="h-5 w-5" /> : <Folder className="h-5 w-5" />}
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-0.5">
                                                <span className={`font-semibold text-sm ${classes.text}`}>
                                                    {firstInc.numero_documento || 'Sin Número'}
                                                </span>
                                                <span className="text-xs text-muted-foreground truncate">
                                                    • {firstInc.proveedor_nombre || 'Proveedor Desconocido'}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                <span>{firstInc.tipo_documento}</span>
                                                <span>•</span>
                                                <span>{formatCurrency(firstInc.importe_total)}</span>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-3 shrink-0">
                                            {/* Badges de severidad resumen */}
                                            <div className="flex gap-1">
                                                {/* Solo mostramos badge si hay de esa severidad */}
                                                {docIncidents.some(i => i.severidad === 'alta') && <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">Alta</Badge>}
                                                {docIncidents.some(i => i.severidad === 'media') && <Badge variant="outline" className="h-5 px-1.5 text-[10px] border-amber-500/50 text-amber-600 bg-amber-500/10">Media</Badge>}
                                            </div>

                                            <Badge variant="secondary" className={`ml-2 ${classes.badge}`}>
                                                {docIncidents.length}
                                            </Badge>
                                            <div className={`${classes.text}`}>
                                                {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                            </div>
                                        </div>
                                    </button>

                                    {isExpanded && (
                                        <div className="mt-2 ml-4 sm:ml-6 pl-4 border-l-2 border-muted animate-in slide-in-from-top-2 duration-200">
                                            <div className="rounded-md border bg-card">
                                                <Table>
                                                    <TableHeader>
                                                        <TableRow className="bg-muted/50 hidden sm:table-row">
                                                            <TableHead>Incidencia</TableHead>
                                                            <TableHead>Descripción</TableHead>
                                                            <TableHead>Severidad</TableHead>
                                                            <TableHead>IA</TableHead>
                                                            <TableHead className="text-right">Acciones</TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {docIncidents.map((incident) => (
                                                            <TableRow key={incident.id} className="flex flex-col sm:table-row">
                                                                <TableCell className="font-medium">
                                                                    <Badge variant="outline" className="text-xs">{incident.tipo}</Badge>
                                                                </TableCell>
                                                                <TableCell className="text-sm text-muted-foreground max-w-md">
                                                                    {incident.descripcion}
                                                                </TableCell>
                                                                <TableCell>
                                                                    <Badge variant={getSeverityColor(incident.severidad)} className="text-xs">{incident.severidad}</Badge>
                                                                </TableCell>
                                                                <TableCell>
                                                                    <div className="flex flex-col text-xs">
                                                                        <span className="font-medium capitalize">{incident.provider}</span>
                                                                        <span className="text-muted-foreground">{incident.model}</span>
                                                                    </div>
                                                                </TableCell>
                                                                <TableCell className="text-right">
                                                                    <div className="flex justify-end gap-2 mt-2 sm:mt-0">
                                                                        <Button
                                                                            size="sm"
                                                                            variant="ghost"
                                                                            className="h-8 w-8 p-0"
                                                                            onClick={() => router.push(`/documento/${incident.documento_id}`)}
                                                                        >
                                                                            <Eye className="h-4 w-4" />
                                                                        </Button>
                                                                        <Button
                                                                            size="sm"
                                                                            variant="ghost"
                                                                            className="h-8 w-8 p-0 text-destructive hover:text-destructive/90 hover:bg-destructive/10"
                                                                            onClick={() => handleDelete(incident.id)}
                                                                        >
                                                                            {deletingId === incident.id ? (
                                                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                                            ) : (
                                                                                <Trash2 className="h-4 w-4" />
                                                                            )}
                                                                        </Button>
                                                                    </div>
                                                                </TableCell>
                                                            </TableRow>
                                                        ))}
                                                    </TableBody>
                                                </Table>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
