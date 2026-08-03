const mysql = require('mysql2/promise');

async function main() {
  const connection = await mysql.createConnection('mysql://root:jGvbDOmoRTxJbjtMaiKpxvcCVkKqyLLq@tokaido.proxy.rlwy.net:17298/railway');
  const [r1] = await connection.query("SELECT COUNT(*) as c FROM incidencias_documento WHERE descripcion LIKE '%factura duplicado%'");
  console.log("Total duplicates:", r1[0].c);
  await connection.end();
}
main().catch(console.error);
