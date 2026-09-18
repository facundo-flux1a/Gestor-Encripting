const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const mysql = require('mysql2/promise');
const cloak = require('@47ng/cloak');

async function main() {
  const conn = await mysql.createConnection({
    host: 'switchback.proxy.rlwy.net', port: 37211,
    user: 'root', password: 'SmWWvtFgTaACgtdeOGbCHJQnAjatbtVh',
    database: 'railway', ssl: { rejectUnauthorized: false }
  });

  const KEY = process.env.PRISMA_FIELD_ENCRYPTION_KEY.replace(/"/g, '');

  // Empresa 112
  const [[emp]] = await conn.query(
    `SELECT e.id, e.nombre_de_empresa, u.email, u.id as user_id
     FROM empresas e
     LEFT JOIN usuarios u ON u.id_empresa = e.id
     WHERE e.id = 112 LIMIT 1`
  );

  let nombre = emp.nombre_de_empresa || '';
  let email = emp.email || '';
  try { nombre = await cloak.decryptString(nombre, KEY); } catch {}
  try { email = await cloak.decryptString(email, KEY); } catch {}
  console.log(`Empresa 112: "${nombre}" | user_id:${emp.user_id} | email:${email}`);

  // Ver el nuevo doc de la EMT subido hoy (empresa del user)
  const [recent] = await conn.query(
    `SELECT d.id, d.numero_documento, d.importe_total, d.importe_sin_impuestos,
       CAST(JSON_UNQUOTE(JSON_EXTRACT(d.datos_extra, '$.descuento_global')) AS DECIMAL(10,2)) as dto,
       d.fecha_creacion, d.id_de_empresa
     FROM documentos d
     WHERE d.numero_documento LIKE '%A2600009813%' OR d.numero_documento LIKE '%2600009813%'
     ORDER BY d.id DESC LIMIT 5`
  );
  console.log('\nTodas las versiones del doc EMT en la BD:');
  recent.forEach(r => console.log(
    `  ID:${r.id} | emp:${r.id_de_empresa} | base:${r.importe_sin_impuestos} | total:${r.importe_total} | dto:${r.dto} | creado:${new Date(r.fecha_creacion).toISOString().substring(0,19)}`
  ));

  await conn.end();
}
main().catch(e => console.error(e.message));
