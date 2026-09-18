const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection({
    host: 'switchback.proxy.rlwy.net', port: 37211,
    user: 'root', password: 'SmWWvtFgTaACgtdeOGbCHJQnAjatbtVh',
    database: 'railway', ssl: { rejectUnauthorized: false }
  });

  // Buscar API keys para emp:120 y emp:80 y la key de prueba (id=49)
  const [rows] = await conn.query(
    `SELECT k.id, k.empresa_id, k.key_hash, k.nombre, k.activa, k.prefix
     FROM api_keys k
     WHERE k.empresa_id IN (80, 120) OR k.id = 49
     ORDER BY k.empresa_id`
  );
  console.log('API keys:', rows.map(r => `id:${r.id} | emp:${r.empresa_id} | nombre:${r.nombre} | activa:${r.activa} | prefix:${r.prefix}`).join('\n'));

  // Ver columnas de api_keys
  const [cols] = await conn.query(`DESCRIBE api_keys`);
  console.log('\nColumnas api_keys:', cols.map(c => c.Field).join(', '));

  await conn.end();
}
main().catch(e => console.error(e.message));
