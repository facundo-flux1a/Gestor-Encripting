import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Queue } from 'bullmq';
import Redis from 'ioredis';

function loadEnv(envPath) {
  if (!fs.existsSync(envPath)) return {};
  const content = fs.readFileSync(envPath, 'utf8');
  const vars = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    vars[key] = val;
  }
  return vars;
}

const env = { ...loadEnv(path.resolve(process.cwd(), '.env')), ...process.env };
const dbUrl = env.DATABASE_URL;
const redisUrl = env.REDIS_URL || 'redis://localhost:6379';

if (!dbUrl) {
  console.error('DATABASE_URL no encontrada en .env');
  process.exit(1);
}

const redisConnection = new Redis(redisUrl, { maxRetriesPerRequest: null });
const queuePrefix = env.NODE_ENV === 'production' ? '{prod}' : '{dev}';
const INGESTION_QUEUE_NAME = `${queuePrefix}-ingestion`;
const ingestionQueue = new Queue(INGESTION_QUEUE_NAME, { connection: redisConnection });

const TARGET_DOCS = [
  {
    name: 'Doc Técnico (upload_1786535249216)',
    url: 'https://minio.allbase.com.ar/gestor-documental/archivos/doc_upload_1786535249216_d7436206b1_doc_4820ecd9_2026_08_12_10_17_59.pdf',
    filename: 'doc_upload_1786535249216_d7436206b1_doc_4820ecd9_2026_08_12_10_17_59.pdf'
  },
  {
    name: 'Factura Alquila y Descansa',
    url: 'https://minio.allbase.com.ar/gestor-documental/archivos/alquila-y-descansa-factura-registro-mercantil_2026_08_11_16_26_39_2026_08_12_10_17_59.pdf',
    filename: 'alquila-y-descansa-factura-registro-mercantil_2026_08_11_16_26_39_2026_08_12_10_17_59.pdf'
  }
];

