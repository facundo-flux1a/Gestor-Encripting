const db = require('./src/lib/db').default;
async function test() {
  const [rows] = await db.query(`SELECT * FROM health_check_status WHERE check_type IN ('FECHA_ANOMALA', 'ENTIDAD_DUPLICADA')`);
  console.log(rows);
  process.exit(0);
}
test();
