const mysql = require('mysql2/promise');

const DATABASE_URL = "mysql://root:kzoYGKdpaYqyMnwhiXJWPxtBJUCxoOJB@crossover.proxy.rlwy.net:10492/erp49";

async function check() {
    const connection = await mysql.createConnection(DATABASE_URL);
    try {
        console.log('--- Resumen de Documentos por Año/Trimestre ---');
        const [summary] = await connection.query('SELECT año_trimestre, num_trimestre, COUNT(*) as count FROM documentos GROUP BY año_trimestre, num_trimestre ORDER BY año_trimestre DESC, num_trimestre DESC');
        console.table(summary);

        console.log('\n--- Detalle de documentos en 2026 (si los hay) ---');
        const [docs2026] = await connection.query('SELECT id, numero_documento, fecha_emision, año_trimestre, num_trimestre FROM documentos WHERE año_trimestre = 2026 LIMIT 10');
        console.table(docs2026);

    } catch (e) {
        console.error(e);
    } finally {
        await connection.end();
    }
}

check();
