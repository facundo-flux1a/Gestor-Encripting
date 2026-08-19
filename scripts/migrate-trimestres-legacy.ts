/**
 * migrate-trimestres-legacy.ts
 *
 * Corrige los registros de `documentos` que quedaron con año_trimestre / num_trimestre
 * incorrectos debido a la lógica vieja (pre-10/08/2026) que mezclaba la "mercy window"
 * con el trimestre natural de la fecha de emisión.
 *
 * Lógica:
 *   - Solo procesa documentos con fecha_creacion <= 2026-08-10 (antes del cambio de lógica).
 *   - No toca documentos con trimestre_cerrado = true.
 *   - Usa fecha_creacion como "now" para simular qué debería haber decidido el sistema.
 *   - Llama a resolverTrimestreContableImportacion() con ese "now" simulado.
 *   - Compara resultado con año_trimestre / num_trimestre actuales.
 *   - Si difieren → actualiza (en modo --apply) o loguea el cambio (en modo dry-run por defecto).
 *   - Genera un log completo en scripts/migrate-trimestres-legacy-result.log
 *
 * Uso:
 *   # Dry run para todas las empresas:
 *   npx tsx --env-file=.env scripts/migrate-trimestres-legacy.ts
 *
 *   # Dry run para empresas específicas (separadas por coma):
 *   npx tsx --env-file=.env scripts/migrate-trimestres-legacy.ts --empresa-ids=11,101,102,112,120
 *
 *   # Aplicar cambios reales:
 *   npx tsx --env-file=.env scripts/migrate-trimestres-legacy.ts --apply
 *   npx tsx --env-file=.env scripts/migrate-trimestres-legacy.ts --empresa-ids=11,101 --apply
 */

import * as fs from 'fs';
import * as path from 'path';
import { prisma } from '../src/lib/prisma';
import {
  resolverTrimestreContableImportacion,
  parseFechaLocal,
} from '../src/lib/trimestre-utils';

// ─── Configuración ────────────────────────────────────────────────────────────

/** Fecha de corte: solo se procesan documentos subidos ANTES de este momento */
const FECHA_CORTE = new Date('2026-08-10T23:59:59.000Z');

/** Ruta del archivo de log de resultados */
const LOG_PATH = path.join(__dirname, 'migrate-trimestres-legacy-result.log');

/** Tamaño del batch de procesamiento (evita traer todo en memoria) */
const BATCH_SIZE = 500;

// ─── Args ─────────────────────────────────────────────────────────────────────

function parseArgs(): { apply: boolean; empresaIds: number[] | null } {
  const args = process.argv.slice(2);
  let apply = false;
  let empresaIds: number[] | null = null;

  for (const arg of args) {
    if (arg === '--apply') apply = true;
    // --empresa-ids=11,101,102,112,120  (lista separada por comas)
    const matchMultiple = arg.match(/^--empresa-ids=([\d,]+)$/);
    if (matchMultiple) {
      empresaIds = matchMultiple[1].split(',').map(Number);
    }
    // --empresa-id=11  (retrocompatibilidad con un solo ID)
    const matchSingle = arg.match(/^--empresa-id=(\d+)$/);
    if (matchSingle) empresaIds = [Number(matchSingle[1])];
  }

  return { apply, empresaIds };
}

// ─── Logging ──────────────────────────────────────────────────────────────────

const logLines: string[] = [];

function log(line: string) {
  console.log(line);
  logLines.push(line);
}

