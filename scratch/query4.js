const mysql = require('mysql2/promise');

async function main() {
  const connection = await mysql.createConnection('mysql://root:jGvbDOmoRTxJbjtMaiKpxvcCVkKqyLLq@tokaido.proxy.rlwy.net:17298/railway');
  const [rows] = await connection.query("SELECT id, descripcion FROM incidencias_documento WHERE documento_id = 7548");
  for (const row of rows) {
    if (row.descripcion.includes('duplicado')) {
      console.log(Buffer.from(row.descripcion).toString('hex'));
      console.log(row.descripcion);
    }
  }
  await connection.end();
}
main().catch(console.error);
