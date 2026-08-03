import { config } from 'dotenv';
config({ path: '.env' });
import db from '../src/lib/db';

async function main() {
  const [rows] = await db.query(`SHOW COLUMNS FROM incidencias_documento`);
  console.log(rows);
  process.exit(0);
}
main().catch(console.error);