function flushLog() {
  const content = logLines.join('\n') + '\n';
  fs.writeFileSync(LOG_PATH, content, 'utf-8');
  console.log(`\n📄 Log guardado en: ${LOG_PATH}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const { apply, empresaIds } = parseArgs();

  const modeLabel = apply ? '🔴 APPLY (escritura real)' : '🟡 DRY RUN (sin cambios)';
  const fechaCorteLabel = FECHA_CORTE.toISOString().split('T')[0];
  const empresaLabel = empresaIds !== null ? empresaIds.map(id => `#${id}`).join(', ') : 'TODAS';

  log('═══════════════════════════════════════════════════════════');
  log(`  migrate-trimestres-legacy.ts`);
  log(`  Modo       : ${modeLabel}`);
  log(`  Fecha corte: documentos con fecha_creacion <= ${fechaCorteLabel}`);
  log(`  Empresas   : ${empresaLabel}`);
  log(`  Ejecutado  : ${new Date().toISOString()}`);
  log('═══════════════════════════════════════════════════════════');
  log('');

  // ── Configuración del where ────────────────────────────────────────────────
  const whereClause: any = {
    trimestre_cerrado: false,
    fecha_creacion: { lte: FECHA_CORTE },
  };
  if (empresaIds !== null) {
    whereClause.id_de_empresa = { in: empresaIds.map(id => BigInt(id)) };
  }

  // ── Conteo total (solo para info, sin traer datos) ─────────────────────────
  const totalCount = await prisma.documentos.count({ where: whereClause });
  log(`📋 Total documentos candidatos: ${totalCount} (procesando en batches de ${BATCH_SIZE})`);
  log('');
  log('─── Detalle por documento ───────────────────────────────────');
  log('');

  // ── Contadores ─────────────────────────────────────────────────────────────
  let countCorrecto = 0;
  let countCambiado = 0;
  let countSkipped = 0;
  let totalProcesados = 0;

  // ── Procesamiento paginado (cursor-based) ──────────────────────────────────
  // Trae BATCH_SIZE documentos por vez para no saturar la memoria.
  // Es seguro re-correr si se interrumpe: los docs ya corregidos quedan como OK.
  let cursorId: bigint | undefined = undefined;

  while (true) {
    const batch = await prisma.documentos.findMany({
      where: whereClause,
      select: {
        id: true,
        id_de_empresa: true,
        fecha_emision: true,
        fecha_creacion: true,
        año_trimestre: true,
        num_trimestre: true,
        numero_documento: true,
      },
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
      ...(cursorId !== undefined ? { cursor: { id: cursorId }, skip: 1 } : {}),
    });

    if (batch.length === 0) break;

    cursorId = batch[batch.length - 1].id;
    totalProcesados += batch.length;

    log(`  [Batch] Procesando docs #${batch[0].id} → #${cursorId} (${totalProcesados}/${totalCount})`);

  for (const doc of batch) {
    const docLabel = `Doc #${String(doc.id).padEnd(8)} (nro: ${(doc.numero_documento ?? 's/n').padEnd(20)}) empresa: ${doc.id_de_empresa}`;

    // Skip: sin fecha_emision
    if (!doc.fecha_emision) {
      countSkipped++;
      log(`  ⏭️  SKIP    | ${docLabel} | Sin fecha_emision`);
      continue;
    }

    // Skip: sin fecha_creacion (no debería pasar pero por seguridad)
    if (!doc.fecha_creacion) {
      countSkipped++;
      log(`  ⏭️  SKIP    | ${docLabel} | Sin fecha_creacion`);
      continue;
    }

    // Usar fecha_creacion como "now" simulado
    const nowSimulado = new Date(doc.fecha_creacion);

    const trim = await resolverTrimestreContableImportacion(
      parseFechaLocal(doc.fecha_emision),
      doc.id_de_empresa !== null ? Number(doc.id_de_empresa) : null,
      null,        // userId: null → evalúa estado de cierre por empresa (correcto para migración)
      nowSimulado  // ← clave: simula el momento de la subida original
    );

    const sinCambio =
      doc.año_trimestre === trim.año && doc.num_trimestre === trim.trimestre;

    const emisionLabel = doc.fecha_emision instanceof Date
      ? doc.fecha_emision.toISOString().split('T')[0]
      : String(doc.fecha_emision).split('T')[0];

    const creacionLabel = nowSimulado.toISOString().split('T')[0];

    const oldLabel = `${doc.año_trimestre ?? '?'}Q${doc.num_trimestre ?? '?'}`;
    const newLabel = `${trim.año}Q${trim.trimestre}`;

    if (sinCambio) {
      countCorrecto++;
      log(`  ✅ OK      | ${docLabel} | emision: ${emisionLabel} | subida: ${creacionLabel} | trimestre: ${oldLabel} ✓`);
    } else {
      countCambiado++;
      log(`  🔄 CAMBIO  | ${docLabel} | emision: ${emisionLabel} | subida: ${creacionLabel} | ${oldLabel} → ${newLabel}`);

      if (apply) {
        await prisma.documentos.update({
          where: { id: doc.id },
          data: {
            año_trimestre: trim.año,
            num_trimestre: trim.trimestre,
          },
        });
      }
    }
  }

  } // fin while batches

  // ── Resumen final ──────────────────────────────────────────────────────────
  log('');
  log('─── Resumen ─────────────────────────────────────────────────');
  log(`  Total evaluados : ${totalProcesados}`);
  log(`  ✅ Ya correctos  : ${countCorrecto}`);
  log(`  🔄 ${apply ? 'Actualizados' : 'A actualizar'} : ${countCambiado}`);
  log(`  ⏭️  Skipeados    : ${countSkipped}`);
  log('');
  if (!apply && countCambiado > 0) {
    log(`  ⚠️  Modo DRY RUN: no se realizó ningún cambio.`);
    log(`  Para aplicar, ejecutá con --apply`);
  } else if (apply) {
    log(`  ✅ Cambios aplicados a la base de datos.`);
  } else {
    log(`  ✅ Todo está en orden, no hay nada que corregir.`);
  }
  log('═══════════════════════════════════════════════════════════');

  flushLog();
}

main()
  .catch((err) => {
    console.error('❌ Error fatal:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
