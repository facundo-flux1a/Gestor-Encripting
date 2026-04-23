import { Document } from './types';

export const VAT_RATES = [21, 15, 10, 4, 0];

export interface FinancialSummary {
    totalReal: Record<number | string, number>;
    baseReal: Record<number | string, number>;
    ivaReal: Record<number | string, number>;
    retenciones: Record<number | string, number>;
    recargos: Record<number | string, number>;
    otrosCargos: Record<string, Record<number | string, number>>;
    bases: Record<number, Record<number | string, number>>;
    ivaTeorico: Record<number, Record<number | string, number>>;
    ivaDB: Record<number, Record<number | string, number>>;
    // Trazabilidad: Guardamos IDs de documentos con descuadres por trimestre
    mismatchDocs: {
        total: Record<number, string[]>; // Por trimestre
        iva: Record<number, Record<number, string[]>>; // Por trimestre y tipo
    };
    counts: {
        total: number;
        issued: number;
        received: number;
    };
}

export interface EngineResult {
    ingresos: FinancialSummary;
    gastos: FinancialSummary;
    totalNeto: FinancialSummary;
}

const createEmptySummary = (): FinancialSummary => {
    const summary: FinancialSummary = {
        totalReal: { 1: 0, 2: 0, 3: 0, 4: 0, total: 0 },
        baseReal: { 1: 0, 2: 0, 3: 0, 4: 0, total: 0 },
        ivaReal: { 1: 0, 2: 0, 3: 0, 4: 0, total: 0 },
        retenciones: { 1: 0, 2: 0, 3: 0, 4: 0, total: 0 },
        recargos: { 1: 0, 2: 0, 3: 0, 4: 0, total: 0 },
        otrosCargos: {},
        bases: {},
        ivaTeorico: {},
        ivaDB: {},
        mismatchDocs: {
            total: { 1: [], 2: [], 3: [], 4: [] },
            iva: { 1: {}, 2: {}, 3: {}, 4: {} }
        },
        counts: { total: 0, issued: 0, received: 0 }
    };

    VAT_RATES.forEach(rate => {
        summary.bases[rate] = { 1: 0, 2: 0, 3: 0, 4: 0, total: 0 };
        if (rate > 0) {
            summary.ivaTeorico[rate] = { 1: 0, 2: 0, 3: 0, 4: 0, total: 0 };
            summary.ivaDB[rate] = { 1: 0, 2: 0, 3: 0, 4: 0, total: 0 };
            [1, 2, 3, 4].forEach(q => {
                summary.mismatchDocs.iva[q][rate] = [];
            });
        }
    });

    return summary;
};

/**
 * Motor central de cálculo financiero.
 * Unifica la lógica de los Trimestres, Cards y Dashboard.
 */
