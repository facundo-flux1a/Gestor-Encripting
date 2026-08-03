const { createPool } = require('mysql2/promise');
require('dotenv').config({ path: '.env' });

async function run() {
  const pool = createPool({ uri: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  
  const userId = 6;
  const [docs] = await pool.query(
    `SELECT 
        d.id, 
        d.numero_documento, 
        d.id_de_empresa, 
        d.tipo_documento,
        e.identificador_fiscal_hash as proveedor_cif_hash,
        e.identificador_fiscal as proveedor_cif_raw,
        e.nombre_hash as proveedor_nombre_hash,
        e.nombre as proveedor_nombre_raw
     FROM documentos d
     JOIN empresas emp ON d.id_de_empresa = emp.id
     LEFT JOIN entidades_documento e ON (d.id = e.documento_id AND e.rol IN ('proveedor', 'emisor'))
     WHERE JSON_CONTAINS(emp.id_de_usuario, CAST(? AS JSON))
     AND d.numero_documento IS NOT NULL 
     AND d.numero_documento != ''`,
    [userId]
  );
  
  console.log(`Docs totales recuperados: ${docs.length}`);
  const docs64 = docs.filter(d => d.id_de_empresa === 64 && (d.numero_documento || '').includes('2026-0292'));
  console.log("Documentos filtrados para 64 (AR-2026-0292):", docs64);

  process.exit(0);
}
run().catch(console.error);
