const mysql = require('mysql2/promise');
require('dotenv').config();

async function run() {
    try {
        const connection = await mysql.createConnection(process.env.DATABASE_URL);

        console.log('--- AUDITORÍA OPTIMIZADA EMPRESA 11 - 2026 Q1 ---');

        // 1. Get all documents and their taxes in one join
        const [rows] = await connection.execute(`
            SELECT 
                d.id, d.numero_documento, d.importe_total, d.importe_sin_impuestos, d.is_issued,
                i.porcentaje, i.cuota, i.base_imponible, i.tipo_impuesto
            FROM documentos d
            LEFT JOIN impuestos_documento i ON d.id = i.documento_id
            WHERE d.id_de_empresa = 11 AND d.año_trimestre = 2026 AND d.num_trimestre = 1
        `);

        const summary = {
            ingresos: { total_real: 0, doc_totals: new Map(), bases: {}, iva: {}, recargos: 0, retenciones: 0 },
            gastos: { total_real: 0, doc_totals: new Map(), bases: {}, iva: {}, recargos: 0, retenciones: 0 }
        };

        const processedTaxes = new Set();

        rows.forEach(r => {
            const isIssued = Number(r.is_issued) === 1;
            const target = isIssued ? summary.ingresos : summary.gastos;

            if (!target.doc_totals.has(r.id)) {
                target.doc_totals.set(r.id, Number(r.importe_total || 0));
                target.total_real += Number(r.importe_total || 0);
            }

            if (r.porcentaje !== null || r.cuota !== null) {
                const type = (r.tipo_impuesto || '').toLowerCase();
                const cuota = Number(r.cuota || 0);
                const base = Number(r.base_imponible || 0);
                const rate = Number(r.porcentaje || 0);

                if (type.includes('retencion')) {
                    target.retenciones += cuota;
                } else if (type.includes('recargo') || type.includes('equivalencia')) {
                    target.recargos += cuota;
                } else {
                    target.bases[rate] = (target.bases[rate] || 0) + base;
                    target.iva[rate] = (target.iva[rate] || 0) + cuota;
                }
            } else {
                // Deduced fallback logic
                const base = Number(r.importe_sin_impuestos || r.importe_total || 0);
                const total = Number(r.importe_total || 0);
                const diff = total - base;

                let rate = 21;
                const ratio = Math.abs(total) / Math.abs(base);
                if (Math.abs(ratio - 1.04) < 0.02) rate = 4;
                else if (Math.abs(ratio - 1.10) < 0.02) rate = 10;
                else if (Math.abs(ratio - 1.21) < 0.02) rate = 21;
                else if (Math.abs(ratio - 1.00) < 0.02) rate = 0;

                target.bases[rate] = (target.bases[rate] || 0) + base;
                target.iva[rate] = (target.iva[rate] || 0) + diff;
            }
        });

        console.log('--- RESULTADOS GASTOS ---');
        console.log('Total Real (Cards):', summary.gastos.total_real.toFixed(2));
        console.log('Bases:', summary.gastos.bases);
        console.log('IVA (Real DB):', summary.gastos.iva);

        let sumIva = 0; for (let r in summary.gastos.iva) sumIva += summary.gastos.iva[r];
        console.log('Total IVA (Real DB):', sumIva.toFixed(2));
        console.log('Total Recargos:', summary.gastos.recargos.toFixed(2));
        console.log('Total Retenciones:', summary.gastos.retenciones.toFixed(2));

        const sumBases = Object.values(summary.gastos.bases).reduce((a, b) => a + b, 0);
        const theoretical = sumBases + sumIva + summary.gastos.recargos - summary.gastos.retenciones;
        console.log('Theoretical Calc:', theoretical.toFixed(2));
        console.log('Mismatch Delta:', (summary.gastos.total_real - theoretical).toFixed(2));

        await connection.end();
    } catch (e) { console.error(e); }
}
run();
