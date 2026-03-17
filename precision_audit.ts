
import db from './src/lib/db';

async function precisionAudit() {
    const empresaId = 11;
    const año = 2026;
    const trimestre = 1;

    // 1. Obtener documentos brutos
    const [docs]: any = await db.query(`
        SELECT d.*, 
            e.cif as empresa_cif,
            (SELECT SUM(cuota) FROM impuestos_documento WHERE documento_id = d.id AND (tipo_impuesto NOT LIKE '%reten%' AND tipo_impuesto NOT LIKE '%recargo%' AND tipo_impuesto NOT LIKE '%equivalencia%')) as iva_db,
            (SELECT SUM(cuota) FROM impuestos_documento WHERE documento_id = d.id AND (tipo_impuesto LIKE '%recargo%' OR tipo_impuesto LIKE '%equivalencia%')) as recargo_db,
            (SELECT SUM(cuota) FROM impuestos_documento WHERE documento_id = d.id AND (tipo_impuesto LIKE '%reten%' OR tipo_impuesto LIKE '%irpf%')) as retencion_db
        FROM documentos d
        JOIN empresas e ON d.id_de_empresa = e.id
        WHERE d.id_de_empresa = ? AND d.año_trimestre = ? AND d.num_trimestre = ?
        AND (
            (LOWER(d.tipo_documento) LIKE '%factura%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
            OR (LOWER(d.tipo_documento) LIKE '%abono%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
        )
        AND d.id NOT IN (SELECT documento_id FROM incidencias_documento WHERE validado = 0)
    `, [empresaId, año, trimestre]);

    console.log(`Analizando ${docs.length} documentos...\n`);

    let dashBase = 0;
    let dashIvaReal = 0;
    let dashRecargo = 0;
    let dashRetencion = 0;
    let dashTotal = 0;

    docs.forEach((d: any) => {
        const isAbono = d.tipo_documento.toLowerCase().includes('abono') || Number(d.importe_total) < 0;
        const sign = isAbono ? -1 : 1;

        dashBase += Number(d.importe_sin_impuestos || 0) * sign;
        dashIvaReal += Number(d.iva_db || 0) * sign;
        dashRecargo += Number(d.recargo_db || 0) * sign;
        dashRetencion += Number(d.retencion_db || 0) * sign;
        dashTotal += Number(d.importe_total || 0) * (isAbono && Number(d.importe_total) > 0 ? -1 : 1);
    });

    console.log('--- MODELO DASHBOARD (Real DB) ---');
    console.log('Base:', dashBase.toFixed(2));
    console.log('IVA (Real):', dashIvaReal.toFixed(2));
    console.log('Recargo:', dashRecargo.toFixed(2));
    console.log('Retencion:', dashRetencion.toFixed(2));
    console.log('SUMA (Base + IVA + Rec - Ret):', (dashBase + dashIvaReal + dashRecargo - dashRetencion).toFixed(2));
    console.log('Total DB:', dashTotal.toFixed(2));

    // Modelo Teórico
    let teoricoBase = dashBase;
    let teoricoIva = Math.round(dashBase * 0.21 * 100) / 100; // Simplificado para el ejemplo
    // Nota: El motor real lo hace por tasa, pero aquí la mayoría son 21%

    // Vamos a hacerlo más fiel al motor
    const bases: any = { 21: 0, 15: 0, 10: 0, 4: 0, 0: 0 };
    // Simulamos el reparto de bases del motor (usando iva_db / base para adivinar tasa)
    docs.forEach((d: any) => {
        const isAbono = d.tipo_documento.toLowerCase().includes('abono') || Number(d.importe_total) < 0;
        const sign = isAbono ? -1 : 1;
        const base = Number(d.importe_sin_impuestos || 0) * sign;
        const iva = Number(d.iva_db || 0) * sign;
        let rate = 0;
        if (Math.abs(base) > 0) {
            rate = Math.round((iva / base) * 100);
        }
        if (bases.hasOwnProperty(rate)) bases[rate] += base;
        else bases[21] += base; // Default
    });

    let totalIvaTeorico = 0;
    [21, 15, 10, 4].forEach(r => {
        totalIvaTeorico += Math.round(bases[r] * r) / 100;
    });

    console.log('\n--- MODELO TRIMESTRES (Teórico) ---');
    console.log('Base:', dashBase.toFixed(2));
    console.log('IVA (Teórico):', totalIvaTeorico.toFixed(2));
    console.log('Recargo:', dashRecargo.toFixed(2));
    console.log('Retencion:', dashRetencion.toFixed(2));
    console.log('SUMA (Base + IVA + Rec - Ret):', (teoricoBase + totalIvaTeorico + dashRecargo - dashRetencion).toFixed(2));
}

precisionAudit().catch(console.error).finally(() => process.exit());
