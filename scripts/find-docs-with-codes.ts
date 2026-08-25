import 'dotenv/config';
import db from '../src/lib/db';

async function main() {
  console.log('=== BUSCANDO DOCUMENTOS CON CÓDIGOS DE ARTÍCULO ===\n');

  // Buscar en empresa 117
  const [empresa117]: any = await db.query(
    `SELECT l.documento_id, d.numero_documento, l.codigo, l.descripcion, l.precio_unitario, l.importe_linea
     FROM lineas_documento l
     JOIN documentos d ON l.documento_id = d.id
     WHERE l.id_de_empresa = 117 
       AND l.codigo IS NOT NULL 
       AND TRIM(l.codigo) != ''
     LIMIT 20`
  );
  console.log('Facturas con código en Empresa 117:', empresa117);

  // Buscar en general por si Valentia u otra empresa tiene los IDs 7596 - 8627 que mencionó el cliente
  const [otras]: any = await db.query(
    `SELECT l.documento_id, d.numero_documento, d.id_de_empresa, l.codigo, l.descripcion, l.precio_unitario
     FROM lineas_documento l
     JOIN documentos d ON l.documento_id = d.id
     WHERE l.codigo IS NOT NULL 
       AND TRIM(l.codigo) != ''
       AND l.codigo != 'SUPLIDO'
     LIMIT 20`
  );
  console.log('\nFacturas con código en otras empresas / general:', otras);

  // Buscar la factura de DAWOOD mencionada por el cliente
  const [dawood]: any = await db.query(
    `SELECT d.id, d.numero_documento, d.id_de_empresa, e.nombre_de_empresa
     FROM documentos d
     LEFT JOIN empresas e ON d.id_de_empresa = e.id
     WHERE d.numero_documento LIKE '%DAWOOD%' OR d.observaciones LIKE '%DAWOOD%'
     LIMIT 5`
  );
  console.log('\nFactura DAWOOD:', dawood);
}

main().finally(() => process.exit(0));
