'use client';

import React, { useMemo, useState, useCallback } from 'react';
import { Document } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronDown, ChevronUp, LayoutGrid, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

// AG Grid Imports
import { AgGridReact } from 'ag-grid-react';
import {
    ColDef,
    ValueFormatterParams,
    ValueParserParams,
    ModuleRegistry,
    AllCommunityModule,
    themeQuartz,
    colorSchemeDark
} from 'ag-grid-community';

// Register AG Grid Modules
ModuleRegistry.registerModules([AllCommunityModule]);

// Define the Quartz Dark theme
const darkTheme = themeQuartz.withPart(colorSchemeDark);

interface TrimestreExcelViewProps {
    documents: Document[];
    isLoading: boolean;
    año: number;
    selectedTrimestre?: number | null;
}

// --- INTERNAL HELPERS ---

const rates = [21, 15, 10, 4, 0];
const types = ['base', 'iva'];

const createEmptySummary = () => {
    const sum: any = {
        retenciones: { 1: 0, 2: 0, 3: 0, 4: 0, total: 0 },
        recargos: { 1: 0, 2: 0, 3: 0, 4: 0, total: 0 },
        total_real: { 1: 0, 2: 0, 3: 0, 4: 0, total: 0 },
        iva_db: {} as any,
        iva_docs: {} as any
    };
    types.forEach(type => {
        rates.forEach(rate => {
            const key = `${type}_${rate}`;
            sum[key] = { 1: 0, 2: 0, 3: 0, 4: 0, total: 0 };
            if (type === 'iva') {
                sum.iva_db[rate] = { 1: 0, 2: 0, 3: 0, 4: 0, total: 0 };
                sum.iva_docs[rate] = { 1: [], 2: [], 3: [], 4: [] };
            }
        });
    });
    return sum;
};

