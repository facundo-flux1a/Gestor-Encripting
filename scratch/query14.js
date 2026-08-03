const mysql = require('mysql2/promise');

async function main() {
  const connection = await mysql.createConnection('mysql://root:jGvbDOmoRTxJbjtMaiKpxvcCVkKqyLLq@tokaido.proxy.rlwy.net:17298/railway');
  const [rows] = await connection.query(`SELECT 
        d.id, 
        d.numero_documento, 
        d.id_de_empresa,
        d.tipo_documento
       FROM documentos d
       JOIN empresas e ON d.id_de_empresa = e.id
       WHERE JSON_CONTAINS(e.id_de_usuario, CAST(6 AS JSON)) 
         AND d.numero_documento IS NOT NULL 
         AND d.numero_documento != ''
         AND TRIM(d.numero_documento) != ''
         AND (
           LOWER(d.tipo_documento) LIKE '%factura%'
           OR LOWER(d.tipo_documento) LIKE '%abono%'
         )
         AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%'
         AND d.id IN (7548, 7549)`);
  console.log("Documents found:", rows.length);
  console.log(rows);
  await connection.end();
}
main().catch(console.error);
