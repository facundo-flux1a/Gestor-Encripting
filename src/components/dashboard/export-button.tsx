'use client';

import * as React from 'react';
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSub,
    DropdownMenuSubTrigger,
    DropdownMenuSubContent,
    DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Download, FileSpreadsheet, FileType, FileJson, Loader2, Mail, Package } from "lucide-react";
import { type Column, type Row } from '@tanstack/react-table';
import { generateAdvancedExport } from '@/lib/export-utils';
import { useToast } from '@/hooks/use-toast';

interface ExportButtonProps {
    columns: Column<any, unknown>[];
    data: Row<any>[];
    filename: string;
    exportContext?: 'trimestres' | 'documentos' | 'documentos_emitidas' | 'documentos_recibidas' | 'documentos_extranjero' | 'documentos_tickets' | 'otros';
    includeSummary?: boolean;
    /** Email pre-rellenado (mail_de_carga de la empresa) */
    mailDeCarga?: string | null;
    empresaNombre?: string;
}

const getHeaderName = (col: Column<any, unknown>): string => {
    const headerDef = col.columnDef.header;
    if (typeof headerDef === 'string') return headerDef;
    const readableId = col.id.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    return readableId.charAt(0).toUpperCase() + readableId.slice(1);
};

/** Extrae el proveedor/emisor de un row (múltiples campos posibles) */
function getRowProvider(original: any): string {
    return (
        original?.emisor_nombre ||
        original?.proveedor ||
        original?.nombre_proveedor ||
        original?.['Emisor / Proveedor'] ||
        original?.nombre_de_empresa ||
        ''
    ).trim();
}

/** Extrae la fecha de emisión de un row */
function getRowDate(original: any): string {
    const raw = original?.fecha_emision || original?.['Fecha Emisión'] || '';
    if (!raw) return '';
    try {
        const d = new Date(raw);
        if (!isNaN(d.getTime())) return d.toISOString().split('T')[0]; // YYYY-MM-DD
    } catch { /* noop */ }
    return String(raw).slice(0, 10);
}

/** Extrae el ID del documento de un row */
function getRowDocId(original: any): number | null {
    const id = original?.id_documento ?? original?.doc_id ?? original?.id ?? null;
    const n = Number(id);
    return !isNaN(n) && n > 0 ? n : null;
}

