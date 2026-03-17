
import db from './src/lib/db';

async function analyzeDocs() {
    const filters = {
        empresa_id: 11, // Valentia Alimentación S.L. según lo visto antes
        año: 2026,
        trimestre: 1
    };

    const query = `
        SELECT 
            d.id, d.numero_documento, d.tipo_documento, d.importe_total, d.importe_sin_impuestos,
            (SELECT SUM(cuota) FROM impuestos_documento WHERE documento_id = d.id AND (tipo_impuesto NOT LIKE '%reten%' AND tipo_impuesto NOT LIKE '%recargo%' AND tipo_impuesto NOT LIKE '%equivalencia%')) as iva_db,
            (SELECT SUM(cuota) FROM impuestos_documento WHERE documento_id = d.id AND (tipo_impuesto LIKE '%recargo%' OR tipo_impuesto LIKE '%equivalencia%')) as recargo_db,
            (SELECT SUM(cuota) FROM impuestos_documento WHERE documento_id = d.id AND (tipo_impuesto LIKE '%reten%' OR tipo_impuesto LIKE '%irpf%')) as retencion_db
        FROM documentos d
        WHERE d.id_de_empresa = ? AND d.año_trimestre = ? AND d.num_trimestre = ?
        AND (
            (LOWER(d.tipo_documento) LIKE '%factura%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
            OR (LOWER(d.tipo_documento) LIKE '%abono%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
            OR (LOWER(d.tipo_documento) LIKE '%nota%crédito%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
            OR (LOWER(d.tipo_documento) LIKE '%nota%credito%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
        )
        AND d.id NOT IN (SELECT documento_id FROM incidencias_documento WHERE validado = 0)
    `;

    const [rows]: any = await db.query(query, [filters.empresa_id, filters.año, filters.trimestre]);

    console.log(`Documentos encontrados: ${rows.length}`);
    let totalDB = 0;
    let baseDB = 0;
    let ivaDB = 0;
    let recargoDB = 0;
    let retencionDB = 0;

    rows.forEach((r: any) => {
        const isAbono = r.tipo_documento.toLowerCase().includes('abono') || Number(r.importe_total) < 0;
        const sign = isAbono ? -1 : 1;

        totalDB += Number(r.importe_total || 0) * (isAbono && Number(r.importe_total) > 0 ? -1 : 1);
        baseDB += Number(r.importe_sin_impuestos || 0) * sign;
        ivaDB += Number(r.iva_db || 0) * sign;
        recargoDB += Number(r.recargo_db || 0) * sign;
        retencionDB += Number(r.retencion_db || 0) * sign;
    });

    console.log('Resultados Agregados (Signos manuales):');
    console.log('Total Gastos:', totalDB.toFixed(2));
    console.log('Base Imponible:', baseDB.toFixed(2));
    console.log('IVA:', ivaDB.toFixed(2));
    console.log('Recargo:', recargoDB.toFixed(2));
    console.log('Retencion:', retencionDB.toFixed(2));

    console.log('\n--- Detalle de documentos con discrepancia de redondeo (Total != Base + IVA + Rec - Ret) ---');
    rows.forEach((r: any) => {
        const total = Number(r.importe_total || 0);
        const base = Number(r.importe_sin_impuestos || 0);
        const iva = Number(r.iva_db || 0);
        const rec = Number(r.recargo_db || 0);
        const ret = Number(r.retencion_db || 0);
        const calc = base + iva + rec - ret;
        if (Math.abs(total - calc) > 0.01) {
            console.log(`ID: ${r.id} | Num: ${r.numero_documento} | DB Total: ${total} | Calc: ${calc} | Diff: ${(total - calc).toFixed(4)}`);
        }
    });
}

analyzeDocs().catch(console.error).finally(() => process.exit());
