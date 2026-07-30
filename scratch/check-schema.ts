import db from '../src/lib/db';
async function run() {
  const [rows] = await db.query('SHOW CREATE TABLE notificaciones');
  console.log(rows[0]['Create Table']);
  process.exit(0);
}
run();
