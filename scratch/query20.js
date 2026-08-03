const db = require('mysql2/promise');
async function main() {
  const connection = await db.createConnection('mysql://root:jGvbDOmoRTxJbjtMaiKpxvcCVkKqyLLq@tokaido.proxy.rlwy.net:17298/railway');
  const [rows] = await connection.query(`
    SELECT id, validado FROM incidencias_documento 
    WHERE id IN (29910, 29911)
  `);
  console.log(rows);
  await connection.end();
}
main();
