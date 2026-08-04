/**
 * Recalcula año_trimestre / num_trimestre según fecha_emision y trimestres bloqueados.
 *
 * Uso:
 *   npx tsx scripts/recalcular-trimestres.ts --empresa-id=123
 *   npx tsx scripts/recalcular-trimestres.ts --all
 *   npx tsx scripts/recalcular-trimestres.ts --empresa-id=123 --dry-run
 */
import { prisma } from '../src/lib/prisma';
import {
  resolverTrimestreContableImportacion,
  parseFechaLocal,
} from '../src/lib/trimestre-utils';

function parseArgs() {
  const args = process.argv.slice(2);
  let empresaId: number | null = null;
  let all = false;
  let dryRun = false;

  for (const arg of args) {
    if (arg === '--all') all = true;
    if (arg === '--dry-run') dryRun = true;
    const match = arg.match(/^--empresa-id=(\d+)$/);
    if (match) empresaId = Number(match[1]);
  }

  if (!all && empresaId === null) {
    console.error('❌ Indica --empresa-id=ID o --all');
    process.exit(1);
  }

  return { empresaId, all, dryRun };
}

async function main() {
  const { empresaId, all, dryRun } = parseArgs();

  const where: any = { trimestre_cerrado: false };
  if (!all && empresaId !== null) {
    where.id_de_empresa = BigInt(empresaId);
  }

  const docs = await prisma.documentos.findMany({
    where,
    select: {
      id: true,
      id_de_empresa: true,
      fecha_emision: true,
      año_trimestre: true,
      num_trimestre: true,
      numero_documento: true,
    },
    orderBy: { id: 'asc' },
  });

  console.log(`📋 Documentos a evaluar: ${docs.length}${dryRun ? ' (DRY RUN)' : ''}`);

  let updated = 0;
  let unchanged = 0;

  for (const doc of docs) {
    if (!doc.fecha_emision || !doc.id_de_empresa) {
      unchanged++;
      continue;
    }

    const trim = await resolverTrimestreContableImportacion(
      parseFechaLocal(doc.fecha_emision),
      Number(doc.id_de_empresa),
      null
    );

    const same =
      doc.año_trimestre === trim.año && doc.num_trimestre === trim.trimestre;

    if (same) {
      unchanged++;
      continue;
    }

    console.log(
      `  🔄 Doc #${doc.id} (${doc.numero_documento || 's/n'}): ` +
      `Q${doc.num_trimestre} ${doc.año_trimestre} → Q${trim.trimestre} ${trim.año}`
    );

    if (!dryRun) {
      await prisma.documentos.update({
        where: { id: doc.id },
        data: { año_trimestre: trim.año, num_trimestre: trim.trimestre },
      });
    }
    updated++;
  }

  console.log(`\n✅ Finalizado: ${updated} actualizados, ${unchanged} sin cambios`);
}

main()
  .catch((err) => {
    console.error('❌ Error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
