
const { getDashboardAnalytics, getTrimestresList, getDocumentosByTrimestre } = require('./src/services/document-service.ts');
const { calculateFinancials } = require('./src/lib/financial-engine.ts');

async function debug() {
    // Simulamos los parámetros para T1 2026
    const userId = 1; // Ajustar si es necesario, pero buscaremos por empresa
    const año = 2026;
    const trimestre = 1;

    // 1. Obtener datos del Dashboard
    const dashboard = await getDashboardAnalytics([1], año, trimestre);
    console.log('--- DASHBOARD ---');
    console.log('Total Gastos (con IVA):', dashboard.kpis.totalGastos);
    console.log('Resultado IVA:', dashboard.kpis.resultadoIva);
    console.log('IVA Soportado:', dashboard.kpis.ivaSoportado);
    console.log('Count Gastos:', dashboard.kpis.totalFacturasGasto);

    // 2. Obtener documentos de Trimestres
    const docs = await getDocumentosByTrimestre(userId, año, trimestre, [1]);
    console.log('\n--- TRIMESTRES ---');
    console.log('Total Documentos:', docs.length);

    const results = calculateFinancials(docs, 'B64560195'); // CIF de la empresa 1
    const gastos = results.gastos;

    // Calcular como lo hace el componente page.tsx (teórico)
    const quotas = {
        iva21: Math.round((gastos.bases[21]?.total || 0) * 21) / 100,
        iva15: Math.round((gastos.bases[15]?.total || 0) * 15) / 100,
        iva10: Math.round((gastos.bases[10]?.total || 0) * 10) / 100,
        iva4: Math.round((gastos.bases[4]?.total || 0) * 4) / 100,
    };
    const totalIVA = Object.values(quotas).reduce((acc, v) => acc + v, 0);
    const totalBase = Object.values(gastos.bases).reduce((acc, b) => acc + b.total, 0);
    const totalTeorico = totalBase + totalIVA + gastos.recargos.total - gastos.retenciones.total;
    const totalRealDB = gastos.totalReal.total;

    console.log('Total Gastos Teórico:', totalTeorico);
    console.log('Total Gastos Real (DB):', totalRealDB);
    console.log('IVA Soportado Teórico:', totalIVA);
    console.log('IVA Soportado Real (DB):', Object.values(gastos.ivaDB).reduce((a, b) => a + b.total, 0));

    // 3. Buscar el culpable
    console.log('\n--- DOCUMENTOS GASTOS ---');
    docs.filter(d => Number(d.is_issued) === 0).forEach(d => {
        const tipoLower = (d.tipo_documento || '').toLowerCase();
        const esAbono = tipoLower.includes('abono') || tipoLower.includes('crédito') || tipoLower.includes('credito') || Number(d.total) < 0;
        console.log(`ID: ${d.id_documento} | Num: ${d.numero_documento} | Tipo: ${d.tipo_documento} | DB Total: ${d.total} | Abono: ${esAbono}`);
    });
}

debug().catch(console.error).finally(() => process.exit());
