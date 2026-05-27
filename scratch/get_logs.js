const mysql = require('mysql2/promise');
require('dotenv').config();

async function getLogs() {
  const connection = await mysql.createConnection({
    uri: process.env.DATABASE_URL
  });

  const [rows] = await connection.query('SELECT * FROM webhook_logs ORDER BY created_at DESC LIMIT 5');
  console.log(JSON.stringify(rows, null, 2));
  await connection.end();
}

getLogs().catch(console.error);
