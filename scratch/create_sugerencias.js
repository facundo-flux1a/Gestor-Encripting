const mysql = require('mysql2/promise');
require('dotenv').config();

async function createTable() {
  const connection = await mysql.createConnection({
    uri: process.env.DATABASE_URL
  });

  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sugerencias (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        id_usuario BIGINT NOT NULL,
        mensaje TEXT NOT NULL,
        media_urls JSON DEFAULT NULL,
        estado VARCHAR(50) DEFAULT 'pendiente',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("Tabla sugerencias creada.");
  } catch (e) {
    console.log(e);
  }
  await connection.end();
}

createTable().catch(console.error);
