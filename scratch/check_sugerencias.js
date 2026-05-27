const mysql = require('mysql2/promise');
require('dotenv').config();

async function check() {
  const connection = await mysql.createConnection({
    uri: process.env.DATABASE_URL
  });

  try {
    const [rows] = await connection.query('SHOW TABLES LIKE "sugerencias"');
    console.log("Tables:", rows);
  } catch (e) {
    console.log(e);
  }
  await connection.end();
}

check().catch(console.error);
