const mysql = require('mysql2/promise');
require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });

async function run() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    const [rows] = await conn.query(`
      SELECT d.id, d.estado, d.confirmado, e.nombre, e.rol
      FROM documentos d
      LEFT JOIN entidades_documento e ON e.documento_id = d.id
      WHERE d.id_de_empresa IN (99, 64)
      LIMIT 10
    `);
    console.log(rows);
  } finally {
    await conn.end();
  }
}
run();
