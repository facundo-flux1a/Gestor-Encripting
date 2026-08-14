import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Buscar el doc del notario (12602239-A) 
const [docs] = await conn.query(`SELECT id, numero_documento, importe_total, importe_sin_impuestos, datos_extra FROM documentos WHERE numero_documento LIKE '%12602239%' OR numero_documento LIKE '%12602239-A%' ORDER BY id DESC LIMIT 5`);
console.log('--- DOCS encontrados ---');
for (const d of docs) {
  const de = typeof d.datos_extra === 'string' ? JSON.parse(d.datos_extra || '{}') : (d.datos_extra || {});
  console.log({ id: d.id, num: d.numero_documento, total: Number(d.importe_total), base: Number(d.importe_sin_impuestos), base_no_sujeta: Number(de.base_no_sujeta || 0), retencion: Number(de.retencion || 0), descuento: Number(de.descuento_global || 0) });
  
  const [imp] = await conn.query(`SELECT tipo_impuesto, porcentaje, base_imponible, cuota FROM impuestos_documento WHERE documento_id = ?`, [d.id]);
  console.log('  impuestos:', imp.map(i => ({ tipo: i.tipo_impuesto, pct: Number(i.porcentaje), base: Number(i.base_imponible), cuota: Number(i.cuota) })));
}

await conn.end();
