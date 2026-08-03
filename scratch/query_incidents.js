const { createPool } = require('mysql2/promise');
const pool = createPool({
  uri: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  const [rows] = await pool.query('SELECT * FROM incidencias_documento WHERE descripcion LIKE "%factura duplicado:%"');
  console.log('Incidencias:', JSON.stringify(rows, null, 2));
  
  const [notifs] = await pool.query('SELECT * FROM notificaciones WHERE tipo = "factura_duplicada"');
  console.log('Notificaciones:', JSON.stringify(notifs, null, 2));
  
  process.exit(0);
}
run();
