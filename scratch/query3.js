const mysql = require('mysql2/promise');

async function main() {
  const connection = await mysql.createConnection('mysql://root:jGvbDOmoRTxJbjtMaiKpxvcCVkKqyLLq@tokaido.proxy.rlwy.net:17298/railway');
  const [rows] = await connection.query("SELECT id FROM incidencias_documento WHERE descripcion LIKE 'N_mero de factura duplicado%' AND validado = 0");
  console.log("With underscore:", rows.length);
  const [rows2] = await connection.query("SELECT id FROM incidencias_documento WHERE descripcion LIKE 'Número de factura duplicado%' AND validado = 0");
  console.log("With ú:", rows2.length);
  await connection.end();
}
main().catch(console.error);
