import 'dotenv/config';
import { prisma } from '../lib/prisma';

async function main() {
  const id = 18234n;

  const doc = await prisma.documentos.findUnique({
    where: { id },
    select: { id: true, tipo_documento: true, importe_total: true, importe_sin_impuestos: true }
  });

  const impuestos = await prisma.impuestos_documento.findMany({
    where: { documento_id: id },
    select: { tipo_impuesto: true, porcentaje: true, base_imponible: true, cuota: true }
  });

  const incidencias = await prisma.incidencias_documento.findMany({
    where: { documento_id: id },
    select: { incidencia: true, validado: true, descripcion: true }
  });

  console.log('\n📄 DOC:', JSON.stringify(doc, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2));
  console.log('\n💰 IMPUESTOS:', JSON.stringify(impuestos, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2));
  console.log('\n🚨 INCIDENCIAS:');
  incidencias.forEach(i => {
    console.log(' -', i.incidencia ? '🔴 BLOQUEANTE' : '🟢 info', '| validado:', i.validado, '\n   desc:', i.descripcion.substring(0, 150));
  });

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
