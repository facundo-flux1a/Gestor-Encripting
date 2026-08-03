const mysql = require('mysql2/promise');

async function main() {
  const connection = await mysql.createConnection('mysql://root:jGvbDOmoRTxJbjtMaiKpxvcCVkKqyLLq@tokaido.proxy.rlwy.net:17298/railway');
  for(let i = 0; i < 5; i++) {
    const [rows] = await connection.query("SELECT id FROM incidencias_documento WHERE descripcion LIKE '%factura duplicado:%' ORDER BY id DESC LIMIT 2");
    console.log(new Date().toISOString(), rows.map(r => r.id));
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  await connection.end();
}
main().catch(console.error);
