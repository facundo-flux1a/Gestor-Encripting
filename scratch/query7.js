const mysql = require('mysql2/promise');

async function main() {
  const connection = await mysql.createConnection('mysql://root:jGvbDOmoRTxJbjtMaiKpxvcCVkKqyLLq@tokaido.proxy.rlwy.net:17298/railway');
  const [r1] = await connection.query("SELECT id FROM incidencias_documento WHERE descripcion LIKE '%factura duplicado%'");
  console.log("Without validado:", r1.length);
  await connection.end();
}
main().catch(console.error);
