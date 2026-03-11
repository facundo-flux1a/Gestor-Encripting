'use client';

import React, { useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Document } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, ChevronDown, ChevronUp, LayoutGrid } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';

// Dynamic import with SSR disabled for FortuneSheet
const Workbook = dynamic(
    () => import('@fortune-sheet/react').then((mod) => mod.Workbook),
    { ssr: false }
);

// Import FortuneSheet styles
import '@fortune-sheet/react/dist/index.css';

interface TrimestreExcelViewProps {
    documents: Document[];
    isLoading: boolean;
    año: number;
}

// --- INTERNAL HELPERS ---

const rates = [21, 15, 10, 4, 0];
const types = ['base', 'iva'];

const createEmptySummary = () => {
    const sum: any = {
        retenciones: { 1: 0, 2: 0, 3: 0, 4: 0, total: 0 },
        recargos: { 1: 0, 2: 0, 3: 0, 4: 0, total: 0 },
        total_real: { 1: 0, 2: 0, 3: 0, 4: 0, total: 0 }
    };
    types.forEach(type => {
        rates.forEach(rate => {
            if (type === 'iva' && rate === 0) return;
            sum[`${type}_${rate}`] = { 1: 0, 2: 0, 3: 0, 4: 0, total: 0 };
        });
    });
    return sum;
};

const calculateAnnualSummary = (data: Document[]) => {
    const ingresosSum = createEmptySummary();
    const gastosSum = createEmptySummary();
    const totalNetoSum = createEmptySummary();


    data.forEach((doc, index) => {
        let q = doc.num_trimestre;
        if (!q && doc.fecha_emision) {
            const month = new Date(doc.fecha_emision).getMonth() + 1;
            q = Math.ceil(month / 3);
        }

        // Usar importe_total como fallback de total
        const docTotalVal = Number(doc.total ?? (doc as any).importe_total ?? 0);

        // DETERMINAR SI ES EMITIDO (INGRESO) O RECIBIDO (GASTO)
        // Priorizar is_issued del backend (0 o 1)
        let isIssued = false;
        if (doc.is_issued !== undefined && doc.is_issued !== null) {
            isIssued = Number(doc.is_issued) === 1;
        } else {
            // Heurística de respaldo
            isIssued = doc.entidades?.some(e =>
                (e.rol === 'emisor' || e.rol === 'proveedor') &&
                doc.empresa_cif && e.identificador_fiscal?.trim().toLowerCase() === doc.empresa_cif.trim().toLowerCase()
            ) ?? docTotalVal >= 0;
        }

        if (!q || q < 1 || q > 4) return;

        const tipoLower = (doc.tipo_documento || '').toLowerCase();
        const esAbono = tipoLower.includes('abono') || tipoLower.includes('crédito') || tipoLower.includes('credito') || docTotalVal < 0;

        const targetSum = isIssued ? ingresosSum : gastosSum;
        const absSign = esAbono ? -1 : 1;

        const docTotal = Math.abs(docTotalVal) * absSign;
        targetSum.total_real[q] += docTotal;
        targetSum.total_real.total += docTotal;

        const netoBaseSign = isIssued ? 1 : -1;
        const netoSign = esAbono ? (netoBaseSign * -1) : netoBaseSign;
        const docTotalNeto = Math.abs(docTotalVal) * netoSign;
        totalNetoSum.total_real[q] += docTotalNeto;
        totalNetoSum.total_real.total += docTotalNeto;

        let hasIvaDetails = false;
        if (doc.iva_details && Array.isArray(doc.iva_details) && doc.iva_details.length > 0) {
            hasIvaDetails = true;
            doc.iva_details.forEach((detail: any) => {
                const tipoIva = (detail.tipo_impuesto || '').toLowerCase();
                const cuota = Math.abs(Number(detail.cuota) || 0);
                const cuotaAbs = cuota * absSign;
                const cuotaNeto = cuota * netoSign;

                if (tipoIva.includes('retencion')) {
                    targetSum.retenciones[q] += cuotaAbs;
                    targetSum.retenciones.total += cuotaAbs;
                    totalNetoSum.retenciones[q] += cuotaNeto;
                    totalNetoSum.retenciones.total += cuotaNeto;
                    return;
                }

                if (tipoIva.includes('recargo') || tipoIva.includes('equivalencia')) {
                    targetSum.recargos[q] += cuotaAbs;
                    targetSum.recargos.total += cuotaAbs;
                    totalNetoSum.recargos[q] += cuotaNeto;
                    totalNetoSum.recargos.total += cuotaNeto;
                    return;
                }

                const rate = Math.round(Number(detail.porcentaje));
                const keyBase = `base_${rate}`;
                if (targetSum[keyBase]) {
                    const base = Math.abs(Number(detail.base_imponible) || 0);
                    const baseAbs = base * absSign;
                    const baseNeto = base * netoSign;

                    targetSum[keyBase][q] += baseAbs;
                    targetSum[keyBase].total += baseAbs;

                    totalNetoSum[keyBase][q] += baseNeto;
                    totalNetoSum[keyBase].total += baseNeto;
                }

                const keyIva = `iva_${rate}`;
                if (targetSum[keyIva]) {
                    targetSum[keyIva][q] += cuotaAbs;
                    targetSum[keyIva].total += cuotaAbs;

                    totalNetoSum[keyIva][q] += cuotaNeto;
                    totalNetoSum[keyIva].total += cuotaNeto;
                }
            });
        }

        // Si no hay detalles de IVA, imputar todo a Base 21% para que no desaparezca de la tabla
        if (!hasIvaDetails) {
            const baseAbs = Math.abs(docTotalVal) * absSign;
            const baseNeto = Math.abs(docTotalVal) * netoSign;

            targetSum['base_21'][q] += baseAbs;
            targetSum['base_21'].total += baseAbs;
            totalNetoSum['base_21'][q] += baseNeto;
            totalNetoSum['base_21'].total += baseNeto;
        }
    });

    return { ingresosSum, gastosSum, totalNetoSum };
};

