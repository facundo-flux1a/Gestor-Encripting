import { config } from 'dotenv';
config({ path: '.env' });
config({ path: '.env.local' });

import db from '../src/lib/db';

async function main() {
  const [rows] = await db.query(`SELECT id, documento_id, descripcion, validado FROM incidencias_documento WHERE descripcion LIKE 'Número de factura duplicado%'`);
  console.log('Incidencias duplicados:', rows);
  process.exit(0);
}
main().catch(console.error);