const ITERATIONS = 15;
const POLL_INTERVAL = 3000;
const MAX_WAIT_TIME = 90000; // 90 seg por doc

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  const db = await mysql.createConnection(dbUrl);
  const report = [];

  const log = (msg = '') => {
    console.log(msg);
    report.push(msg);
  };

  log('=========================================================================');
  log('   🧪 SCRIPT DE SIMULACIÓN DE SUBIDAS Y CONTROL DE CONSISTENCIA (15x)');
  log(`   Fecha: ${new Date().toLocaleString('es-AR')}`);
  log('=========================================================================\n');

  // Obtener empresa objetivo (ej. id 64 o primera disponible)
  const [empRows] = await db.query('SELECT id, CIF, nombre_de_empresa FROM empresas WHERE id = 64 OR id = 120 LIMIT 1');
  const targetEmpresa = empRows[0] || { id: 64, CIF: 'B22859755', nombre_de_empresa: 'Empresa Test' };

  log(`🏢 Empresa de Prueba: ID ${targetEmpresa.id} | CIF: ${targetEmpresa.CIF}`);
  log(`📋 Documentos a probar: ${TARGET_DOCS.length}`);
  log(`🔄 Iteraciones por documento: ${ITERATIONS}\n`);

  for (let dIdx = 0; dIdx < TARGET_DOCS.length; dIdx++) {
    const docInfo = TARGET_DOCS[dIdx];
    log(`=========================================================================`);
    log(`▶ INICIANDO SIMULACIÓN 15x PARA DOCUMENTO #${dIdx + 1}: ${docInfo.name}`);
    log(`URL: ${docInfo.url}`);
    log(`-------------------------------------------------------------------------`);

    const iterationResults = [];

    for (let iter = 1; iter <= ITERATIONS; iter++) {
      const uploadId = `sim_test_${dIdx + 1}_iter_${iter}_${Date.now()}`;
      // Salt hash to bypass unique_hash_empresa constraint for duplicate simulation testing
      const fakeHash = crypto.createHash('sha256').update(`${docInfo.url}_iter_${iter}_${Date.now()}`).digest('hex');

      log(`\n⏳ Iteración ${iter}/${ITERATIONS} (UploadId: ${uploadId})...`);

      // 1. Insert initial actividad record
      await db.query(`
        INSERT INTO actividad (upload_id, id_de_empresa, documento_nombre, documento_tipo, status, step, progress, mensaje)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [uploadId, targetEmpresa.id, docInfo.filename, 'pdf', 'iniciando', 'Iniciando simulación', 0, 'Preparando encolado']);

      // 2. Enqueue Ingestion Job
      const jobData = {
        text: `archivos/${docInfo.filename}`,
        empresaId: String(targetEmpresa.id),
        cif: targetEmpresa.CIF || '',
        nombreEmpresa: targetEmpresa.nombre_de_empresa || '',
        recargo: false,
        fileHash: fakeHash,
        uploadId: uploadId,
        parentUploadId: uploadId,
        fileName: docInfo.filename,
        originalFileName: docInfo.filename,
        fileSize: 1024,
        publicUrl: docInfo.url,
        isCompressedFile: false,
        mimeType: 'application/pdf',
        normalizedFileType: 'pdf',
        fileExtension: 'pdf',
        fechaSubida: new Date().toISOString(),
        origen: 'dashboard'
      };

      await ingestionQueue.add(`ingest-${uploadId}`, jobData, { jobId: `ingest-${uploadId}` });

      // 3. Poll for completion
      const startTime = Date.now();
      let completedStatus = null;
      let finalDocId = null;

      while (Date.now() - startTime < MAX_WAIT_TIME) {
        await sleep(POLL_INTERVAL);
        const [actRows] = await db.query('SELECT status, step, progress, mensaje, documento_id FROM actividad WHERE upload_id = ? LIMIT 1', [uploadId]);
        const act = actRows[0];

        if (act) {
          if (act.status === 'Completado' || act.status === 'Fallido') {
            completedStatus = act.status;
            finalDocId = act.documento_id;
            log(`   ↳ Resultado: [${act.status}] ${act.mensaje || ''} (DocID: ${finalDocId || 'N/A'}) en ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
            break;
          }
        }
      }

      if (!completedStatus) {
        log(`   ❌ TIMEOUT tras ${MAX_WAIT_TIME / 1000}s`);
        iterationResults.push({ iter, status: 'TIMEOUT', docId: null, entities: [], docData: null });
        continue;
      }

      // 4. Fetch details from database if doc was created
      let entities = [];
      let docData = null;

      if (finalDocId) {
        const [dRows] = await db.query(`
          SELECT id, numero_documento, tipo_documento, importe_total, fecha_emision
          FROM documentos WHERE id = ? LIMIT 1
        `, [finalDocId]);
        docData = dRows[0] || null;

        const [eRows] = await db.query(`
          SELECT id, rol, nombre, identificador_fiscal
          FROM entidades_documento WHERE documento_id = ?
        `, [finalDocId]);
        entities = eRows;
      }

      iterationResults.push({
        iter,
        uploadId,
        status: completedStatus,
        docId: finalDocId,
        docData,
        entities
      });
    }

    // --- ANALIZAR CONSISTENCIA DEL DOCUMENTO ---
    log(`\n-------------------------------------------------------------------------`);
    log(`📊 REPORTE DE CONSISTENCIA PARA: ${docInfo.name}`);
    log(`-------------------------------------------------------------------------`);

    const successfulRuns = iterationResults.filter(r => r.status === 'Completado');
    log(`✔ Iteraciones completadas exitosamente: ${successfulRuns.length} / ${ITERATIONS}`);

    if (successfulRuns.length > 0) {
      // Comparar Entidades Extraídas
      log(`\n👥 ENTIDADES EXTRAÍDAS EN LAS ${successfulRuns.length} ITERACIONES:`);

      const entitySummary = {};
      const duplicateEntityIssues = [];

      successfulRuns.forEach(r => {
        const rolesInRun = new Set();
        r.entities.forEach(ent => {
          const key = `[Rol: ${ent.rol || 'N/A'}] ${ent.nombre || 'Sin nombre'} (${ent.identificador_fiscal || 'Sin CIF'})`;
          entitySummary[key] = (entitySummary[key] || 0) + 1;

          if (rolesInRun.has(ent.rol)) {
            duplicateEntityIssues.push(`Iteración ${r.iter} (DocID ${r.docId}): Múltiples entidades con rol '${ent.rol}'`);
          }
          rolesInRun.add(ent.rol);
        });
      });

      Object.entries(entitySummary).forEach(([entKey, count]) => {
        const pct = ((count / successfulRuns.length) * 100).toFixed(1);
        log(`   - ${entKey} → Apareció en ${count}/${successfulRuns.length} iteraciones (${pct}%)`);
      });

      if (duplicateEntityIssues.length === 0) {
        log(`\n   ✔ [OK ENTIDADES] 0 entidades duplicadas dentro de la misma factura en las ${successfulRuns.length} iteraciones.`);
      } else {
        log(`\n   ⚠️ [ALERTA ENTIDADES] Se detectaron entidades duplicadas por rol dentro del mismo documento:`);
        duplicateEntityIssues.forEach(issue => log(`      - ${issue}`));
      }

      // Comparar Datos Principales del Documento
      log(`\n📄 DATOS DEL DOCUMENTO (N° Documento, Importe, Tipo):`);
      const numDocs = {};
      const importes = {};
      const tipos = {};

      successfulRuns.forEach(r => {
        if (r.docData) {
          const num = r.docData.numero_documento || 'SIN NUMERO';
          const imp = r.docData.importe_total ?? 'N/A';
          const tipo = r.docData.tipo_documento || 'N/A';

          numDocs[num] = (numDocs[num] || 0) + 1;
          importes[imp] = (importes[imp] || 0) + 1;
          tipos[tipo] = (tipos[tipo] || 0) + 1;
        }
      });

      log(`   - Números de documento extraídos: ${JSON.stringify(numDocs)}`);
      log(`   - Importes totales extraídos: ${JSON.stringify(importes)}`);
      log(`   - Tipos de documento extraídos: ${JSON.stringify(tipos)}`);

      // Tasa general de consistencia
      const topEntityCount = Math.max(...Object.values(entitySummary), 0);
      const consistencyPct = ((topEntityCount / successfulRuns.length) * 100).toFixed(1);
      log(`\n📈 TASA DE CONSISTENCIA GENERAL DE ENTIDADES: ${consistencyPct}%`);
    }
  }

  log('\n=========================================================================');
  log('🏁 RESUMEN FINAL Y CONCLUSIÓN');
  log('=========================================================================\n');

  await db.end();
  await redisConnection.quit();

  const outputPath = path.resolve(process.cwd(), 'reporte_simulacion_subidas.txt');
  fs.writeFileSync(outputPath, report.join('\n'), 'utf8');
  console.log(`\nReporte completo guardado en: ${outputPath}\n`);
}

run().catch(err => {
  console.error('Fatal error in simulation script:', err);
  process.exit(1);
});
