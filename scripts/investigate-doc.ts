import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;

async function main() {
    if (!DATABASE_URL) {
        console.error('DATABASE_URL not found in .env');
        process.exit(1);
    }

    const pool = mysql.createPool(DATABASE_URL);
    const docNum = 'M01051';

    console.log(`🔍 INVESTIGATING DOCUMENT ${docNum}...\n`);

    try {
        const [docs] = await pool.query<any[]>(`
            SELECT id, numero_documento, importe_total, importe_sin_impuestos, tipo_documento
            FROM documentos 
            WHERE numero_documento = ?
        `, [docNum]);

        if (docs.length === 0) {
            console.log('Document not found');
            return;
        }

        const doc = docs[0];
        console.log(`HEADER:`, doc);

        const [lines] = await pool.query<any[]>(`
            SELECT tipo_impuesto, base_imponible, cuota, porcentaje
            FROM impuestos_documento 
            WHERE documento_id = ?
        `, [doc.id]);

        console.log(`\nTAX LINES (${lines.length}):`);
        console.table(lines);

    } catch (error) {
        console.error('Error during investigation:', error);
    } finally {
        await pool.end();
    }
}

main();
