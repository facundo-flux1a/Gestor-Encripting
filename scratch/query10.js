const mysql = require('mysql2/promise');

async function main() {
  const connection = await mysql.createConnection('mysql://root:jGvbDOmoRTxJbjtMaiKpxvcCVkKqyLLq@tokaido.proxy.rlwy.net:17298/railway');
  const [rows] = await connection.query("SELECT id, documento_id FROM incidencias_documento WHERE descripcion LIKE '%factura duplicado:%' AND validado = 0");
  console.log("Found:", rows.length);
  await connection.end();
}
main().catch(console.error);
