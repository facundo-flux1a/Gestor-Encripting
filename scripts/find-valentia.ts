import 'dotenv/config';
import db from '../src/lib/db';
import { prisma } from '../src/lib/prisma';

async function main() {
  const empresas = await prisma.empresas.findMany({
    select: { id: true, nombre_de_empresa: true, CIF: true }
  });
  console.log('Total empresas:', empresas.length);
  for (const e of empresas) {
    if (e.nombre_de_empresa) {
      console.log(`ID: ${e.id} -> ${e.nombre_de_empresa} (${e.CIF})`);
    }
  }

  // Buscar documentos con código de producto
  const [docsConCodigo]: any = await db.query(
    `SELECT l.documento_id, d.numero_documento, d.id_de_empresa, l.codigo, l.descripcion, l.precio_unitario, l.importe_linea
     FROM lineas_documento l
     JOIN documentos d ON l.documento_id = d.id
     WHERE l.codigo IS NOT NULL AND TRIM(l.codigo) != '' AND l.codigo != 'SUPLIDO'
     LIMIT 10`
  );
  console.log('\nEjemplos de facturas con código de producto:');
  console.log(docsConCodigo);
}

main().finally(() => process.exit(0));
