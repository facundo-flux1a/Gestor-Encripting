'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { ShieldCheck, Loader2, Bug, AlertOctagon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useCompanyContext } from '@/context/CompanyProvider';

interface AuditResults {
    success: boolean;
    docsAnalyzed: number;
    isMatch: boolean;
    sql: {
        ingresos: number;
        gastos: number;
        ivaRepercutido: number;
        ivaSoportado: number;
    };
    nodejs: {
        ingresos: number;
        gastos: number;
        ivaRepercutido: number;
        ivaSoportado: number;
    };
}

export function IntegrityAuditButton({ año, trimestre }: { año?: number | null, trimestre?: number | null }) {
    const [isOpen, setIsOpen] = useState(false);
    const [isAuditing, setIsAuditing] = useState(false);
    const [results, setResults] = useState<AuditResults | null>(null);
    const { selectedCompanyIds } = useCompanyContext();
    const { toast } = useToast();

    const handleAudit = async () => {
        setIsAuditing(true);
        setResults(null);

        try {
            const res = await fetch('/api/debug/audit', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    empresaIds: selectedCompanyIds.map(Number),
                    año,
                    trimestre
                })
            });

            if (!res.ok) throw new Error('Error al ejecutar auditoría');

            const data = await res.json();
            setResults(data);

            if (data.isMatch) {
                toast({
                    title: "✅ Auditoría Exitosa",
                    description: "Los valores del Dashboard coinciden perfectamente con el sumatorio iterativo ciego de las facturas.",
                    className: "bg-green-600 text-white"
                });
            }

        } catch (e: any) {
            toast({
                title: "Error de Auditoría",
                description: e.message || "No se pudo completar la verificación",
                variant: "destructive"
            });
        } finally {
            setIsAuditing(false);
        }
    };

    const formatCurrency = (val: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(val);

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-400 group transition-all"
                >
                    <ShieldCheck className="h-4 w-4 group-hover:scale-110 transition-transform" />
                    <span className="hidden lg:inline">Comprobar SQL</span>
                </Button>
            </DialogTrigger>

            <DialogContent className="max-w-2xl bg-slate-950 border-slate-800 text-slate-200">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-xl text-emerald-400">
                        <Bug className="h-5 w-5" />
                        Depurador de Integridad Contable
                    </DialogTitle>
                    <DialogDescription className="text-slate-400">
                        Esta herramienta recalcula absolutamente TODOS los documentos uno por uno en la memoria del servidor usando JS iterativo, y lo compara de forma paranoica contra el total devuelto por las consultas SQL ultra-rápidas del Servidor.
                    </DialogDescription>
                </DialogHeader>

                {!results && !isAuditing && (
                    <div className="flex flex-col items-center justify-center p-8 gap-4">
                        <AlertOctagon className="h-12 w-12 text-slate-600" />
                        <p className="text-center text-sm text-slate-400 max-w-sm">
                            Pulsa Iniciar para ejecutar una verificación forense exhaustiva sobre las sumas almacenadas actualmente en tu pantalla.
                        </p>
                        <Button onClick={handleAudit} className="bg-emerald-600 hover:bg-emerald-500 text-white">
                            Iniciar Auditoría
                        </Button>
                    </div>
                )}

                {isAuditing && (
                    <div className="flex flex-col items-center justify-center p-12 gap-4">
                        <Loader2 className="h-8 w-8 text-emerald-500 animate-spin" />
                        <p className="text-sm text-slate-400 animate-pulse">Obteniendo miles de filas y totalizando...</p>
                    </div>
                )}

                {results && (
                    <div className="space-y-6">
                        <div className={`p-4 rounded-lg flex items-center justify-between border ${results.isMatch ? 'bg-emerald-950/30 border-emerald-800' : 'bg-red-950/30 border-red-800'}`}>
                            <div>
                                <h4 className={`font-bold ${results.isMatch ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {results.isMatch ? "¡MATEMÁTICA PERFECTA!" : "DESCUADRE DETECTADO"}
                                </h4>
                                <p className="text-xs text-slate-400 mt-1">
                                    Se analizaron <b>{results.docsAnalyzed}</b> documentos para {año ? año : "Histórico"} {trimestre ? `(T${trimestre})` : ""}.
                                </p>
                            </div>
                            <div>
                                {results.isMatch && <ShieldCheck className="h-8 w-8 text-emerald-500" />}
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2 text-sm border-b border-slate-800 pb-2">
                            <div className="font-bold text-slate-500">Métrica</div>
                            <div className="font-bold text-right text-blue-400">Motor SQL (Dashboard)</div>
                            <div className="font-bold text-right text-purple-400">Iteración Node.JS (Verdad Ciega)</div>
                        </div>

                        <div className="space-y-3">
                            {[
                                { label: 'Ingresos Totales', sql: results.sql.ingresos, nodejs: results.nodejs.ingresos },
                                { label: 'Gastos Totales', sql: results.sql.gastos, nodejs: results.nodejs.gastos },
                                { label: 'IVA Soportado', sql: results.sql.ivaSoportado, nodejs: results.nodejs.ivaSoportado },
                                { label: 'IVA Repercutido', sql: results.sql.ivaRepercutido, nodejs: results.nodejs.ivaRepercutido }
                            ].map((row, i) => {
                                const diff = Math.abs(row.sql - row.nodejs);
                                const isError = diff > 0.05;
                                return (
                                    <div key={i} className={`grid grid-cols-3 gap-2 text-sm items-center p-2 rounded ${isError ? 'bg-red-950/20' : 'hover:bg-slate-900'}`}>
                                        <div className="font-medium">{row.label}</div>
                                        <div className="text-right text-blue-300 font-mono">{formatCurrency(row.sql)}</div>
                                        <div className="text-right flex items-center justify-end gap-2">
                                            <span className={`font-mono ${isError ? 'text-red-400 line-through' : 'text-purple-300'}`}>
                                                {formatCurrency(row.nodejs)}
                                            </span>
                                            {isError && (
                                                <span className="text-[10px] text-red-500 font-bold bg-red-950/50 px-1 rounded">
                                                    Δ {formatCurrency(diff)}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>

                        <div className="flex justify-end pt-4 border-t border-slate-800">
                            <Button variant="outline" onClick={handleAudit}>Repetir Pruebas</Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