export function ExportButton({
    columns, data, filename, exportContext, includeSummary, mailDeCarga, empresaNombre,
}: ExportButtonProps) {
    const { toast } = useToast();

    // ── Opciones existentes ──
    const [includeFileUrls, setIncludeFileUrls] = React.useState(false);
    const [includeEntities, setIncludeEntities] = React.useState(false);

    // ── Filtros nuevos ──
    const [dateFrom, setDateFrom] = React.useState('');
    const [dateTo, setDateTo] = React.useState('');
    const [selectedProviders, setSelectedProviders] = React.useState<Set<string>>(new Set());
    const [allProvidersSelected, setAllProvidersSelected] = React.useState(true);

    // ── Opciones ZIP / mail ──
    const [includeZipLink, setIncludeZipLink] = React.useState(true);
    const [sendMail, setSendMail] = React.useState(false);
    const [mailEmail, setMailEmail] = React.useState(mailDeCarga || '');
    const [isGenerating, setIsGenerating] = React.useState(false);

    // ── Lista de proveedores únicos del dataset ──
    const allProviders = React.useMemo(() => {
        const set = new Set<string>();
        data.forEach(row => {
            const p = getRowProvider(row.original);
            if (p) set.add(p);
        });
        return Array.from(set).sort();
    }, [data]);

    // Toggle proveedor individual
    const toggleProvider = (provider: string) => {
        const next = new Set(selectedProviders);
        if (next.has(provider)) { next.delete(provider); } else { next.add(provider); }
        setSelectedProviders(next);
        setAllProvidersSelected(next.size === 0);
    };

    // Toggle "todos los proveedores"
    const toggleAllProviders = () => {
        setSelectedProviders(new Set());
        setAllProvidersSelected(true);
    };

    // ── Handler Excel ──
    const handleExcelExport = async () => {
        setIsGenerating(true);

        // 1. Filtrar datos por fecha y proveedor
        let filteredData = data;
        if (dateFrom || dateTo || selectedProviders.size > 0) {
            filteredData = data.filter(row => {
                const orig = row.original as any;
                // Filtro fecha
                const fecha = getRowDate(orig);
                if (dateFrom && fecha && fecha < dateFrom) return false;
                if (dateTo && fecha && fecha > dateTo) return false;
                // Filtro proveedor
                if (selectedProviders.size > 0) {
                    const p = getRowProvider(orig);
                    if (!selectedProviders.has(p)) return false;
                }
                return true;
            });
        }

        // 2. Columnas efectivas
        const exportableColumns = columns.filter(col => col.id !== 'select' && col.id !== 'actions');
        const utilColumns = exportableColumns.map(col => ({ id: col.id, header: getHeaderName(col) }));

        // 3. Obtener masterLink del server (solo si hay docs y se pidió ZIP)
        let masterLink = '';
        let masterLinkTtlSec = 604800; // 7 días default
        if (includeZipLink && filteredData.length > 0) {
            try {
                const docIds = filteredData
                    .map(row => getRowDocId(row.original))
                    .filter((id): id is number => id !== null);

                if (docIds.length > 0) {
                    const resp = await fetch('/api/export/zip', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            documentIds: docIds,
                            expiresInSec: masterLinkTtlSec,
                            notifyEmail: sendMail && mailEmail ? mailEmail : null,
                        }),
                    });
                    if (resp.ok) {
                        const json = await resp.json();
                        masterLink = json.masterLink || '';
                        console.log('[ExportButton] ZIP pre-reservado:', { masterLink, jobId: json.jobId });
                    } else {
                        const errBody = await resp.json().catch(() => ({}));
                        const errMsg = errBody?.error || `HTTP ${resp.status}`;
                        console.warn('[ExportButton] ZIP API error:', errMsg);
                        toast({
                            title: 'ZIP no disponible',
                            description: `El Excel se generará sin link ZIP: ${errMsg}`,
                            variant: 'destructive',
                        });
                    }
                }
            } catch (fetchErr: any) {
                console.warn('[ExportButton] Error conectando al ZIP service:', fetchErr);
                toast({
                    title: 'ZIP no disponible',
                    description: 'No se pudo conectar al servicio de ZIP. El Excel se generará sin link.',
                    variant: 'destructive',
                });
            }
        }


        setIsGenerating(false);

        // 4. Generar Excel (con o sin masterLink)
        try {
            generateAdvancedExport(filteredData, utilColumns, {
                filename,
                format: 'excel',
                ...(includeSummary ? { includeSummary: true } : {}),
                ...(exportContext ? { exportContext } : {}),
                ...(includeFileUrls ? { includeFileUrls: true } : {}),
                ...(includeEntities ? { includeEntities: true } : {}),
                ...(masterLink ? { masterLink, masterLinkTtlSec } : {}),
            });

            if (masterLink) {
                toast({
                    title: 'Excel generado con Link Maestro',
                    description: sendMail && mailEmail
                        ? `ZIP en generación — te avisamos a ${mailEmail} cuando esté listo.`
                        : 'El ZIP se genera en background. El link está dentro del Excel.',
                });
            }
        } catch (err: any) {
            toast({
                title: 'Error al generar el Excel',
                description: err?.message || 'Revisá la consola para más detalles.',
                variant: 'destructive',
            });
        }
    };

    const handleSimpleExport = (format: 'csv' | 'json') => {
        const exportableColumns = columns.filter(col => col.id !== 'select' && col.id !== 'actions');
        const utilColumns = exportableColumns.map(col => ({ id: col.id, header: getHeaderName(col) }));
        generateAdvancedExport(data, utilColumns, { filename, format });
    };

    const showExcelOptions = !exportContext || [
        'trimestres', 'documentos', 'documentos_emitidas', 'documentos_recibidas',
        'documentos_extranjero', 'documentos_tickets', 'otros',
    ].includes(exportContext);

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-1.5 sm:gap-2 h-8 sm:h-9 text-xs sm:text-sm">
                    <Download className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                    <span className="hidden xs:inline">Exportar</span>
                    <span className="xs:hidden">Export</span>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 sm:w-56">
                {showExcelOptions ? (
                    <DropdownMenuSub>
                        <DropdownMenuSubTrigger className="text-xs sm:text-sm gap-2 cursor-pointer">
                            <FileSpreadsheet className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                            <span>Excel (.xlsx)</span>
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent className="w-72 p-3 space-y-3">

                            {/* ── Filtros fecha ── */}
                            <div>
                                <p className="text-xs font-semibold text-muted-foreground mb-2">Rango de fechas</p>
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">Desde</Label>
                                        <Input
                                            type="date"
                                            value={dateFrom}
                                            onChange={e => setDateFrom(e.target.value)}
                                            className="h-7 text-xs mt-0.5"
                                            onClick={e => e.stopPropagation()}
                                            onKeyDown={e => e.stopPropagation()}
                                        />
                                    </div>
                                    <div>
                                        <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">Hasta</Label>
                                        <Input
                                            type="date"
                                            value={dateTo}
                                            onChange={e => setDateTo(e.target.value)}
                                            className="h-7 text-xs mt-0.5"
                                            onClick={e => e.stopPropagation()}
                                            onKeyDown={e => e.stopPropagation()}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* ── Filtro proveedores ── */}
                            {allProviders.length > 0 && (
                                <div>
                                    <p className="text-xs font-semibold text-muted-foreground mb-1.5">Proveedores / Emisores</p>
                                    <ScrollArea className="h-28 rounded border border-border px-2 py-1">
                                        <label
                                            className="flex items-center gap-2 py-1 cursor-pointer"
                                            onClick={e => { e.stopPropagation(); toggleAllProviders(); }}
                                        >
                                            <Checkbox
                                                checked={allProvidersSelected}
                                                onCheckedChange={() => toggleAllProviders()}
                                                className="shrink-0"
                                            />
                                            <span className="text-xs font-medium">Todos ({allProviders.length})</span>
                                        </label>
                                        <div className="border-t border-border my-1" />
                                        {allProviders.map(p => (
                                            <label
                                                key={p}
                                                className="flex items-center gap-2 py-0.5 cursor-pointer"
                                                onClick={e => { e.stopPropagation(); toggleProvider(p); }}
                                            >
                                                <Checkbox
                                                    checked={!allProvidersSelected && selectedProviders.has(p)}
                                                    onCheckedChange={() => toggleProvider(p)}
                                                    className="shrink-0"
                                                />
                                                <span className="text-[11px] truncate max-w-[200px]" title={p}>{p}</span>
                                            </label>
                                        ))}
                                    </ScrollArea>
                                </div>
                            )}

                            <DropdownMenuSeparator />

                            {/* ── Opciones existentes ── */}
                            <div className="space-y-1.5">
                                <p className="text-xs font-semibold text-muted-foreground">Opciones de contenido</p>
                                <label
                                    className="flex items-start gap-2 cursor-pointer"
                                    onClick={e => e.stopPropagation()}
                                >
                                    <Checkbox
                                        checked={includeFileUrls}
                                        onCheckedChange={v => setIncludeFileUrls(!!v)}
                                        className="mt-0.5 shrink-0"
                                    />
                                    <span className="text-[11px] leading-tight">Incluir URL de archivos (MinIO)</span>
                                </label>
                                <label
                                    className="flex items-start gap-2 cursor-pointer"
                                    onClick={e => e.stopPropagation()}
                                >
                                    <Checkbox
                                        checked={includeEntities}
                                        onCheckedChange={v => setIncludeEntities(!!v)}
                                        className="mt-0.5 shrink-0"
                                    />
                                    <span className="text-[11px] leading-tight">Incluir directorio de entidades</span>
                                </label>
                            </div>

                            <DropdownMenuSeparator />

                            {/* ── Opciones ZIP + mail ── */}
                            <div className="space-y-1.5">
                                <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                                    <Package className="h-3 w-3 text-violet-400" />
                                    Link Maestro ZIP
                                </p>
                                <label
                                    className="flex items-start gap-2 cursor-pointer"
                                    onClick={e => e.stopPropagation()}
                                >
                                    <Checkbox
                                        checked={includeZipLink}
                                        onCheckedChange={v => setIncludeZipLink(!!v)}
                                        className="mt-0.5 shrink-0"
                                    />
                                    <span className="text-[11px] leading-tight text-violet-400">Incluir link ZIP en el Excel</span>
                                </label>

                                {/* Opción mail */}
                                {includeZipLink && (
                                    <div>
                                        <label
                                            className="flex items-start gap-2 cursor-pointer mb-1"
                                            onClick={e => e.stopPropagation()}
                                        >
                                            <Checkbox
                                                checked={sendMail}
                                                onCheckedChange={v => setSendMail(!!v)}
                                                className="mt-0.5 shrink-0"
                                            />
                                            <span className="text-[11px] leading-tight flex items-center gap-1">
                                                <Mail className="h-3 w-3" />
                                                Enviar ZIP por mail al terminar
                                            </span>
                                        </label>
                                        {sendMail && (
                                            <Input
                                                type="email"
                                                placeholder={mailDeCarga || 'email@empresa.com'}
                                                value={mailEmail}
                                                onChange={e => setMailEmail(e.target.value)}
                                                className="h-7 text-[11px]"
                                                onClick={e => e.stopPropagation()}
                                                onKeyDown={e => e.stopPropagation()}
                                            />
                                        )}
                                    </div>
                                )}
                            </div>

                            <DropdownMenuSeparator />

                            {/* ── Botón exportar ── */}
                            <Button
                                onClick={e => { e.stopPropagation(); handleExcelExport(); }}
                                disabled={isGenerating}
                                className="w-full h-8 text-xs gap-2 bg-violet-600 hover:bg-violet-700 text-white"
                            >
                                {isGenerating ? (
                                    <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Preparando ZIP...</>
                                ) : (
                                    <><FileSpreadsheet className="h-3.5 w-3.5" /> Exportar Excel</>
                                )}
                            </Button>

                        </DropdownMenuSubContent>
                    </DropdownMenuSub>
                ) : (
                    <DropdownMenuItem
                        onClick={() => handleExcelExport()}
                        className="text-xs sm:text-sm gap-2 cursor-pointer"
                    >
                        <FileSpreadsheet className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                        <span>Excel (.xlsx)</span>
                    </DropdownMenuItem>
                )}
                <DropdownMenuItem
                    onClick={() => handleSimpleExport('csv')}
                    className="text-xs sm:text-sm gap-2 cursor-pointer"
                >
                    <FileType className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                    <span>CSV (.csv)</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                    onClick={() => handleSimpleExport('json')}
                    className="text-xs sm:text-sm gap-2 cursor-pointer"
                >
                    <FileJson className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                    <span>JSON (.json)</span>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}