export function TrimestreExcelView({ documents, isLoading, año }: TrimestreExcelViewProps) {
    const renderCount = React.useRef(0);
    const workbookRef = React.useRef<any>(null);
    const isProcessingRef = React.useRef(false);
    const [isExpanded, setIsExpanded] = useState(false);

    renderCount.current++;
    console.log(`🔄 [TrimestreExcelView] Render #${renderCount.current}`);

    const excelHooks = useMemo(() => ({
        beforeUpdateCell: (r: number, c: number, value: any) => {
            if (isProcessingRef.current) {
                console.log(`🚫 [FortuneSheet] Skipping beforeUpdateCell [${r},${c}] (Recursive call)`);
                return true;
            }

            console.log(`🧪 [FortuneSheet] beforeUpdateCell [${r},${c}]:`, {
                value,
                type: typeof value,
                isString: typeof value === 'string',
                startsWithEquals: typeof value === 'string' && value.startsWith('=')
            });

            // ROBUST SANITIZER: Detect and fix ANY doubling patterns (e.g. "=SUM=SUM(A1:B1)" or "=A1-B1=A1-B1")
            if (typeof value === 'string' && value.startsWith('=') && value.indexOf('=', 1) !== -1) {
                const parts = value.split('=').filter(p => p.trim().length > 0);
                console.log(`🧩 [FortuneSheet] Sanitizer splitting parts:`, parts);

                if (parts.length >= 2) {
                    const lastPart = parts[parts.length - 1];
                    // STRIP NEWLINES AND WHITESPACE
                    const fixed = `=${lastPart.replace(/[\n\r]/g, '').trim()}`;

                    console.warn(`⚠️ [FortuneSheet] Doubling with newlines detected! Sanitizing: "${value.replace(/\n/g, '\\n')}" -> "${fixed}"`);

                    if (workbookRef.current) {
                        // Use setTimeout to avoid race conditions with FortuneSheet's internal state (ChildNodes error)
                        setTimeout(() => {
                            if (!workbookRef.current) return;
                            isProcessingRef.current = true;
                            console.log(`📡 [FortuneSheet] (Delayed) Manually setting cell [${r},${c}] to: ${fixed}`);
                            try {
                                workbookRef.current.setCellValue(r, c, fixed);
                                if (workbookRef.current.calculateFormula) {
                                    workbookRef.current.calculateFormula();
                                }
                            } catch (err) {
                                console.error(`❌ [FortuneSheet] Error during delayed manual update:`, err);
                            } finally {
                                isProcessingRef.current = false;
                            }
                        }, 0);
                    } else {
                        console.error(`❌ [FortuneSheet] workbookRef is NULL, cannot fix manually!`);
                    }
                    return false; // Intercept and cancel the corrupted original update
                }
            }
            return true;
        },
        afterUpdateCell: (r: number, c: number, oldVal: any, newVal: any) => {
            console.log(`✅ [FortuneSheet] afterUpdateCell [${r},${c}]:`, {
                oldVal,
                newVal,
                newValV: newVal?.v,
                newValF: newVal?.f,
                newValM: newVal?.m
            });
        }
    }), []);

    const excelData = useMemo(() => {

        if (isLoading || documents.length === 0) {
            return null;
        }

        const { ingresosSum, gastosSum, totalNetoSum } = calculateAnnualSummary(documents);

        const quarters = [1, 2, 3, 4];

        const formatValue = (val: number, customStyle: any = {}) => ({
            v: val,
            m: new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val),
            ct: { fa: '#,##0.00', t: 'n' },
            ...customStyle
        });

        // REVERSIÓN: Estilos claros para máxima legibilidad
        // PREMIUM DARK THEME STYLES
        const headerStyle = { ht: 1, vt: 1, bg: '#1e293b', fc: '#f8fafc', b: 1 };
        const titleStyle = { ht: 0, vt: 1, bg: '#0f172a', fc: '#ffffff', b: 1 };
        const rowHeaderStyle = { ht: 0, vt: 1, bg: '#334155', fc: '#f1f5f9' };
        const normalCellStyle = { ht: 1, vt: 1, bg: '#1e293b', fc: '#cbd5e1' };

        // --- CONVERT TO CELLDATA (Sparse format) ---
        const celldata: any[] = [];
        let currentRow = 0;

        const addTableToCelldata = (title: string, summary: any, accentColor: string) => {
            // Title Row
            celldata.push({
                r: currentRow,
                c: 0,
                v: {
                    v: title.toUpperCase(),
                    ...titleStyle,
                    fc: accentColor,
                    mc: { r: currentRow, c: 0, rs: 1, cs: 6 }
                }
            });
            currentRow++;

            // Header Row
            const headers = ['Concepto', '1º Trimestre', '2º Trimestre', '3º Trimestre', '4º Trimestre', 'TOTAL'];
            headers.forEach((h, i) => {
                celldata.push({ r: currentRow, c: i, v: { v: h, ...headerStyle } });
            });
            currentRow++;

            // Data Rows (Bases)
            rates.forEach(rate => {
                const key = `base_${rate}`;
                if (summary[key] && (summary[key].total !== 0 || quarters.some(q => summary[key][q] !== 0))) {
                    celldata.push({ r: currentRow, c: 0, v: { v: `Base ${rate}%`, ...rowHeaderStyle } });
                    quarters.forEach((q, i) => {
                        celldata.push({ r: currentRow, c: i + 1, v: formatValue(summary[key][q], normalCellStyle) });
                    });
                    celldata.push({ r: currentRow, c: 5, v: formatValue(summary[key].total, { ...normalCellStyle, b: 1, fc: '#ffffff' }) });
                    currentRow++;
                }
            });

            // Data Rows (IVA)
            rates.forEach(rate => {
                const key = `iva_${rate}`;
                if (summary[key] && (summary[key].total !== 0 || quarters.some(q => summary[key][q] !== 0))) {
                    celldata.push({ r: currentRow, c: 0, v: { v: `IVA ${rate}%`, ...rowHeaderStyle } });
                    quarters.forEach((q, i) => {
                        celldata.push({ r: currentRow, c: i + 1, v: formatValue(summary[key][q], normalCellStyle) });
                    });
                    celldata.push({ r: currentRow, c: 5, v: formatValue(summary[key].total, { ...normalCellStyle, b: 1, fc: '#ffffff' }) });
                    currentRow++;
                }
            });

            // Totals
            celldata.push({ r: currentRow, c: 0, v: { v: 'Total Bases', ...rowHeaderStyle, b: 1, fc: '#94a3b8' } });
            quarters.forEach((q, i) => {
                let sum = 0;
                rates.forEach(r => sum += summary[`base_${r}`]?.[q] || 0);
                celldata.push({ r: currentRow, c: i + 1, v: formatValue(sum, { ...normalCellStyle, b: 1 }) });
            });
            const totalBases = rates.reduce((acc, r) => acc + (summary[`base_${r}`]?.total || 0), 0);
            celldata.push({ r: currentRow, c: 5, v: formatValue(totalBases, { ...normalCellStyle, bg: '#0f172a', b: 1, fc: '#ffffff' }) });
            currentRow++;

            celldata.push({ r: currentRow, c: 0, v: { v: 'Total IVA', ...rowHeaderStyle, b: 1, fc: '#94a3b8' } });
            quarters.forEach((q, i) => {
                let sum = 0;
                rates.forEach(r => sum += summary[`iva_${r}`]?.[q] || 0);
                celldata.push({ r: currentRow, c: i + 1, v: formatValue(sum, { ...normalCellStyle, b: 1 }) });
            });
            const totalIva = rates.reduce((acc, r) => acc + (summary[`iva_${r}`]?.total || 0), 0);
            celldata.push({ r: currentRow, c: 5, v: formatValue(totalIva, { ...normalCellStyle, bg: '#0f172a', b: 1, fc: '#ffffff' }) });
            currentRow++;

            if (summary.recargos.total !== 0) {
                celldata.push({ r: currentRow, c: 0, v: { v: 'Total Recargos', ...rowHeaderStyle } });
                quarters.forEach((q, i) => {
                    celldata.push({ r: currentRow, c: i + 1, v: formatValue(summary.recargos[q], normalCellStyle) });
                });
                celldata.push({ r: currentRow, c: 5, v: formatValue(summary.recargos.total, { ...normalCellStyle, b: 1, fc: '#ffffff' }) });
                currentRow++;
            }
            if (summary.retenciones.total !== 0) {
                celldata.push({ r: currentRow, c: 0, v: { v: 'Total Retenciones', ...rowHeaderStyle } });
                quarters.forEach((q, i) => {
                    celldata.push({ r: currentRow, c: i + 1, v: formatValue(summary.retenciones[q], normalCellStyle) });
                });
                celldata.push({ r: currentRow, c: 5, v: formatValue(summary.retenciones.total, { ...normalCellStyle, b: 1, fc: '#ffffff' }) });
                currentRow++;
            }

            // Facturado Final
            celldata.push({ r: currentRow, c: 0, v: { v: 'Total Gral. Facturado', ...rowHeaderStyle, bg: '#334155', fc: '#ffffff', b: 1 } });
            quarters.forEach((q, i) => {
                celldata.push({ r: currentRow, c: i + 1, v: formatValue(summary.total_real[q], { ...normalCellStyle, b: 1, bg: '#1e293b', fc: '#ffffff' }) });
            });
            celldata.push({ r: currentRow, c: 5, v: formatValue(summary.total_real.total, { bg: accentColor, fc: '#ffffff', b: 1 }) });
            currentRow++;

            currentRow += 2; // Spacer
        };

        addTableToCelldata(`Resumen Anual (Ingresos) - ${año}`, ingresosSum, '#10b981');
        addTableToCelldata(`Resumen Anual (Gastos) - ${año}`, gastosSum, '#ef4444');
        addTableToCelldata(`Balance Anual (Total Neto) - ${año}`, totalNetoSum, '#3b82f6');


        return [{
            name: "Resumen Anual",
            celldata: celldata,
            status: 1,
            order: 0,
            column: 6,
            row: currentRow,
            addRows: 0,
            defaultColWidth: 150,
            config: {
                gridlineColor: '#1e293b'
            } as any
        }];
    }, [documents, isLoading, año]);

    if (isLoading) {
        return (
            <Card className="w-full mb-6 bg-slate-900 border-slate-800">
                <CardHeader>
                    <Skeleton className="h-4 w-48 bg-slate-800" />
                </CardHeader>
                <CardContent>
                    <Skeleton className="h-[400px] w-full bg-slate-800" />
                </CardContent>
            </Card>
        );
    }

    if (!excelData || documents.length === 0) return null;

    return (
        <Card className="w-full mb-8 overflow-hidden border-slate-800 bg-slate-900 shadow-2xl transition-all duration-300">
            <CardHeader
                className="bg-slate-950/80 border-b border-slate-800 py-4 px-6 flex flex-row items-center justify-between space-y-0 cursor-pointer hover:bg-slate-900/40 transition-colors"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <CardTitle className="text-base font-bold flex items-center gap-3 text-slate-100">
                    <div className="p-2 bg-blue-500/20 text-blue-400 rounded-lg border border-blue-500/30">
                        <LayoutGrid className="h-5 w-5" />
                    </div>
                    Cuadro de Mando Interactivo {año}
                </CardTitle>
                <div className="flex items-center gap-4">
                    <div className="hidden sm:flex items-center gap-3 mr-2">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter bg-slate-800/50 px-2 py-1 rounded">
                            Ejercicio Consolidado
                        </span>
                        <div className="h-4 w-px bg-slate-800" />
                        <span className="text-[10px] text-blue-400 font-medium">Auto-calculado vía API</span>
                    </div>
                    <button
                        className={`p-2 rounded-full transition-all duration-300 ${isExpanded ? 'bg-blue-500 text-white rotate-0' : 'bg-slate-800 text-slate-400 rotate-180'}`}
                    >
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                </div>
            </CardHeader>
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.4, ease: [0.04, 0.62, 0.23, 0.98] }}
                    >
                        <CardContent className="p-0">
                            <div className="h-[700px] w-full relative bg-[#0f172a]">
                                <style dangerouslySetInnerHTML={{
                                    __html: `
                        .fortune-container { background: #0f172a !important; font-family: 'Inter', system-ui, -apple-system, sans-serif !important; }
                        .fortune-workbook-content { background: #0f172a !important; color: #cbd5e1 !important; }
                        .fortune-sheet-area { background: #0f172a !important; }
                        .fortune-toolbar { background: #1e293b !important; border-bottom: 1px solid #334155 !important; }
                        
                        /* Formula Bar Modernization */
                        .fortune-formula-bar { background: #0f172a !important; border-bottom: 1px solid #1e293b !important; color: #fff !important; padding: 6px 12px !important; }
                        .fortune-formula-help-size { background: #0f172a !important; color: #64748b !important; border: none !important; }
                        .fortune-formula-input { 
                            background: #1e293b !important; 
                            border: 1px solid #334155 !important; 
                            color: #ffffff !important; 
                            border-radius: 6px !important; 
                            padding: 2px 10px !important;
                            font-family: 'Inter', sans-serif !important;
                            font-size: 13px !important;
                        }
                        .fortune-formula-bar-icon { color: #3b82f6 !important; font-size: 14px !important; }
                        
                        .fortune-grid-window { background: #0f172a !important; }
                        .fortune-sheet-selection-item { border-color: #3b82f6 !important; background: rgba(59, 130, 246, 0.1) !important; }
                        
                        /* CRITICAL: High-contrast Row/Col Headers - Fully Transparent to avoid overlapping */
                        .fortune-row-header, .fortune-col-header { 
                            background: transparent !important; 
                            border-color: #334155 !important; 
                        }
                        
                        .fortune-row-header > div, 
                        .fortune-col-header > div,
                        .luckysheet-rows-h-idx, 
                        .luckysheet-cols-h-idx,
                        .fortune-header-cell-text {
                            color: #ffffff !important; 
                            font-weight: 700 !important;
                            font-size: 11px !important;
                            text-shadow: 0 1px 2px rgba(0,0,0,1) !important;
                        }

                        .fortune-row-header:hover, .fortune-col-header:hover { background: #334155 !important; }
                        .fortune-sheet-tabs { background: #1e293b !important; border-top: 1px solid #334155 !important; padding: 4px !important; }
                        .fortune-sheet-tabs-item-active { background: #3b82f6 !important; color: #fff !important; border-radius: 4px !important; border: none !important; }
                        
                        /* SHARPNESS & ANTI-BLURRY */
                        .fortune-cell, .fortune-container, canvas { 
                            text-rendering: optimizeLegibility !important; 
                            -webkit-font-smoothing: antialiased !important; 
                            -moz-osx-font-smoothing: grayscale !important;
                            transform: translateZ(0); /* Force hardware acceleration */
                        }
                        
                        canvas { 
                            image-rendering: -webkit-optimize-contrast !important; 
                            image-rendering: crisp-edges !important;
                            image-rendering: -moz-crisp-edges !important;
                        }
                        
                        .fortune-workbook { 
                            border-radius: 0 0 12px 12px !important; 
                            overflow: hidden !important; 
                            border: 1px solid #1e293b !important;
                            box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3) !important;
                        }

                        /* Cell Editor Visibility Fix - Ensure text is dark and background is light while editing */
                        .luckysheet-input-box, .fortune-cell-editor {
                            color: #0f172a !important; 
                            background: white !important;
                        }
                    `}} />
                                <Workbook
                                    ref={workbookRef}
                                    data={excelData}
                                    lang="es"
                                    showToolbar={false}
                                    showFormulaBar={true}
                                    rowHeaderWidth={64}
                                    columnHeaderHeight={32}
                                    devicePixelRatio={typeof window !== 'undefined' ? window.devicePixelRatio : 1}
                                    addRows={0}
                                    forceCalculation={true}
                                    hooks={excelHooks}
                                    onChange={(data) => {
                                        console.log('📊 [FortuneSheet] Data Changed (onChange)');
                                    }}
                                    onOp={(ops) => {
                                        console.log('📑 [FortuneSheet] Operations (onOp)');
                                    }}
                                />
                            </div>
                        </CardContent>
                    </motion.div>
                )}
            </AnimatePresence>
        </Card>
    );
}
