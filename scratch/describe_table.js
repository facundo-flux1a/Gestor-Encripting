const mysql = require('mysql2/promise');
require('dotenv').config();

async function describeTable() {
  const connection = mysql.createPool(process.env.DATABASE_URL);
  try {
    const [rows] = await connection.query('DESCRIBE actividad');
    console.log(JSON.stringify(rows, null, 2));
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

describeTable();
