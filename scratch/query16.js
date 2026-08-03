const mysql = require('mysql2/promise');

async function main() {
  const connection = await mysql.createConnection('mysql://root:jGvbDOmoRTxJbjtMaiKpxvcCVkKqyLLq@tokaido.proxy.rlwy.net:17298/railway');
  const [rows] = await connection.query("SELECT id, message, created_at FROM notificaciones WHERE message LIKE '%7548%' ORDER BY created_at DESC");
  console.log("Total notifications:", rows.length);
  if (rows.length > 0) {
    console.log("Latest:", rows[0].created_at);
    console.log("Oldest:", rows[rows.length - 1].created_at);
  }
  await connection.end();
}
main().catch(console.error);