export function calculateFinancials(documents: Document[], companyCIF: string | null): EngineResult {
    const ingresos = createEmptySummary();
    const gastos = createEmptySummary();
    const totalNeto = createEmptySummary();

    documents.forEach(doc => {
        // 1. Determinar Trimestre
        let q = doc.num_trimestre;
        if (!q && doc.fecha_emision) {
            const month = new Date(doc.fecha_emision).getMonth() + 1;
            q = Math.ceil(month / 3);
        }
        const hasValidQ = q && q >= 1 && q <= 4;

        // 2. Clasificación (Ingreso vs Gasto)
        let isIssued = false;
        if (doc.is_issued !== undefined && doc.is_issued !== null) {
            isIssued = Number(doc.is_issued) === 1;
        } else {
            // Fallback robusto similar a Trimestres
            isIssued = doc.entidades?.some(e =>
                (e.rol === 'emisor' || e.rol === 'proveedor') &&
                companyCIF && e.identificador_fiscal?.trim().toLowerCase() === companyCIF.trim().toLowerCase()
            ) ?? (Number(doc.total) >= 0);
        }

        // 3. Abono / Rectificativa
        const tipoLower = (doc.tipo_documento || '').toLowerCase();
        const docTotalVal = Number(doc.total || doc.base_imponible || 0);
        const esAbono = tipoLower.includes('abono') || tipoLower.includes('crédito') || tipoLower.includes('credito') || docTotalVal < 0;

        const target = isIssued ? ingresos : gastos;
        const absSign = esAbono ? -1 : 1;
        const netoBaseSign = isIssued ? 1 : -1;
        const netoSign = esAbono ? (netoBaseSign * -1) : netoBaseSign;

        // 4. Totales Reales (BD)
        const valReal = Math.abs(docTotalVal);
        const baseRealVal = Math.abs(Number(doc.base_imponible || (doc as any).importe_sin_impuestos || 0));
        // Si no hay iva explícito, aproximamos por diferencia (se ajustará al final sumando impuestos)
        let ivaRealVal = Math.abs(Number(doc.iva || (doc as any).total_iva || 0));
        const recargoCab = Math.abs(Number((doc as any).recargo_cuota || (doc as any).recargo || 0));
        const retencionCab = Math.abs(Number((doc as any).retencion_cuota || (doc as any).retencion || 0));

        // Si el IVA viene de cabecera, podría incluir el recargo. Lo restamos para empezar con IVA puro.
        if (ivaRealVal > 0 && recargoCab > 0 && Math.abs(ivaRealVal - (valReal - baseRealVal)) < 0.01) {
            ivaRealVal = Math.max(0, ivaRealVal - recargoCab + retencionCab);
        }

        // Si sigue siendo 0, usamos la diferencia total-base como fallback inicial (menos otros impuestos conocidos)
        if (ivaRealVal === 0) {
            ivaRealVal = Math.max(0, valReal - baseRealVal - recargoCab + retencionCab);
        }

        if (hasValidQ) {
            target.totalReal[q!] += valReal * absSign;
            target.baseReal[q!] += baseRealVal * absSign;
            target.ivaReal[q!] += ivaRealVal * absSign;

            totalNeto.totalReal[q!] += valReal * netoSign;
            totalNeto.baseReal[q!] += baseRealVal * netoSign;
            totalNeto.ivaReal[q!] += ivaRealVal * netoSign;
        }

        target.totalReal.total += valReal * absSign;
        target.baseReal.total += baseRealVal * absSign;
        target.ivaReal.total += ivaRealVal * absSign;

        totalNeto.totalReal.total += valReal * netoSign;
        totalNeto.baseReal.total += baseRealVal * netoSign;
        totalNeto.ivaReal.total += ivaRealVal * netoSign;

        // 5. Procesar Impuestos
        const ivaDetails = doc.iva_details || [];
        let docBaseSum = 0;
        let docIvaSum = 0;
        let docRecSum = 0;
        let docRetSum = 0;

        if (ivaDetails.length > 0) {
            ivaDetails.forEach(detail => {
                const tipoIva = (detail.tipo_impuesto || '').toLowerCase();
                const cuota = Math.round(Math.abs(Number(detail.cuota) || 0) * 100) / 100;

                if (tipoIva.includes('retencion') || tipoIva.includes('irpf')) {
                    docRetSum += cuota;
                    if (hasValidQ) {
                        target.retenciones[q!] += cuota * absSign;
                        totalNeto.retenciones[q!] += cuota * netoSign;
                    }
                    target.retenciones.total += cuota * absSign;
                    totalNeto.retenciones.total += cuota * netoSign;
                    return;
                }

                if (tipoIva.includes('recargo') || tipoIva.includes('equivalencia')) {
                    docRecSum += cuota;
                    if (hasValidQ) {
                        target.recargos[q!] += cuota * absSign;
                        totalNeto.recargos[q!] += cuota * netoSign;
                    }
                    target.recargos.total += cuota * absSign;
                    totalNeto.recargos.total += cuota * netoSign;
                    return;
                }

                const rate = Math.round(Number(detail.porcentaje));
                const base = Math.round(Math.abs(Number(detail.base_imponible) || 0) * 100) / 100;

                // ✅ OTROS CARGOS: líneas con porcentaje=0, cuota>0 y nombre no-IVA (ej: 'Aplazo')
                if (rate === 0 && cuota !== 0 && !tipoIva.includes('iva') && !tipoIva.includes('exent')) {
                    const nombreCargo = detail.tipo_impuesto || 'Otro';
                    if (!target.otrosCargos[nombreCargo]) {
                        target.otrosCargos[nombreCargo] = { 1: 0, 2: 0, 3: 0, 4: 0, total: 0 };
                        totalNeto.otrosCargos[nombreCargo] = { 1: 0, 2: 0, 3: 0, 4: 0, total: 0 };
                    }
                    if (hasValidQ) {
                        target.otrosCargos[nombreCargo][q!] += cuota * absSign;
                        totalNeto.otrosCargos[nombreCargo][q!] += cuota * netoSign;
                    }
                    target.otrosCargos[nombreCargo].total += cuota * absSign;
                    totalNeto.otrosCargos[nombreCargo].total += cuota * netoSign;
                    docIvaSum += cuota; // cuenta para el total teórico
                    return;
                }

                docBaseSum += base;
                docIvaSum += cuota;

                // IVA Teórico vs DB
                const theoreticalIva = Math.round(base * rate) / 100;

                // Registro de Descuadre en IVA
                if (hasValidQ && Math.abs(cuota - theoreticalIva) > 0.01) {
                    const docId = doc.numero_documento || `ID:${doc.id_documento}`;
                    target.mismatchDocs.iva[q!][rate]?.push(`${docId} (${cuota.toFixed(2)}€ vs teor. ${theoreticalIva.toFixed(2)}€)`);
                }

                // Acumuladores
                if (target.bases[rate]) {
                    if (hasValidQ) target.bases[rate][q!] += base * absSign;
                    target.bases[rate].total += base * absSign;
                }
                if (target.ivaTeorico[rate]) {
                    if (hasValidQ) target.ivaTeorico[rate][q!] += theoreticalIva * absSign;
                    target.ivaTeorico[rate].total += theoreticalIva * absSign;
                }
                if (target.ivaDB[rate]) {
                    if (hasValidQ) target.ivaDB[rate][q!] += cuota * absSign;
                    target.ivaDB[rate].total += cuota * absSign;
                }

                // Propagar a totalNeto (opcional para paridad)
                if (totalNeto.bases[rate]) {
                    if (hasValidQ) totalNeto.bases[rate][q!] += base * netoSign;
                    totalNeto.bases[rate].total += base * netoSign;
                    if (totalNeto.ivaTeorico[rate]) {
                        if (hasValidQ) totalNeto.ivaTeorico[rate][q!] += theoreticalIva * netoSign;
                        totalNeto.ivaTeorico[rate].total += theoreticalIva * netoSign;
                    }
                }
            });
        } else {
            // ✅ MEJORA: Deducir el porcentaje si no hay desgloses (Evitar asumir 21% siempre)
            const diff = valReal - baseRealVal;
            let deducedRate = 21; // Default fallback

            if (baseRealVal > 0) {
                const pct = (diff / baseRealVal) * 100;
                // Buscar la tasa estándar más cercana (margen 0.5%)
                if (Math.abs(pct - 4) < 0.5) deducedRate = 4;
                else if (Math.abs(pct - 10) < 0.5) deducedRate = 10;
                else if (Math.abs(pct - 21) < 0.5) deducedRate = 21;
                else if (Math.abs(pct - 15) < 0.5) deducedRate = 15;
                else if (Math.abs(pct - 0) < 0.5) deducedRate = 0;
            }

            if (hasValidQ) {
                if (target.bases[deducedRate]) target.bases[deducedRate][q!] += baseRealVal * absSign;
                if (target.ivaTeorico[deducedRate]) target.ivaTeorico[deducedRate][q!] += diff * absSign;

                // También en totalNeto para paridad
                if (totalNeto.bases[deducedRate]) totalNeto.bases[deducedRate][q!] += baseRealVal * netoSign;
                if (totalNeto.ivaTeorico[deducedRate]) totalNeto.ivaTeorico[deducedRate][q!] += diff * netoSign;
            }

            if (target.bases[deducedRate]) target.bases[deducedRate].total += baseRealVal * absSign;
            if (target.ivaTeorico[deducedRate]) target.ivaTeorico[deducedRate].total += diff * absSign;

            if (totalNeto.bases[deducedRate]) totalNeto.bases[deducedRate].total += baseRealVal * netoSign;
            if (totalNeto.ivaTeorico[deducedRate]) totalNeto.ivaTeorico[deducedRate].total += diff * netoSign;
        }

        // ✅ DETECCIÓN INTELIGENTE DE SUPLIDOS / EXENTOS (Base 0%)
        // Si hay una diferencia entre la base de cabecera y la suma de líneas,
        // pero la cabecera + impuestos cuadra con el total real, entonces la diferencia es Base 0%.
        const headerBaseVal = Math.abs(Number((doc as any).importe_sin_impuestos || doc.base_imponible || 0));
        const baseGap = headerBaseVal - docBaseSum;
        const theoreticalTotalWithHeader = headerBaseVal + docIvaSum + docRecSum - docRetSum;

        if (Math.abs(baseGap) > 0.01 && Math.abs(valReal - theoreticalTotalWithHeader) < 0.02) {
            // Es Base 0% omitida en los desgloses
            if (target.bases[0]) {
                if (hasValidQ) {
                    target.bases[0][q!] += baseGap * absSign;
                    totalNeto.bases[0][q!] += baseGap * netoSign;
                }
                target.bases[0].total += baseGap * absSign;
                totalNeto.bases[0].total += baseGap * netoSign;
            }
            // Actualizamos docBaseSum para que no genere alerta de mismatch de total después
            docBaseSum += baseGap;
        }

        // Auditoría de Total del Documento
        const docTheoreticalTotal = docBaseSum + docIvaSum + docRecSum - docRetSum;
        if (hasValidQ && Math.abs(valReal - docTheoreticalTotal) > 0.01 && ivaDetails.length > 0) {
            const docId = doc.numero_documento || `ID:${doc.id_documento}`;
            target.mismatchDocs.total[q!].push(`${docId} (BD:${valReal.toFixed(2)}€ vs Calc:${docTheoreticalTotal.toFixed(2)}€)`);
        }

        // ✅ AJUSTE FINAL DE IVA REAL: 
        // Si usamos el fallback (total-base), debemos restar Recargos y Retenciones encontrados
        // para que 'ivaReal' sea solo IVA puro.
        const ivaFallback = valReal - baseRealVal;
        if (Math.abs(ivaRealVal - ivaFallback) < 0.01) {
            const trueIvaReal = Math.max(0, ivaRealVal - docRecSum + docRetSum);
            const diff = trueIvaReal - ivaRealVal;

            if (hasValidQ) {
                target.ivaReal[q!] += diff * absSign;
                totalNeto.ivaReal[q!] += diff * netoSign;
            }
            target.ivaReal.total += diff * absSign;
            totalNeto.ivaReal.total += diff * netoSign;
        }

        // Contadores
        target.counts.total++;
        if (isIssued) target.counts.issued++; else target.counts.received++;
    });

    return { ingresos, gastos, totalNeto };
}
