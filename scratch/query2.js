const mysql = require('mysql2/promise');

async function main() {
  const connection = await mysql.createConnection('mysql://root:jGvbDOmoRTxJbjtMaiKpxvcCVkKqyLLq@tokaido.proxy.rlwy.net:17298/railway');
  const [rows] = await connection.query("SELECT id, documento_id, descripcion, validado, incidencia FROM incidencias_documento WHERE documento_id IN (7548, 7549)");
  console.log(rows);
  await connection.end();
}
main().catch(console.error);
