import db from '../src/lib/db';

async function main() {
    const empresaId = 82;
    const myCIF = 'B25961236'; // ✅ CIF REAL DE LA EMPRESA 82
    console.log(`--- RECONCILIATION CO${empresaId} (${myCIF}) ---`);

    const [docs]: any = await db.query(`
    SELECT 
        d.id, 
        d.año_trimestre, 
        d.num_trimestre, 
        d.importe_total, 
        d.importe_sin_impuestos,
        d.tipo_documento,
        d.fecha_emision
    FROM documentos d
    WHERE d.id_de_empresa = ?
  `, [empresaId]);

    const summary: any = {};

    for (const d of docs) {
        // 1. Clasificación Soportado (Gasto) 
        const [entities]: any = await db.query('SELECT rol, identificador_fiscal FROM entidades_documento WHERE documento_id = ?', [d.id]);

        // is_issued = 1 si la empresa es EMISOR o PROVEEDOR
        const isIssued = entities.some((e: any) =>
            (e.rol === 'emisor' || e.rol === 'proveedor') && e.identificador_fiscal === myCIF
        );

        if (!isIssued) { // Solo Gastos
            const key = `${d.año_trimestre || 'SIN'}-T${d.num_trimestre || 'SIN'}`;
            if (!summary[key]) summary[key] = { count: 0, iva: 0, total: 0 };

            const [taxes]: any = await db.query('SELECT cuota, tipo_impuesto FROM impuestos_documento WHERE documento_id = ?', [d.id]);

            const ivaSum = taxes.filter((t: any) => {
                const n = (t.tipo_impuesto || '').toLowerCase();
                return !n.includes('retencion') && !n.includes('irpf') && !n.includes('recargo') && !n.includes('equivalencia');
            }).reduce((acc: any, t: any) => acc + Math.abs(Number(t.cuota)), 0);

            const recSum = taxes.filter((t: any) => {
                const n = (t.tipo_impuesto || '').toLowerCase();
                return n.includes('recargo') || n.includes('equivalencia');
            }).reduce((acc: any, t: any) => acc + Math.abs(Number(t.cuota)), 0);

            const retSum = taxes.filter((t: any) => {
                const n = (t.tipo_impuesto || '').toLowerCase();
                return n.includes('retencion') || n.includes('irpf');
            }).reduce((acc: any, t: any) => acc + Math.abs(Number(t.cuota)), 0);

            const isAbono = (d.tipo_documento || '').toLowerCase().includes('abono') || d.importe_total < 0;
            const sign = isAbono ? -1 : 1;

            // Dashboard uses fallback for Total IVA
            let docIVA = ivaSum > 0 ? ivaSum : Math.abs(d.importe_total - d.importe_sin_impuestos - recSum + retSum);

            summary[key].count++;
            summary[key].iva += docIVA * sign;
            summary[key].total += d.importe_total;
        }
    }

    console.log('RESUMEN DE IVA SOPORTADO (GASTOS) POR TRIMESTRE ASIGNADO:');
    console.table(summary);

    process.exit(0);
}
main();
