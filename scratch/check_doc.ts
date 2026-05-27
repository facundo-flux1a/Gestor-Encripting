import 'dotenv/config';
import mysql from 'mysql2/promise';

async function check() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL as string);
  const [act] = await conn.query('SELECT * FROM actividad ORDER BY id DESC LIMIT 2');
  console.log("Actividad recientes:", JSON.stringify(act, null, 2));
  
  const [inc] = await conn.query('SELECT * FROM incidencias_documento ORDER BY id DESC LIMIT 2');
  console.log("Incidencias_documento recientes:", JSON.stringify(inc, null, 2));
  
  const [ai_inc] = await conn.query('SELECT * FROM ai_incidencias_documento ORDER BY id DESC LIMIT 2');
  console.log("ai_incidencias_documento recientes:", JSON.stringify(ai_inc, null, 2));
  
  conn.end();
}
check();
