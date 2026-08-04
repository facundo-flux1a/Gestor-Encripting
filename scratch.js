require('dotenv').config();
const mysql = require('mysql2/promise');

async function main() {
  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  
  const [docs] = await connection.execute(
    'SELECT id, numero_documento, tipo_documento, importe_total, importe_sin_impuestos, datos_extra FROM documentos WHERE id IN (4383, 4387, 4394)'
  );
  
  console.log("Documentos:", JSON.stringify(docs, null, 2));
  
  const [taxes] = await connection.execute(
    'SELECT documento_id, tipo_impuesto, base_imponible, porcentaje, cuota FROM impuestos_documento WHERE documento_id IN (4383, 4387, 4394)'
  );
  console.log("Impuestos:", JSON.stringify(taxes, null, 2));
  
  await connection.end();
}
main().catch(console.error);
