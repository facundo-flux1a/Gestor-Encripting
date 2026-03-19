
const mysql = require('mysql2/promise');

async function check() {
    const url = 'mysql://root:kzoYGKdpaYqyMnwhiXJWPxtBJUCxoOJB@crossover.proxy.rlwy.net:10492/erp49';
    const connection = await mysql.createConnection(url);

    try {
        const [rows] = await connection.query(`
      SELECT id, numero_documento, fecha_emision, año_trimestre, num_trimestre, fecha_creacion
      FROM documentos 
      WHERE año_trimestre = 2026 
      LIMIT 10
    `);

        console.log('📄 [CHECK-DB] Documentos de 2026 (Primeros 10):');
        console.table(rows);

        const [counts] = await connection.query(`
      SELECT año_trimestre, COUNT(*) as count 
      FROM documentos 
      GROUP BY año_trimestre
    `);
        console.log('\n📊 [CHECK-DB] Conteos por año:');
        console.table(counts);

    } catch (err) {
        console.error(err);
    } finally {
        await connection.end();
    }
}

check();
