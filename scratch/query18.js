const db = require('mysql2/promise');
async function main() {
  const connection = await db.createConnection('mysql://root:jGvbDOmoRTxJbjtMaiKpxvcCVkKqyLLq@tokaido.proxy.rlwy.net:17298/railway');
  const [docs] = await connection.query(`
    SELECT 
          d.id, 
          d.numero_documento, 
          d.id_de_empresa, 
          d.tipo_documento
       FROM documentos d
       JOIN empresas emp ON d.id_de_empresa = emp.id
       WHERE JSON_CONTAINS(emp.id_de_usuario, CAST(6 AS JSON)) 
       AND d.numero_documento IS NOT NULL 
       AND d.numero_documento != ''
       AND TRIM(d.numero_documento) != ''
       AND (
         LOWER(d.tipo_documento) LIKE '%factura%'
         OR LOWER(d.tipo_documento) LIKE '%abono%'
       )
       AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%'
  `);
  
  const grupos = new Map();
  docs.forEach(doc => {
      const numero = doc.numero_documento.trim();
      const key = `${numero}|${doc.id_de_empresa}`;
      if (!grupos.has(key)) {
        grupos.set(key, { numero, empresa_id: doc.id_de_empresa, ids: [] });
      }
      grupos.get(key).ids.push(doc.id);
  });
  const duplicados = Array.from(grupos.values()).filter(g => g.ids.length > 1);
  console.log("Duplicados reales:", JSON.stringify(duplicados, null, 2));
  await connection.end();
}
main();
