
const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkIva() {
    const connection = await mysql.createConnection({
        uri: process.env.DATABASE_URL
    });

    try {
        console.log('--- Checking Documents for 2025 ---');
        const [docs] = await connection.query(`
      SELECT id, numero_documento, fecha_emision, importe_total 
      FROM documentos 
      WHERE YEAR(fecha_emision) = 2025 AND id_de_empresa IN (66)
      LIMIT 5
    `);
        console.log('Sample Docs 2025:', docs);

        if (docs.length > 0) {
            const ids = docs.map(d => d.id);
            console.log('Checking impuestos for doc IDs:', ids);
            const [taxes] = await connection.query(`
        SELECT * FROM impuestos_documento WHERE documento_id IN (?)
      `, [ids]);
            console.log('Taxes found:', taxes);
        } else {
            console.log('No docs found for 2025 and company 66');
        }

    } catch (e) {
        console.error(e);
    } finally {
        await connection.end();
    }
}

checkIva();
