const mysql = require('mysql2/promise');
require('dotenv').config();

async function run() {
    const connection = await mysql.createConnection(process.env.DATABASE_URL);

    const query = `
    SELECT 
      id, is_abono, b21, b10, b4, b0, total_iva, recargo_cuota, retencion_cuota, importe_total
    FROM Documentos
    WHERE empresa_id = 11
    AND fecha_emision BETWEEN '2026-01-01' AND '2026-03-31'
    AND is_issued = 0
  `;

    const [rows] = await connection.execute(query);

    let sumBases = 0;
    let sumIvaReal = 0; // The theoretical one
    let sumRecargo = 0;
    let sumRetencion = 0;
    let sumImporteTotalDB = 0;

    for (const row of rows) {
        const isAbono = row.is_abono === 1;
        const b21 = Number(row.b21 || 0);
        const b10 = Number(row.b10 || 0);
        const b4 = Number(row.b4 || 0);
        const b0 = Number(row.b0 || 0);
        const bases = b21 + b10 + b4 + b0;

        const baseSign = (isAbono && bases > 0) ? -bases : bases;
        sumBases += baseSign;

        // Theoretical IVA
        const ivaT = (b21 * 0.21) + (b10 * 0.10) + (b4 * 0.04);
        sumIvaReal += (isAbono && ivaT > 0) ? -ivaT : ivaT;

        const recargo = Number(row.recargo_cuota || 0);
        sumRecargo += (isAbono && recargo > 0) ? -recargo : recargo;

        const retencion = Number(row.retencion_cuota || 0);
        sumRetencion += (isAbono && retencion > 0) ? -retencion : retencion;

        sumImporteTotalDB += Number(row.importe_total || 0);
    }

    console.log('--- TOTALS FOR 36 DOCS ---');
    console.log('Sum Bases:', sumBases);
    console.log('Sum Theoretical IVA:', sumIvaReal);
    console.log('Sum Recargo:', sumRecargo);
    console.log('Sum Retencion:', sumRetencion);
    console.log('Sum ImporteTotal (Raw DB):', sumImporteTotalDB);

    console.log('\nCalculations:');
    console.log('Base + IVA + Recargo:', sumBases + sumIvaReal + sumRecargo);
    console.log('Base + IVA + Recargo - Retencion:', sumBases + sumIvaReal + sumRecargo - sumRetencion);

    await connection.end();
}

run().catch(console.error);
