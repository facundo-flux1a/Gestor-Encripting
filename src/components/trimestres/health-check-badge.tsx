import React from 'react';
import { Badge } from '@/components/ui/badge';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Info, CheckCircle2, AlertTriangle, XCircle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import Link from 'next/link';

interface Mismatch {
    num_doc: string;
    id?: string | number;
    diff?: number;
    issue?: string;
    header_base?: number;
    lines_base?: number;
    total_db?: number;
    total_calc?: number;
    doc_base?: number;
    doc_iva?: number;
    doc_rec?: number;
    doc_ret?: number;
}

interface HealthCheckBadgeProps {
    healthScore: number;
    lastCheck: string;
    totalMismatches: Mismatch[];
    baseMismatches: Mismatch[];
    deducedDocs: Mismatch[];
    docCount: number;
}

export function HealthCheckBadge({
    healthScore,
    lastCheck,
    totalMismatches,
    baseMismatches,
    deducedDocs,
    docCount
}: HealthCheckBadgeProps) {
    const isPerfect = healthScore >= 100;
    const isGood = healthScore >= 95;
    const isPoor = healthScore < 95;

    const totalIssues = totalMismatches.length + baseMismatches.length + deducedDocs.length;

    const formattedDate = new Date(lastCheck).toLocaleString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/Madrid'
    });

    return (
        <Popover>
            <PopoverTrigger asChild>
                <div className="flex items-center gap-2 cursor-pointer group">
                    <Badge
                        variant="outline"
                        className={cn(
                            "gap-1.5 py-1 px-3 border-2 transition-all duration-300 group-hover:scale-105",
                            isPerfect ? "border-green-500/50 bg-green-500/10 text-green-600" :
                                isGood ? "border-amber-500/50 bg-amber-500/10 text-amber-600" :
                                    "border-red-500/50 bg-red-500/10 text-red-600"
                        )}
                    >
                        {isPerfect ? <CheckCircle2 className="w-3.5 h-3.5" /> :
                            isGood ? <AlertTriangle className="w-3.5 h-3.5" /> :
                                <XCircle className="w-3.5 h-3.5" />}
                        <span className="font-bold tabular-nums">Health Check: {healthScore.toFixed(1)}%</span>
                    </Badge>
                </div>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0 overflow-hidden" align="start">
                <div className={cn(
                    "p-3 text-white flex items-center justify-between",
                    isPerfect ? "bg-green-600" : isGood ? "bg-amber-600" : "bg-red-600"
                )}>
                    <div className="flex items-center gap-2">
                        <Info className="w-4 h-4" />
                        <span className="font-bold text-sm">Estado de Datos</span>
                    </div>
                    <span className="text-[10px] opacity-80 flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {formattedDate}
                    </span>
                </div>

                <div className="p-3 space-y-4">
                    <div className="grid grid-cols-2 gap-2 text-center">
                        <div className="p-2 border rounded bg-muted/30">
                            <div className="text-[10px] text-muted-foreground uppercase font-bold">Documentos</div>
                            <div className="text-lg font-bold">{docCount}</div>
                        </div>
                        <div className="p-2 border rounded bg-muted/30">
                            <div className="text-[10px] text-muted-foreground uppercase font-bold">Incidencias</div>
                            <div className={cn("text-lg font-bold", totalIssues > 0 ? "text-destructive" : "text-green-600")}>
                                {totalIssues}
                            </div>
                        </div>
                    </div>

                    <ScrollArea className="h-96 pr-4">
                        <div className="space-y-4">
                            {/* Total Mismatches */}
                            {totalMismatches.length > 0 && (
                                <div className="space-y-1.5">
                                    <div className="text-[11px] font-bold text-red-500 flex items-center gap-1 uppercase">
                                        <XCircle className="w-3 h-3" /> Error de Suma Logica
                                    </div>
                                    <ul className="text-[10px] space-y-3">
                                        {totalMismatches.map((m, i) => (
                                            <li key={i} className="flex flex-col border-b pb-2 border-muted/50 last:border-0 italic group/item">
                                                <div className="flex justify-between items-center mb-1">
                                                    <Link
                                                        href={`/documento/${m.id}`}
                                                        className="hover:text-blue-500 hover:underline transition-colors cursor-pointer font-bold"
                                                    >
                                                        {m.num_doc}
                                                    </Link>
                                                    <span className="font-bold text-red-500">+{m.diff?.toFixed(2)}€</span>
                                                </div>
                                                <div className="p-1.5 bg-muted/20 rounded text-[9px] text-muted-foreground not-italic">
                                                    <div className="flex justify-between">
                                                        <span>Registrado:</span>
                                                        <span className="font-bold">{Math.abs(m.total_db || 0).toFixed(2)}€</span>
                                                    </div>
                                                    <div className="flex justify-between border-b border-muted/30 pb-0.5 mb-0.5">
                                                        <span>Calculado:</span>
                                                        <span className="font-bold">{Math.abs(m.total_calc || 0).toFixed(2)}€</span>
                                                    </div>
                                                    <div className="opacity-70 grid grid-cols-2 gap-x-2">
                                                        <span>Base: {m.doc_base?.toFixed(2)}€</span>
                                                        <span>IVA: {m.doc_iva?.toFixed(2)}€</span>
                                                        <span>Rec: {m.doc_rec?.toFixed(2)}€</span>
                                                        <span>Ret: {m.doc_ret?.toFixed(2)}€</span>
                                                    </div>
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {/* Base Mismatches */}
                            {baseMismatches.length > 0 && (
                                <div className="space-y-1.5">
                                    <div className="text-[11px] font-bold text-amber-500 flex items-center gap-1 uppercase">
                                        <AlertTriangle className="w-3 h-3" /> Inconsistencia de Desglose
                                    </div>
                                    <ul className="text-[10px] space-y-1">
                                        {baseMismatches.map((m, i) => (
                                            <li key={i} className="flex flex-col border-b pb-1 border-muted/50 last:border-0 italic">
                                                <Link
                                                    href={`/documento/${m.id}`}
                                                    className="font-semibold hover:text-blue-500 hover:underline transition-colors cursor-pointer"
                                                >
                                                    {m.num_doc}
                                                </Link>
                                                <div className="flex justify-between text-[9px] opacity-70">
                                                    <span>Base Doc: {m.header_base?.toFixed(2)}€</span>
                                                    <span>Suma Líneas: {m.lines_base?.toFixed(2)}€</span>
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {/* Deduced Docs */}
                            {deducedDocs.length > 0 && (
                                <div className="space-y-1.5">
                                    <div className="text-[11px] font-bold text-blue-500 flex items-center gap-1 uppercase">
                                        <Info className="w-3 h-3" /> Desglose Deducido
                                    </div>
                                    <ul className="text-[10px] space-y-1">
                                        {deducedDocs.map((m, i) => (
                                            <li key={i} className="flex justify-between border-b pb-1 border-muted/50 last:border-0 italic text-muted-foreground">
                                                <Link
                                                    href={`/documento/${m.id}`}
                                                    className="hover:text-blue-500 hover:underline transition-colors cursor-pointer"
                                                >
                                                    {m.num_doc}
                                                </Link>
                                                <span>{m.issue}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {isPerfect && (
                                <div className="h-full flex flex-col items-center justify-center py-8 text-muted-foreground opacity-50 italic">
                                    <CheckCircle2 className="w-12 h-12 mb-2 text-green-500/30" />
                                    <p className="text-xs">No se han encontrado discrepancias matemáticas.</p>
                                </div>
                            )}
                        </div>
                    </ScrollArea>
                </div>
            </PopoverContent>
        </Popover>
    );
}