const calculateAnnualSummary = (data: Document[], targetYear?: number) => {
    const foundRatesSet = new Set<number>([21, 15, 10, 4, 0]);
    const ingresosSum = { ...createEmptySummary(), traces: [] as any[], deduced_docs: [] as any[], base_mismatches: [] as any[] };
    const gastosSum = { ...createEmptySummary(), traces: [] as any[], deduced_docs: [] as any[], base_mismatches: [] as any[] };
    const totalNetoSum = { ...createEmptySummary(), traces: [] as any[], deduced_docs: [] as any[], base_mismatches: [] as any[] };

    data.forEach((doc) => {
        // ✅ FILTRO DE SEGURIDAD: Evitar que documentos de otros años se sumen si se colaron en el array
        if (targetYear && doc.año_trimestre && doc.año_trimestre !== targetYear) {
            return;
        }

        let q = doc.num_trimestre;
        if (!q && doc.fecha_emision) {
            const month = new Date(doc.fecha_emision).getMonth() + 1;
            q = Math.ceil(month / 3);
        }

        const docTotalVal = Number(doc.total ?? (doc as any).importe_total ?? 0);

        let isIssued = false;
        if (doc.is_issued !== undefined && doc.is_issued !== null) {
            isIssued = Number(doc.is_issued) === 1;
        } else {
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

        const ivaDetails = (doc as any).iva_details || [];
        const hasIvaDetails = ivaDetails.length > 0;

        let docBaseSum = 0;
        let docIvaSum = 0;
        let docRecSum = 0;
        let docRetSum = 0;

        if (hasIvaDetails) {
            ivaDetails.forEach((detail: any) => {
                const tipoIva = (detail.tipo_impuesto || '').toLowerCase();
                const cuotaVal = Number(detail.cuota || 0);
                const cuotaAbs = cuotaVal * absSign;
                const cuotaNeto = cuotaVal * netoSign;

                if (tipoIva.includes('retencion')) {
                    docRetSum += cuotaVal;
                    targetSum.retenciones[q] += cuotaAbs;
                    targetSum.retenciones.total += cuotaAbs;
                    totalNetoSum.retenciones[q] += cuotaNeto;
                    totalNetoSum.retenciones.total += cuotaNeto;
                    return;
                }

                if (tipoIva.includes('recargo') || tipoIva.includes('equivalencia')) {
                    docRecSum += cuotaVal;
                    targetSum.recargos[q] += cuotaAbs;
                    targetSum.recargos.total += cuotaAbs;
                    totalNetoSum.recargos[q] += cuotaNeto;
                    totalNetoSum.recargos.total += cuotaNeto;
                    return;
                }

                const rate = Math.round(Number(detail.porcentaje));
                const base = Number(detail.base_imponible || 0);
                const cuota = Number(detail.cuota || 0);
                foundRatesSet.add(rate);

                // ✅ SEGURIDAD: Inicializar si el tipo de IVA no existe (p. ej. IVA 5% o tipos raros)
                if (!targetSum.iva_db[rate]) {
                    targetSum.iva_db[rate] = { 1: 0, 2: 0, 3: 0, 4: 0, total: 0 };
                    targetSum.iva_docs[rate] = { 1: [], 2: [], 3: [], 4: [] };
                    targetSum[`iva_${rate}`] = { 1: 0, 2: 0, 3: 0, 4: 0, total: 0 };
                    targetSum[`base_${rate}`] = { 1: 0, 2: 0, 3: 0, 4: 0, total: 0 };
                }
                if (!totalNetoSum.iva_db[rate]) {
                    totalNetoSum.iva_db[rate] = { 1: 0, 2: 0, 3: 0, 4: 0, total: 0 };
                    totalNetoSum.iva_docs[rate] = { 1: [], 2: [], 3: [], 4: [] };
                    totalNetoSum[`iva_${rate}`] = { 1: 0, 2: 0, 3: 0, 4: 0, total: 0 };
                    totalNetoSum[`base_${rate}`] = { 1: 0, 2: 0, 3: 0, 4: 0, total: 0 };
                }

                docBaseSum += base;
                docIvaSum += cuota;

                const theoreticalIva = Math.round(base * rate) / 100;
                if (Math.abs(cuota - theoreticalIva) > 0.01) {
                    const docId = doc.numero_documento || `ID:${doc.id_documento || (doc as any).id}`;
                    const info = `${docId} (${cuota.toFixed(2)}€ vs teor. ${theoreticalIva.toFixed(2)}€)`;
                    targetSum.iva_docs[rate][q].push(info);
                    totalNetoSum.iva_docs[rate][q].push(info);
                }

                targetSum.iva_db[rate][q] += Number(detail.cuota || 0) * absSign;
                targetSum.iva_db[rate].total += Number(detail.cuota || 0) * absSign;
                totalNetoSum.iva_db[rate][q] += Number(detail.cuota || 0) * netoSign;
                totalNetoSum.iva_db[rate].total += Number(detail.cuota || 0) * netoSign;

                const keyBase = `base_${rate}`;
                if (targetSum[keyBase]) {
                    const baseAbs = base * absSign;
                    const baseNeto = base * netoSign;
                    targetSum[keyBase][q] += baseAbs;
                    targetSum[keyBase].total += baseAbs;
                    totalNetoSum[keyBase][q] += baseNeto;
                    totalNetoSum[keyBase].total += baseNeto;
                }
                else {
                    targetSum['base_0'][q] += base * absSign;
                    targetSum['base_0'].total += base * absSign;
                }

                const keyIva = `iva_${rate}`;
                if (targetSum[keyIva]) {
                    const realIvaAbs = cuota * absSign;
                    const realIvaNeto = cuota * netoSign;
                    targetSum[keyIva][q] += realIvaAbs;
                    targetSum[keyIva].total += realIvaAbs;
                    totalNetoSum[keyIva][q] += realIvaNeto;
                    totalNetoSum[keyIva].total += realIvaNeto;
                }
            });
        }

        if (!hasIvaDetails) {
            const baseImponible = Number(doc.base_imponible || docTotalVal);

            let deducedRate = 21; // Default fallback
            let refinedBase = Math.abs(baseImponible);
            let refinedIva = Math.abs(docTotalVal) - refinedBase;

            if (refinedBase > 0 && Math.abs(docTotalVal) > 0) {
                const ratio = Math.abs(docTotalVal) / refinedBase;

                if (Math.abs(ratio - 1.04) < 0.02) deducedRate = 4;
                else if (Math.abs(ratio - 1.10) < 0.02) deducedRate = 10;
                else if (Math.abs(ratio - 1.21) < 0.02) deducedRate = 21;
                else if (Math.abs(ratio - 1.00) < 0.01) {
                    // ✅ CASO SATURADO: El usuario sugiere que se maneje como IVA.
                    // Si Base == Total, probablemente la base incluya el IVA (ej. tickets de restaurante)
                    // Asumimos 21% por defecto para extraer la base real.
                    deducedRate = 21;
                    refinedBase = Math.round((Math.abs(docTotalVal) / 1.21) * 100) / 100;
                    refinedIva = Math.abs(docTotalVal) - refinedBase;
                }
                else deducedRate = 0; // Exento u otros casos
            }

            const deducedIva = refinedIva;
            docBaseSum += refinedBase;
            docIvaSum += deducedIva;

            foundRatesSet.add(deducedRate);

            if (!targetSum.iva_db[deducedRate]) {
                targetSum.iva_db[deducedRate] = { 1: 0, 2: 0, 3: 0, 4: 0, total: 0 };
                targetSum.iva_docs[deducedRate] = { 1: [], 2: [], 3: [], 4: [] };
                targetSum[`iva_${deducedRate}`] = { 1: 0, 2: 0, 3: 0, 4: 0, total: 0 };
                targetSum[`base_${deducedRate}`] = { 1: 0, 2: 0, 3: 0, 4: 0, total: 0 };
            }
            if (!totalNetoSum.iva_db[deducedRate]) {
                totalNetoSum.iva_db[deducedRate] = { 1: 0, 2: 0, 3: 0, 4: 0, total: 0 };
                totalNetoSum.iva_docs[deducedRate] = { 1: [], 2: [], 3: [], 4: [] };
                totalNetoSum[`iva_${deducedRate}`] = { 1: 0, 2: 0, 3: 0, 4: 0, total: 0 };
                totalNetoSum[`base_${deducedRate}`] = { 1: 0, 2: 0, 3: 0, 4: 0, total: 0 };
            }

            const baseAbs = Math.abs(baseImponible) * absSign;
            const baseNeto = Math.abs(baseImponible) * netoSign;
            const ivaAbs = deducedIva * absSign;
            const ivaNeto = deducedIva * netoSign;

            targetSum[`base_${deducedRate}`][q] += baseAbs;
            targetSum[`base_${deducedRate}`].total += baseAbs;
            totalNetoSum[`base_${deducedRate}`][q] += baseNeto;
            totalNetoSum[`base_${deducedRate}`].total += baseNeto;

            targetSum[`iva_${deducedRate}`][q] += ivaAbs;
            targetSum[`iva_${deducedRate}`].total += ivaAbs;
            totalNetoSum[`iva_${deducedRate}`][q] += ivaNeto;
            totalNetoSum[`iva_${deducedRate}`].total += ivaNeto;

            targetSum.iva_db[deducedRate][q] += ivaAbs;
            targetSum.iva_db[deducedRate].total += ivaAbs;
            totalNetoSum.iva_db[deducedRate][q] += ivaNeto;
            totalNetoSum.iva_db[deducedRate].total += ivaNeto;

            // ✅ COLLECT METADATA FOR TOOLTIP
            targetSum.deduced_docs.push({
                num_doc: doc.numero_documento || `ID:${doc.id_documento || (doc as any).id}`,
                base: baseImponible,
                deduced_iva: deducedIva,
                deduced_rate: deducedRate,
                q: q
            });
        }

        // ✅ DETECCIÓN DE DESCUADRE DE BASE (Cabecera vs Líneas)
        const headerBase = Math.abs(Number(doc.base_imponible || (doc as any).importe_sin_impuestos || 0));
        const baseDelta = headerBase - docBaseSum;

        // Si hay una diferencia de base, chequear si suma al total exacto como un 0% (ej. Suplidos)
        const docTheoreticalTotal = headerBase + docIvaSum + docRecSum - docRetSum;
        const totalMatchesWithHeader = Math.abs(Math.abs(docTotalVal) - docTheoreticalTotal) < 0.02;

        if (Math.abs(baseDelta) > 0.01) {
            if (totalMatchesWithHeader) {
                // Es Base 0% (Exento/Suplido) omitido en los desgloses
                const b0Abs = baseDelta * absSign;
                const b0Neto = baseDelta * netoSign;
                targetSum['base_0'][q] += b0Abs;
                targetSum['base_0'].total += b0Abs;
                totalNetoSum['base_0'][q] += b0Neto;
                totalNetoSum['base_0'].total += b0Neto;
            } else {
                targetSum.base_mismatches.push({
                    num_doc: doc.numero_documento || `ID:${doc.id_documento || (doc as any).id}`,
                    header_base: headerBase,
                    lines_base: docBaseSum,
                    diff: baseDelta * absSign,
                    q: q
                });
            }
        }

        // Trace for developer level
        const theoreticalTotal = docBaseSum + docIvaSum + docRecSum - docRetSum;
        const diff = Math.abs(Math.abs(docTotalVal) - theoreticalTotal);
        if (diff > 0.01) {
            // Diagnostic patterns
            const isNoTaxesCandidate = !hasIvaDetails && Math.abs(diff - (Math.abs(docTotalVal) * 0.21)) < 1;
            const isSignCandidate = Math.abs(diff - (Math.abs(docTotalVal) * 2)) < 0.1;

            targetSum.traces.push({
                doc_id: doc.id_documento || (doc as any).id || (doc as any)._id,
                fecha: doc.fecha_emision,
                num_doc: doc.numero_documento,
                total_db: docTotalVal,
                total_calc: theoreticalTotal * absSign,
                diff: diff.toFixed(4),
                sum_bases: docBaseSum.toFixed(2),
                sum_iva: docIvaSum.toFixed(2),
                sum_rec: docRecSum.toFixed(2),
                sum_ret: docRetSum.toFixed(2),
                has_details: hasIvaDetails,
                analysis: hasIvaDetails
                    ? `Mismatch: Bases(${docBaseSum.toFixed(2)}) + IVA(${docIvaSum.toFixed(2)}) + Rec(${docRecSum.toFixed(2)}) - Ret(${docRetSum.toFixed(2)}) = ${theoreticalTotal.toFixed(2)} != DB(${Math.abs(docTotalVal).toFixed(2)})`
                    : `No tax details found in DB. System interpolated 21% IVA over total.`,
                diagnostic: isSignCandidate ? 'SIGN_INVERSION' : (isNoTaxesCandidate ? 'MISSING_TAX_DETAILS' : 'MATH_MISMATCH')
            });
        }
    });

    return {
        ingresosSum,
        gastosSum,
        totalNetoSum,
        foundRates: Array.from(foundRatesSet).sort((a, b) => b - a)
    };
};

export function TrimestreExcelView({ documents, isLoading, año, selectedTrimestre }: TrimestreExcelViewProps) {
    const { toast } = useToast();
    const [isExpanded, setIsExpanded] = useState(true);
    const [viewType, setViewType] = useState<'separate' | 'unified'>('separate');

    // 🧪 NUCLEAR DEBUG: Log data to console for the user
    React.useEffect(() => {
        console.group(`📊 [TrimestreExcelView] Debug Trace (${año})`);
        console.log(`- Recibidos ${documents.length} documentos`);
        console.log(`- Prop año: ${año}, Prop selectedTrimestre: ${selectedTrimestre}`);
        if (documents.length > 0) {
            console.log('- Primeros 3 docs:', documents.slice(0, 3).map(d => ({
                id: d.id_documento || (d as any).id,
                num: d.numero_documento,
                fecha: d.fecha_emision,
                trimestre_db: d.num_trimestre,
                año_db: d.año_trimestre
            })));
        }
        console.groupEnd();
    }, [documents, año, selectedTrimestre]);

    // --- AG GRID CONFIGURATION ---

    const currencyFormatter = (params: ValueFormatterParams) => {
        if (params.value == null) return '';
        return new Intl.NumberFormat('es-ES', {
            style: 'currency',
            currency: 'EUR',
            useGrouping: true,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(params.value);
    };

    const valueParser = (params: ValueParserParams) => {
        const newValue = params.newValue;
        if (typeof newValue === 'string' && newValue.startsWith('=')) {
            try {
                // Basic formula support: remove = and evaluate
                // eslint-disable-next-line no-eval
                const result = eval(newValue.substring(1));
                return Number(result);
            } catch (e) {
                return newValue;
            }
        }
        return Number(newValue);
    };

    const defaultColDef = useMemo<ColDef>(() => ({
        flex: 1,
        minWidth: 120,
        resizable: true,
        editable: true,
        valueParser: valueParser,
        sortable: false,
        filter: false,
    }), []);

    const columnDefs = useMemo<any[]>(() => [
        {
            headerName: 'Concepto',
            field: 'concepto',
            pinned: 'left',
            width: 180,
            editable: false,
            cellStyle: (p: any) => ({
                fontWeight: p.data?.isSectionHeader ? '900' : 'bold',
                backgroundColor: p.data?.isSectionHeader ? 'rgba(71, 85, 105, 0.9)' : 'rgba(51, 65, 85, 0.4)',
                textAlign: p.data?.isSectionHeader ? 'center' : 'left'
            }),
            tooltipValueGetter: (p: any) => {
                if (p.data?.concepto === 'Otras Bases (Sin desglose)') {
                    let baseMsg = 'ℹ️ Ajuste técnico: Refleja diferencias entre el total de base imponible declarado en cabecera y la suma de sus desgloses de impuestos.';

                    let tooltipLines = [baseMsg];

                    if (p.data.deduced_docs && p.data.deduced_docs.length > 0) {
                        const docsList = p.data.deduced_docs
                            .map((d: any) => `• ${d.num_doc}: Sin desglose. IVA deducido (${d.deduced_rate}%: ${d.deduced_iva.toFixed(2)}€)`)
                            .join('\n');
                        tooltipLines.push(`\nDocumentos sin desglose fiscal:\n${docsList}`);
                    }

                    if (p.data.base_mismatches && p.data.base_mismatches.length > 0) {
                        const mismatchList = p.data.base_mismatches
                            .map((d: any) => `• ${d.num_doc}: Base cabecera ${d.header_base.toFixed(2)}€ vs líneas ${d.lines_base.toFixed(2)}€ (Dif: ${d.diff.toFixed(2)}€)`)
                            .join('\n');
                        tooltipLines.push(`\nDiscrepancias en base de datos (Cabecera vs Líneas):\n${mismatchList}`);
                    }

                    return tooltipLines.join('\n');
                }
                return undefined;
            }
        },
        {
            headerName: '1º Trimestre',
            field: 'q1',
            valueFormatter: currencyFormatter,
            cellStyle: (p: any) => ({
                textAlign: 'right',
                backgroundColor: selectedTrimestre === 1 ? 'rgba(59, 130, 246, 0.15)' : '',
                borderLeft: selectedTrimestre === 1 ? '2px solid #3b82f6' : '',
                borderRight: selectedTrimestre === 1 ? '2px solid #3b82f6' : ''
            })
        },
        {
            headerName: '2º Trimestre',
            field: 'q2',
            valueFormatter: currencyFormatter,
            cellStyle: (p: any) => ({
                textAlign: 'right',
                backgroundColor: selectedTrimestre === 2 ? 'rgba(59, 130, 246, 0.15)' : '',
                borderLeft: selectedTrimestre === 2 ? '2px solid #3b82f6' : '',
                borderRight: selectedTrimestre === 2 ? '2px solid #3b82f6' : ''
            })
        },
        {
            headerName: '3º Trimestre',
            field: 'q3',
            valueFormatter: currencyFormatter,
            cellStyle: (p: any) => ({
                textAlign: 'right',
                backgroundColor: selectedTrimestre === 3 ? 'rgba(59, 130, 246, 0.15)' : '',
                borderLeft: selectedTrimestre === 3 ? '2px solid #3b82f6' : '',
                borderRight: selectedTrimestre === 3 ? '2px solid #3b82f6' : ''
            })
        },
        {
            headerName: '4º Trimestre',
            field: 'q4',
            valueFormatter: currencyFormatter,
            cellStyle: (p: any) => ({
                textAlign: 'right',
                backgroundColor: selectedTrimestre === 4 ? 'rgba(59, 130, 246, 0.15)' : '',
                borderLeft: selectedTrimestre === 4 ? '2px solid #3b82f6' : '',
                borderRight: selectedTrimestre === 4 ? '2px solid #3b82f6' : ''
            })
        },
        {
            headerName: 'TOTAL',
            field: 'total',
            valueFormatter: currencyFormatter,
            cellStyle: (p: any) => ({
                fontWeight: '900',
                backgroundColor: p.data?.isMainTotal ? (p.data?.finalMismatch ? '#991b1b' : p.data?.accentColor) : '',
                color: p.data?.isMainTotal ? '#ffffff' : '',
                opacity: p.data?.isMainTotal ? 1 : 0.9,
                textAlign: 'right'
            }),
            tooltipValueGetter: (p: any) => p.data?.finalMismatch ? '🚫 Descuadre FINAL: La suma de (Base + IVA + Recargo - Retención) no coincide con el total registrado.' : undefined
        },
    ], [selectedTrimestre]);

    const gridData = useMemo(() => {
        if (isLoading || documents.length === 0) return { rowDataIngresos: [], rowDataGastos: [], rowDataNeto: [], rowDataUnified: [] };

        const { ingresosSum, gastosSum, totalNetoSum, foundRates } = calculateAnnualSummary(documents, año);

        const buildRows = (summary: any, accentColor: string) => {
            const rows: any[] = [];
            const quarters = [1, 2, 3, 4];
            const currentRates = foundRates;

            // BASES
            currentRates.forEach(rate => {
                const key = `base_${rate}`;
                if (summary[key] && (summary[key].total !== 0 || quarters.some(q => summary[key][q] !== 0))) {
                    rows.push({
                        concepto: `Base ${rate}%`,
                        q1: summary[key][1], q2: summary[key][2], q3: summary[key][3], q4: summary[key][4],
                        total: summary[key].total
                    });
                }
            });

            // IVA
            currentRates.forEach(rate => {
                const keyIva = `iva_${rate}`;
                const keyBase = `base_${rate}`;
                if (summary[keyIva] && (summary[keyIva].total !== 0 || quarters.some(q => summary[keyBase]?.[q] !== 0))) {
                    const row: any = {
                        concepto: `IVA ${rate}%`,
                        q1: summary.iva_db[rate]?.[1] || 0,
                        q2: summary.iva_db[rate]?.[2] || 0,
                        q3: summary.iva_db[rate]?.[3] || 0,
                        q4: summary.iva_db[rate]?.[4] || 0,
                        total: summary.iva_db[rate]?.total || 0
                    };

                    rows.push(row);
                }
            });

            // OTRAS BASES (DIFERENCIA / REDONDEO) - Para cuadrar con las Cards
            const adjustmentRow: any = {
                concepto: 'Otras Bases (Sin desglose)',
                q1: 0, q2: 0, q3: 0, q4: 0, total: 0,
                isAdjustment: true
            };

            // IVA 0% / REDONDEOS - Para cuadrar con las Cards
            const ivaAdjustmentRow: any = {
                concepto: 'IVA 0% / Redondeos',
                q1: 0, q2: 0, q3: 0, q4: 0, total: 0,
                isAdjustment: true
            };
            let hasAdjustments = false;
            let hasIvaAdjustments = false;

            quarters.forEach(q => {
                let bSum = 0; currentRates.forEach(r => bSum += summary[`base_${r}`]?.[q] || 0);
                let iSum = 0; currentRates.forEach(r => iSum += summary.iva_db[r]?.[q] || 0);

                // ✅ CORRECCIÓN CRÍTICA: Las retenciones ya son negativas, usarlas algebraicamente
                const theoreticalQ = bSum + iSum + (summary.recargos[q] || 0) + (summary.retenciones[q] || 0);
                const realQ = summary.total_real[q];
                const delta = realQ - theoreticalQ;

                if (Math.abs(delta) > 0.05) {
                    hasAdjustments = true;
                    adjustmentRow[`q${q}`] = delta;
                }

                // También verificar si hay descuadre en la suma de IVA vs Total IVA (incl. recargos) de las Cards
                // totalIvaRow ya tiene recargos
            });
            adjustmentRow.total = quarters.reduce((acc, q) => acc + (adjustmentRow[`q${q}`] || 0), 0);
            adjustmentRow.deduced_docs = summary.deduced_docs;
            adjustmentRow.base_mismatches = summary.base_mismatches;

            // Nota: En esta versión simplificada de Excel, el delta total va a Bases Ajuste.
            // Para paridad absoluta con la Card, podríamos separar el IVA Delta, pero el usuario 
            // pidió principalmente el nombre del label en la Card. Mantendremos la lógica de bases 
            // para el Excel por ahora para no romper la suma de Total Gastado que ya es perfecta.

            // TOTALES
            const totalBasesRow: any = { concepto: 'Total Bases', q1: 0, q2: 0, q3: 0, q4: 0, total: 0 };
            const totalIvaRow: any = { concepto: 'Total IVA', q1: 0, q2: 0, q3: 0, q4: 0, total: 0 };

            quarters.forEach(q => {
                currentRates.forEach(r => {
                    totalBasesRow[`q${q}`] += (summary[`base_${r}`]?.[q] || 0);
                    totalIvaRow[`q${q}`] += (summary.iva_db[r]?.[q] || 0);
                });
                // ✅ IMPORTANTE: Las Cards incluyen recargos en el total de IVA
                totalIvaRow[`q${q}`] += (summary.recargos[q] || 0);

                // INTEGRAR AJUSTE EN TOTAL BASES
                totalBasesRow[`q${q}`] += adjustmentRow[`q${q}`];
            });

            totalBasesRow.total = quarters.reduce((acc, q) => acc + totalBasesRow[`q${q}`], 0);
            totalIvaRow.total = quarters.reduce((acc, q) => acc + totalIvaRow[`q${q}`], 0);

            if (hasAdjustments) rows.push(adjustmentRow);
            rows.push(totalBasesRow);
            rows.push(totalIvaRow);

            // FACTURADO FINAL (REAL TOTAL - Sincronizado con Cards)
            const facturadoRow: any = {
                concepto: 'Total Gral. Facturado',
                q1: 0, q2: 0, q3: 0, q4: 0, total: 0,
                isMainTotal: true,
                accentColor
            };

            quarters.forEach(q => {
                facturadoRow[`q${q}`] = summary.total_real[q];
            });

            facturadoRow.total = summary.total_real.total;

            rows.push(facturadoRow);

            // SEPARATOR ROW
            rows.push({ concepto: ' ', isSectionHeader: false, q1: null, q2: null, q3: null, q4: null, total: null });

            if (summary.recargos.total !== 0) {
                rows.push({
                    concepto: 'Total Recargos',
                    q1: summary.recargos[1], q2: summary.recargos[2], q3: summary.recargos[3], q4: summary.recargos[4],
                    total: summary.recargos.total
                });
            }
            if (summary.retenciones.total !== 0) {
                rows.push({
                    concepto: 'Total Retenciones',
                    q1: summary.retenciones[1], q2: summary.retenciones[2], q3: summary.retenciones[3], q4: summary.retenciones[4],
                    total: summary.retenciones.total
                });
            }

            return rows;
        };

        return {
            rowDataIngresos: buildRows(ingresosSum, '#10b981'),
            rowDataGastos: buildRows(gastosSum, '#ef4444'),
            rowDataNeto: buildRows(totalNetoSum, '#3b82f6'),
            ingresosTraces: ingresosSum.traces,
            gastosTraces: gastosSum.traces,
            rowDataUnified: [
                { concepto: '--- INGRESOS (EMITIDAS) ---', isSectionHeader: true, q1: null, q2: null, q3: null, q4: null, total: null },
                ...buildRows(ingresosSum, '#10b981'),
                { concepto: ' ', isSectionHeader: false, q1: null, q2: null, q3: null, q4: null, total: null },
                { concepto: '--- GASTOS (RECIBIDAS) ---', isSectionHeader: true, q1: null, q2: null, q3: null, q4: null, total: null },
                ...buildRows(gastosSum, '#ef4444'),
                { concepto: ' ', isSectionHeader: false, q1: null, q2: null, q3: null, q4: null, total: null },
                { concepto: '--- BALANCE NETO ANUAL ---', isSectionHeader: true, q1: null, q2: null, q3: null, q4: null, total: null },
                ...buildRows(totalNetoSum, '#3b82f6')
            ]
        };
    }, [documents, isLoading]);

    const handleDebugLog = useCallback(() => {
        console.group('%c 🕵️ AG Grid Deep Debug Trace ', 'background: #0f172a; color: #10b981; font-weight: bold; padding: 6px; border-radius: 4px; border: 1px solid #10b981;');
        console.log('%c🔍 Objetivo: Localizar el origen exacto de las discrepancias matemáticas.', 'color: #94a3b8; font-style: italic;');

        const processTraces = (title: string, traces: any[]) => {
            if (traces.length > 0) {
                console.group(`📂 ${title} (${traces.length} discrepancias):`);
                console.table(traces.map(t => ({
                    'DocID': t.doc_id,
                    'Factura': t.num_doc || 'S/N',
                    'Total DB': t.total_db,
                    'Base Sum': t.sum_bases,
                    'IVA Sum': t.sum_iva,
                    'Rec Sum': t.sum_rec,
                    'Ret Sum': t.sum_ret,
                    'Total Calc': t.total_calc,
                    'Delta': t.diff,
                    'Diagnostic': t.diagnostic,
                    'Análisis': t.analysis
                })));
                console.group('🧪 Resumen de Patrones:');
                traces.forEach(t => {
                    const d = parseFloat(t.diff);
                    if (!t.has_details) {
                        console.log(`%c[ID ${t.doc_id}] ⚠️ FALTA DATA: Este documento no tiene desglose de IVA en DB. Se forzó un 21% sobre el total. El descuadre es esperado si la factura real no era al 21%.`, 'color: #f59e0b;');
                    } else if (d < 0.05) {
                        console.log(`%c[ID ${t.doc_id}] ✅ REDONDEO: Diferencia de ${d}€ (Mínima). Es aceptable por acumulación de decimales en líneas de factura.`, 'color: #10b981;');
                    } else {
                        console.log(`%c[ID ${t.doc_id}] 🚫 ERROR MATEMÁTICO: Diferencia de ${d}€ significativa. La sumatoria de las líneas de impuestos en DB no cuadra con el total del documento. Revisar tabla 'iva_details' para esta ID.`, 'color: #ef4444; font-weight: bold;');
                    }
                });
                console.groupEnd();
                console.groupEnd();
            } else {
                console.log(`%c✅ ${title}: Sin descuadres detectados.`, 'color: #10b981;');
            }
        };

        processTraces('Ingresos (Emitidas)', gridData.ingresosTraces);
        processTraces('Gastos (Recibidas)', gridData.gastosTraces);

        console.log('%c💡 Pex (Explicación para Developer): Si el Total Calc != Total DB, el problema está en los datos de origen (Base de Datos). Esta herramienta te permite ver EXACTAMENTE qué sumatoria de la base de datos está fallando.', 'background: #334155; color: #f8fafc; padding: 4px;');
        console.groupEnd();

        toast({
            title: "Traces detallados generados",
            description: "Revisá la consola (F12) para ver el desglose matemático por documento.",
        });
    }, [gridData, toast]);

    if (isLoading) {
        return (
            <Card className="w-full mb-6 bg-slate-900 border-slate-800">
                <CardHeader><Skeleton className="h-4 w-48 bg-slate-800" /></CardHeader>
                <CardContent><Skeleton className="h-[400px] w-full bg-slate-800" /></CardContent>
            </Card>
        );
    }

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
                    Cuadro de Mando Interactivo AG Grid {año}
                </CardTitle>
                <button className={`p-2 rounded-full transition-all duration-300 ${isExpanded ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-400'}`}>
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
            </CardHeader>
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.4 }}
                    >
                        <CardContent className="p-0">
                            {/* Control Bar: Legend + Toggle */}
                            <div className="bg-slate-950 p-6 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 border-b border-slate-800">
                                <div className="text-xs text-slate-400">
                                    Bases + IVA + Recargos - Retenciones = <span className="text-blue-500 font-bold text-sm">TOTAL</span>
                                </div>

                                <div className="flex items-center space-x-3 bg-slate-900/50 p-2 rounded-lg border border-slate-800 px-4">
                                    <Switch
                                        id="view-mode"
                                        checked={viewType === 'unified'}
                                        onCheckedChange={(checked) => setViewType(checked ? 'unified' : 'separate')}
                                    />
                                    <Label htmlFor="view-mode" className="text-sm font-bold text-slate-300 cursor-pointer select-none">
                                        {viewType === 'unified' ? 'Vista Unificada' : 'Vista en Tablas'}
                                    </Label>
                                </div>
                            </div>

                            {/* AG Grids */}
                            <div className="flex flex-col gap-8 p-6 bg-[#0f172a]">
                                <AnimatePresence mode="wait">
                                    {viewType === 'unified' ? (
                                        <motion.div
                                            key="unified"
                                            initial={{ opacity: 0, x: 20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: -20 }}
                                            className="space-y-2"
                                        >
                                            <h3 className="text-sm font-bold text-blue-400 mb-2 uppercase tracking-tight flex items-center gap-2">
                                                <div className="p-1.5 bg-blue-500/20 rounded text-blue-400"><LayoutGrid size={14} /></div>
                                                VISTA UNIFICADA (ANÁLISIS GLOBAL)
                                            </h3>
                                            <div className="w-full rounded-xl overflow-hidden shadow-2xl border border-slate-800">
                                                <AgGridReact
                                                    domLayout="autoHeight"
                                                    theme={darkTheme}
                                                    rowData={gridData.rowDataUnified}
                                                    columnDefs={columnDefs}
                                                    defaultColDef={defaultColDef}
                                                    enableBrowserTooltips={true}
                                                    getRowStyle={(params) => params.data?.isSectionHeader ? {
                                                        backgroundColor: 'rgba(30, 41, 59, 1)',
                                                        pointerEvents: 'none',
                                                        borderBottom: '2px solid #334155'
                                                    } : undefined}
                                                />
                                            </div>
                                        </motion.div>
                                    ) : (
                                        <motion.div
                                            key="separate"
                                            initial={{ opacity: 0, x: -20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: 20 }}
                                            className="flex flex-col gap-8"
                                        >
                                            <div className="space-y-2">
                                                <h3 className="text-sm font-bold text-emerald-500 mb-2 uppercase tracking-tight">Recaudación de Ingresos (Emitidas)</h3>
                                                <div className="w-full rounded-xl overflow-hidden shadow-xl border border-slate-800">
                                                    <AgGridReact
                                                        domLayout="autoHeight"
                                                        theme={darkTheme}
                                                        rowData={gridData.rowDataIngresos}
                                                        columnDefs={columnDefs}
                                                        defaultColDef={defaultColDef}
                                                        enableBrowserTooltips={true}
                                                    />
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                <h3 className="text-sm font-bold text-rose-500 mb-2 uppercase tracking-tight">Registro de Gastos (Recibidas)</h3>
                                                <div className="w-full rounded-xl overflow-hidden shadow-xl border border-slate-800">
                                                    <AgGridReact
                                                        domLayout="autoHeight"
                                                        theme={darkTheme}
                                                        rowData={gridData.rowDataGastos}
                                                        columnDefs={columnDefs}
                                                        defaultColDef={defaultColDef}
                                                        enableBrowserTooltips={true}
                                                    />
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                <h3 className="text-sm font-bold text-blue-500 mb-2 uppercase tracking-tight">Balance Neto Anual</h3>
                                                <div className="w-full rounded-xl overflow-hidden shadow-xl border border-slate-800">
                                                    <AgGridReact
                                                        domLayout="autoHeight"
                                                        theme={darkTheme}
                                                        rowData={gridData.rowDataNeto}
                                                        columnDefs={columnDefs}
                                                        defaultColDef={defaultColDef}
                                                        enableBrowserTooltips={true}
                                                    />
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </CardContent>
                    </motion.div>
                )}
            </AnimatePresence>
            <style jsx global>{`
                .ag-theme-quartz-dark {
                    --ag-background-color: #0f172a;
                    --ag-header-background-color: #1e293b;
                    --ag-odd-row-background-color: #1e293b55;
                    --ag-header-foreground-color: #f8fafc;
                    --ag-foreground-color: #cbd5e1;
                    --ag-border-color: #334155;
                    --ag-row-hover-color: #33415588;
                    --ag-selected-row-background-color: #3b82f633;
                    --ag-font-family: 'Inter', sans-serif;
                    --ag-font-size: 13px;
                }
                .ag-tooltip-custom {
                    background-color: #1e293b !important;
                    color: #f8fafc !important;
                    border: 1px solid #475569 !important;
                    border-radius: 6px !important;
                    padding: 8px !important;
                    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.5) !important;
                }
            `}</style>
        </Card>
    );
}
