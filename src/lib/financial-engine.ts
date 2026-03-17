import { Document } from './types';

export const VAT_RATES = [21, 15, 10, 4, 0];

export interface FinancialSummary {
    totalReal: Record<number | string, number>;
    retenciones: Record<number | string, number>;
    recargos: Record<number | string, number>;
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
        retenciones: { 1: 0, 2: 0, 3: 0, 4: 0, total: 0 },
        recargos: { 1: 0, 2: 0, 3: 0, 4: 0, total: 0 },
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
        if (hasValidQ) {
            target.totalReal[q!] += valReal * absSign;
            totalNeto.totalReal[q!] += valReal * netoSign;
        }
        target.totalReal.total += valReal * absSign;
        totalNeto.totalReal.total += valReal * netoSign;

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
            // Si no tiene desgloses, asumimos 21 % (misma lógica que Trimestres)
            const base = valReal / 1.21;
            const theorIva = valReal - base;
            if (hasValidQ) {
                target.bases[21][q!] += base * absSign;
                target.ivaTeorico[21][q!] += theorIva * absSign;
            }
            target.bases[21].total += base * absSign;
            target.ivaTeorico[21].total += theorIva * absSign;

            // Marcar como documento sin detalles si es relevante
            // (Opcional: añadir a mismatchDocs si detectamos que falta información)
        }

        // Auditoría de Total del Documento
        const docTheoreticalTotal = docBaseSum + docIvaSum + docRecSum - docRetSum;
        if (hasValidQ && Math.abs(valReal - docTheoreticalTotal) > 0.01 && ivaDetails.length > 0) {
            const docId = doc.numero_documento || `ID:${doc.id_documento}`;
            target.mismatchDocs.total[q!].push(`${docId} (BD:${valReal.toFixed(2)}€ vs Calc:${docTheoreticalTotal.toFixed(2)}€)`);
        }

        // Contadores
        target.counts.total++;
        if (isIssued) target.counts.issued++; else target.counts.received++;
    });

    return { ingresos, gastos, totalNeto };
}
