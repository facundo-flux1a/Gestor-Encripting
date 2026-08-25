import 'dotenv/config';
import db from '../src/lib/db';

async function main() {
  const ids = [10944, 10454, 10609, 10785];
  console.log('=== DOCUMENTOS ===');
  const [docs]: any = await db.query(
    'SELECT id, numero_documento, tipo_documento, importe_total, importe_sin_impuestos, file_hash, datos_extra, fecha_emision, fecha_creacion FROM documentos WHERE id IN (?)',
    [ids]
  );
  console.log(JSON.stringify(docs, null, 2));

  console.log('=== HEALTH CHECK STATUS ===');
  const [health]: any = await db.query(
    'SELECT * FROM health_check_status WHERE documento_id IN (?)',
    [ids]
  );
  console.log(JSON.stringify(health, null, 2));

  console.log('=== INCIDENCIAS DOCUMENTO ===');
  const [incidencias]: any = await db.query(
    'SELECT * FROM incidencias_documento WHERE documento_id IN (?)',
    [ids]
  );
  console.log(JSON.stringify(incidencias, null, 2));

  console.log('=== VERIFICANDO DUPLICADOS POR NUMERO DE DOCUMENTO ===');
  for (const doc of docs) {
    const [dups]: any = await db.query(
      'SELECT id, numero_documento, fecha_emision, importe_total, fecha_creacion FROM documentos WHERE id_de_empresa = 117 AND numero_documento = ?',
      [doc.numero_documento]
    );
    console.log(`Docs con mismo numero (${doc.numero_documento}):`, dups);
  }
}

main().finally(() => process.exit(0));
