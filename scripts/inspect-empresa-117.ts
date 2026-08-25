import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import db from '../src/lib/db';
import type { RowDataPacket } from 'mysql2';

async function main() {
  console.log("=== INSPECCIÓN READ-ONLY EMPRESA 117 ===");

  // 1. Empresa info
  const empresa = await prisma.empresas.findUnique({
    where: { id: BigInt(117) },
    select: { id: true, nombre_de_empresa: true, CIF: true }
  });
  console.log("Empresa 117:", empresa);

  // 2. Conteo e IDs
  const [idStats] = await db.query<RowDataPacket[]>(
    `SELECT COUNT(*) as total, MIN(id) as min_id, MAX(id) as max_id 
     FROM documentos 
     WHERE id_de_empresa = 117`
  );
  console.log("Documentos stats:", idStats[0]);

  // 3. Documentos sin incidencias y confirmados
  const [docsValidos] = await db.query<RowDataPacket[]>(
    `SELECT COUNT(*) as total_validos
     FROM documentos d
     WHERE d.id_de_empresa = 117
       AND (
         (LOWER(d.tipo_documento) LIKE '%factura%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
         OR (LOWER(d.tipo_documento) LIKE '%abono%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
         OR (LOWER(d.tipo_documento) LIKE '%nota%cr%dito%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
       )
       AND d.id NOT IN (SELECT documento_id FROM incidencias_documento WHERE validado = 0)
       AND d.id NOT IN (SELECT documento_id FROM health_check_status WHERE verified = 0)`
  );
  console.log("Docs válidos en /api/v1/documents:", docsValidos[0]);

  // 4. Muestra de documentos específicos mencionados por el cliente
  const [facturasMuestra] = await db.query<RowDataPacket[]>(
    `SELECT d.id, d.numero_documento, d.tipo_documento, d.importe_total, d.importe_sin_impuestos, d.fecha_emision, d.fecha_creacion
     FROM documentos d
     WHERE d.id_de_empresa = 117 
       AND (d.numero_documento LIKE '%260616661%' OR d.numero_documento LIKE '%260210834%' OR d.numero_documento LIKE '%251113358%' OR d.numero_documento LIKE '%049%' OR d.numero_documento LIKE '%DAWOOD%')
     LIMIT 10`
  );
  console.log("\nFacturas mencionadas por el cliente:", facturasMuestra);

  if (facturasMuestra.length > 0) {
    const docId = facturasMuestra[0].id;
    const [lineas] = await db.query<RowDataPacket[]>(
      `SELECT * FROM lineas_documento WHERE documento_id = ?`, [docId]
    );
    console.log(`\nLíneas de la factura ${facturasMuestra[0].numero_documento} (id: ${docId}):`, lineas);

    const [impuestos] = await db.query<RowDataPacket[]>(
      `SELECT * FROM impuestos_documento WHERE documento_id = ?`, [docId]
    );
    console.log(`\nImpuestos de la factura (id: ${docId}):`, impuestos);

    const entidades = await prisma.entidades_documento.findMany({
      where: { documento_id: BigInt(docId) }
    });
    console.log(`\nEntidades de la factura (id: ${docId}):`, entidades);

    const archivos = await prisma.archivos_documento.findMany({
      where: { documento_id: BigInt(docId) }
    });
    console.log(`\nArchivos de la factura (id: ${docId}):`, archivos);
  }

  // 5. Muestra general de entidades para ver si tienen dirección, teléfono, datos_extra
  const sampleEntidades = await prisma.entidades_documento.findMany({
    where: { id_de_empresa: BigInt(117) },
    take: 5
  });
  console.log("\nMuestra de 5 entidades de empresa 117:", sampleEntidades);
}

main().finally(() => process.exit(0));
