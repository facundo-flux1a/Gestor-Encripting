
const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkIvaFull() {
    const connection = await mysql.createConnection({
        uri: process.env.DATABASE_URL
    });

    try {
        const year = 2025;
        const companies = [66];
        const cifPlaceholders = "'NEVER_MATCH'";

        console.log('--- Checking Documents Details ---');
        const [docs] = await connection.query(`
      SELECT id, numero_documento, tipo_documento, fecha_emision 
      FROM documentos 
      WHERE YEAR(fecha_emision) = 2025 AND id_de_empresa IN (66)
    `);
        console.log('Docs details:', docs);

        console.log('\n--- Running FULL Query Simulation ---');
        const query = `
        WITH DocTypes AS (
            SELECT 
                d.id,
                d.fecha_emision,
                d.importe_total,
                i.cuota as iva_cuota,
                i.tipo_impuesto,
                CASE 
                    WHEN LOWER(d.tipo_documento) LIKE '%abono%' OR d.importe_total < 0 
                    THEN 1 
                    ELSE 0 
                END as es_abono,
                CASE
                    WHEN LOWER(d.tipo_documento) REGEXP 'emitid[oa]' THEN 1
                    WHEN LOWER(d.tipo_documento) REGEXP 'recibid[oa]' THEN 0
                    WHEN LOWER(d.tipo_documento) LIKE '%abono%' THEN 0 -- Simplified for test
                    ELSE CASE WHEN d.importe_total < 0 THEN 1 ELSE 0 END
                END as is_issued
            FROM documentos d
            JOIN impuestos_documento i ON d.id = i.documento_id
            WHERE YEAR(d.fecha_emision) = ? 
              AND i.tipo_impuesto NOT LIKE '%retencion%'
              AND (
                  (LOWER(d.tipo_documento) LIKE '%factura%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
                  OR (LOWER(d.tipo_documento) LIKE '%abono%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
              )
             AND d.id_de_empresa IN (?)
        )
        SELECT * FROM DocTypes`;

        const [rows] = await connection.query(query, [year, companies]);
        console.log('Returned Rows:', rows.length);
        console.log('First 5 rows:', rows.slice(0, 5));

    } catch (e) {
        console.error(e);
    } finally {
        await connection.end();
    }
}

checkIvaFull();
