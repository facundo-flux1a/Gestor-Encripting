const db = require('mysql2/promise');
async function main() {
  const connection = await db.createConnection('mysql://root:jGvbDOmoRTxJbjtMaiKpxvcCVkKqyLLq@tokaido.proxy.rlwy.net:17298/railway');
  const [rows] = await connection.query(`
    SELECT id, documento_id, descripcion FROM incidencias_documento 
    WHERE documento_id IN (7548, 7549)
  `);
  console.log(rows);
  await connection.end();
}
main();
