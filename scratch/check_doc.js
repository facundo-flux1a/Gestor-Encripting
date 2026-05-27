const mysql = require('mysql2/promise');
const config = {
  host: '127.0.0.1',
  user: 'root',
  password: 'password', // Asume default
  database: 'fluxdocs_erp_prod',
  port: 3306
};

async function check() {
  const conn = await mysql.createConnection(config);
  const [act] = await conn.query('SELECT * FROM actividad ORDER BY id DESC LIMIT 5');
  console.log("Actividad recientes:", JSON.stringify(act, null, 2));
  
  const [inc] = await conn.query('SELECT * FROM incidencias_documento ORDER BY id DESC LIMIT 5');
  console.log("Incidencias_documento recientes:", JSON.stringify(inc, null, 2));
  
  const [ai_inc] = await conn.query('SELECT * FROM ai_incidencias_documento ORDER BY id DESC LIMIT 5');
  console.log("ai_incidencias_documento recientes:", JSON.stringify(ai_inc, null, 2));
  
  conn.end();
}
check();
