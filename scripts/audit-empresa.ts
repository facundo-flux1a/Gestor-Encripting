/**
 * Script de solo lectura para auditar los documentos de la empresa 117.
 * Muestra: entidades (proveedores/clientes), documentos y sus importes.
 */
import { prisma } from '@/lib/prisma';

const EMPRESA_ID = 117n;

async function main() {
  console.log('\n============================');
  console.log('  AUDITORÍA EMPRESA 117');
  console.log('============================\n');

  // 1. Info de la empresa
  const empresa = await prisma.empresas.findUnique({ where: { id: EMPRESA_ID } });
  console.log(`🏢 Empresa: ${empresa?.nombre_de_empresa ?? '?'} (Fiscal: ${empresa?.nombre_fiscal ?? '?'}) | CIF: ${empresa?.CIF ?? '?'}\n`);

  // 2. Entidades (proveedores/clientes) vinculadas a esta empresa
  const entidades = await prisma.entidades_documento.findMany({
    where: { id_de_empresa: EMPRESA_ID },
  });

  console.log(`👥 ENTIDADES (${entidades.length} total):`);
  console.log('─'.repeat(80));
  for (const e of entidades) {
    const cif = (e as any).identificador_fiscal ?? '(encriptado/vacío)';
    console.log(`  [${e.id}] ${e.nombre} | CIF: ${cif} | Tipo: ${e.rol}`);
  }

  // 3. Documentos
  const docs = await prisma.documentos.findMany({
    where: { id_de_empresa: EMPRESA_ID },
    orderBy: { fecha_creacion: 'desc' },
    take: 60,
    include: {
      incidencias_documento: { take: 1, orderBy: { fecha_creacion: 'desc' } },
    },
  });

  console.log(`\n📄 DOCUMENTOS (últimos ${docs.length}):`);
  console.log('─'.repeat(120));
  console.log(
    `${'ID'.padEnd(6)} ${'Tipo'.padEnd(18)} ${'Nº Documento'.padEnd(28)} ${'Fecha'.padEnd(12)} ${'Total'.padEnd(12)} ${'Estado'}`
  );
  console.log('─'.repeat(120));

  for (const d of docs) {
    const tipo = d.tipo_documento ?? '(sin tipo)';
    const num = ((d as any).numero_documento ?? '').toString().slice(0, 26);
    const fecha = d.fecha_emision ? new Date(d.fecha_emision).toLocaleDateString('es-ES') : '?';
    const total = d.importe_total != null ? `${Number(d.importe_total).toFixed(2)} €` : '?';
    const incid = d.incidencias_documento?.[0]?.descripcion ?? '';
    const estado = incid ? `⚠️ ${incid.slice(0, 40)}` : '✅ OK';

    console.log(
      `${d.id.toString().padEnd(6)} ${tipo.padEnd(18)} ${num.padEnd(28)} ${fecha.padEnd(12)} ${total.padEnd(12)} ${estado}`
    );
  }

  // 4. Resumen financiero
  const resumen = await prisma.documentos.aggregate({
    where: { id_de_empresa: EMPRESA_ID, tipo_documento: { contains: 'RECIBIDA' } },
    _sum: { importe_total: true, importe_sin_impuestos: true },
    _count: true,
  });
  const resumenE = await prisma.documentos.aggregate({
    where: { id_de_empresa: EMPRESA_ID, tipo_documento: { contains: 'EMITIDA' } },
    _sum: { importe_total: true, importe_sin_impuestos: true },
    _count: true,
  });

  console.log('\n📊 RESUMEN FINANCIERO:');
  console.log('─'.repeat(60));
  console.log(`  Facturas RECIBIDAS: ${resumen._count} docs | Total: ${Number(resumen._sum.importe_total ?? 0).toFixed(2)} € | Base: ${Number(resumen._sum.importe_sin_impuestos ?? 0).toFixed(2)} €`);
  console.log(`  Facturas EMITIDAS:  ${resumenE._count} docs | Total: ${Number(resumenE._sum.importe_total ?? 0).toFixed(2)} € | Base: ${Number(resumenE._sum.importe_sin_impuestos ?? 0).toFixed(2)} €`);

  // 5. Documentos con incidencia
  const conIncidencia = await prisma.incidencias_documento.findMany({
    where: { documentos: { id_de_empresa: EMPRESA_ID } },
    include: { documentos: { select: { numero_documento: true, tipo_documento: true } } },
    orderBy: { fecha_creacion: 'desc' },
  });

  if (conIncidencia.length > 0) {
    console.log(`\n⚠️  INCIDENCIAS (${conIncidencia.length}):`);
    console.log('─'.repeat(80));
    for (const inc of conIncidencia) {
      console.log(`  Doc: ${inc.documentos?.numero_documento ?? '?'} | ${inc.descripcion?.slice(0, 70)}`);
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
