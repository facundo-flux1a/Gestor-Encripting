import mysql from 'mysql2/promise';

async function main() {
  const conn = await mysql.createConnection({
    host: 'crossover.proxy.rlwy.net',
    port: 54935,
    user: 'root',
    password: 'DGlmTbzZEIVNjCsdNcnADJdDxotXpndV',
    database: 'railway',
    ssl: { rejectUnauthorized: false },
  });
  const [rows] = await conn.query('SELECT COUNT(*) as n FROM documentos');
  console.log('✅ MySQL2 directo OK! Docs:', rows);
  await conn.end();
}
main().catch(console.error);
