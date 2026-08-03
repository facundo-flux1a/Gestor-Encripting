const mysql = require('mysql2/promise');

async function main() {
  const connection = await mysql.createConnection('mysql://root:jGvbDOmoRTxJbjtMaiKpxvcCVkKqyLLq@tokaido.proxy.rlwy.net:17298/railway');
  const [r1] = await connection.query("SELECT id FROM incidencias_documento WHERE descripcion LIKE '%factura duplicado%' AND validado = 0");
  console.log("With %factura duplicado%:", r1.length);
  const [r2] = await connection.query("SELECT id FROM incidencias_documento WHERE descripcion LIKE 'N%mero de factura duplicado%' AND validado = 0");
  console.log("With N%mero:", r2.length);
  await connection.end();
}
main().catch(console.error);
