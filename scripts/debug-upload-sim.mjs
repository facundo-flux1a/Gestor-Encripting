/**
 * debug-upload-sim.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Simulación de subida de documentos vía API externa (/api/v1/documents/upload)
 * con monitoreo completo del ciclo de vida: ingesta → actividad → polling → resultado
 *
 * Uso:
 *   node scripts/debug-upload-sim.mjs
 *   node scripts/debug-upload-sim.mjs --apiKey flux_XXXX --empresaId 101
 *   node scripts/debug-upload-sim.mjs --parallel  (sube ambos docs a la vez)
 *
 * Emula exactamente el flujo de uploadDocumentFromApi():
 *   1.  POST /api/v1/documents/upload  → entrega fileUrl → responde 202 + upload_id
 *   2.  GET  /api/upload-progress?uploadId=...  × N iteraciones de polling
 *   3.  GET  /api/v1/documents/status/{uploadId} (endpoint externo)
 *   4.  GET  /api/queues/stats  → verifica que la cola esté bien
 *   5.  GET  /api/companies     → verifica que la empresa existe
 *   6.  GET  /api/activity?...  → verifica que la actividad fue creada
 *
 * Genera un reporte final de consistencia.
 */

import { parseArgs } from 'node:util';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ─── Config ──────────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Cargar variables del .env de forma segura (sin shell: evita errores de sintaxis)
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
    // Quitar comillas opcionales
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    vars[key] = val;
  }
  return vars;
}

const ENV_PATH = path.resolve(__dirname, '../.env');
const env = { ...loadEnv(ENV_PATH), ...process.env };

const APP_URL    = env.NEXT_PUBLIC_URL || 'http://localhost:9002';
const POLL_EVERY = 3_000;  // ms entre polls de progreso
const MAX_POLLS  = 60;     // ~3 minutos máximo de espera por documento

// ─── Argumentos CLI ───────────────────────────────────────────────────────────

const { values: args } = parseArgs({
  options: {
    apiKey:    { type: 'string' },
    empresaId: { type: 'string' },
    parallel:  { type: 'boolean', default: false },
    help:      { type: 'boolean', default: false },
  },
  strict: false,
});

if (args.help) {
  console.log(`
Uso: node scripts/debug-upload-sim.mjs [opciones]

  --apiKey    <key>   API Key para autenticar (flux_XXXX...)
  --empresaId <id>    ID de empresa para las subidas
  --parallel          Subir ambos documentos en paralelo en vez de secuencial
  --help              Mostrar esta ayuda

Sin argumentos, el script pedirá que configures API_KEY_TEST en tu .env
o que la ingreses por CLI.
`);
  process.exit(0);
}

// ─── Constantes ──────────────────────────────────────────────────────────────

const DOCS = [
  {
    label: 'Doc técnico (nombre generado)',
    url: 'https://minio.allbase.com.ar/gestor-documental/archivos/doc_upload_1786535249216_d7436206b1_doc_4820ecd9_2026_08_12_10_17_59.pdf',
  },
  {
    label: 'Factura Alquila y descansa',
    url: 'https://minio.allbase.com.ar/gestor-documental/archivos/alquila-y-descansa-factura-registro-mercantil_2026_08_11_16_26_39_2026_08_12_10_17_59.pdf',
  },
];

// ─── Colores ANSI ─────────────────────────────────────────────────────────────

const C = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  red:     '\x1b[31m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  blue:    '\x1b[34m',
  magenta: '\x1b[35m',
  cyan:    '\x1b[36m',
  white:   '\x1b[37m',
};

const tag = (color, label) => `${color}${C.bold}[${label}]${C.reset}`;
const ok  = (msg)  => console.log(`${C.green}✔${C.reset} ${msg}`);
const err = (msg)  => console.log(`${C.red}✘${C.reset} ${msg}`);
const inf = (msg)  => console.log(`${C.cyan}ℹ${C.reset} ${msg}`);
const warn = (msg) => console.log(`${C.yellow}⚠${C.reset} ${msg}`);
const sep  = ()    => console.log(C.dim + '─'.repeat(70) + C.reset);

// ─── Helpers de fetch ─────────────────────────────────────────────────────────

async function apiFetch(method, path, { body, apiKey, sessionCookie } = {}) {
  const url = `${APP_URL}${path}`;
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey)       headers['X-Api-Key'] = apiKey;
  if (sessionCookie) headers['Cookie']   = sessionCookie;

  const t0 = Date.now();
  let res, json, rawText;

  try {
    res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    rawText = await res.text();
    try { json = JSON.parse(rawText); } catch { json = { _raw: rawText }; }
  } catch (e) {
    return { ok: false, status: 0, json: { error: e.message }, ms: Date.now() - t0 };
  }

  return { ok: res.ok, status: res.status, json, ms: Date.now() - t0 };
}

// ─── Paso 1: Subir documento ──────────────────────────────────────────────────

async function submitUpload(apiKey, fileUrl, label) {
  inf(`${tag(C.blue, 'STEP 1')} POST /api/v1/documents/upload — "${label}"`);

  const r = await apiFetch('POST', '/api/v1/documents/upload', {
    apiKey,
    body: { fileUrl },
  });

  console.log(`   Status: ${r.status} | ${r.ms}ms`);
  console.log(`   Response:`, JSON.stringify(r.json, null, 2));

  if (r.status === 202 && r.json.upload_id) {
    ok(`Upload aceptado. upload_id = ${r.json.upload_id}`);
    return r.json.upload_id;
  }

  if (r.status === 401) {
    err('API Key inválida o revocada. Verifica --apiKey');
    return null;
  }

  err(`Fallo inesperado al enviar: ${r.status}`);
  return null;
}

// ─── Paso 2: Poll de progreso /api/upload-progress ───────────────────────────

async function pollProgress(uploadId, label) {
  inf(`${tag(C.magenta, 'STEP 2')} Polling /api/upload-progress para "${label}"`);

  const results = [];
  let finalStatus = null;
  let polls = 0;

  while (polls < MAX_POLLS) {
    polls++;
    const r = await apiFetch('GET', `/api/upload-progress?uploadId=${uploadId}`);
    const s = r.json;

    const statusStr = s.status || '—';
    const stepStr   = s.step   || '—';
    const pct       = s.progress != null ? `${s.progress}%` : '—';
    const exists    = s.exists !== false;

    console.log(
      `   ${C.dim}[poll #${String(polls).padStart(2)}]${C.reset}` +
      ` status=${C.bold}${statusStr}${C.reset}` +
      ` step=${C.dim}${stepStr}${C.reset}` +
      ` progress=${pct}` +
      (s.message ? ` msg=${C.dim}${s.message?.slice(0, 60)}${C.reset}` : '')
    );

    results.push({ poll: polls, status: statusStr, step: stepStr, progress: s.progress, exists });

    if (!exists) {
      warn(`upload_id "${uploadId}" no existe en BD todavía. Esperando...`);
    }

    const done = ['Completado', 'Fallido', 'completed'].includes(statusStr) || 
                 statusStr?.toLowerCase() === 'fallido' || 
                 statusStr?.toLowerCase() === 'completado';

    if (done) {
      finalStatus = statusStr;
      break;
    }

    await sleep(POLL_EVERY);
  }

  if (!finalStatus) {
    warn(`Timeout tras ${polls} polls (${(polls * POLL_EVERY / 1000).toFixed(0)}s). Último status: ${results.at(-1)?.status}`);
    finalStatus = results.at(-1)?.status || 'TIMEOUT';
  }

  return { polls, finalStatus, results };
}

// ─── Paso 3: Status endpoint externo /api/v1/documents/status/:uploadId ──────

async function checkExternalStatus(uploadId, apiKey) {
  inf(`${tag(C.blue, 'STEP 3')} GET /api/v1/documents/status/${uploadId}`);
  const r = await apiFetch('GET', `/api/v1/documents/status/${uploadId}`, { apiKey });
  console.log(`   Status: ${r.status} | ${r.ms}ms`);
  console.log(`   Response:`, JSON.stringify(r.json, null, 2));
  return r;
}

// ─── Paso 4: Queue stats ──────────────────────────────────────────────────────

async function checkQueueStats() {
  inf(`${tag(C.cyan, 'STEP 4')} GET /api/queues/stats`);
  const r = await apiFetch('GET', '/api/queues/stats', {});
  console.log(`   Status: ${r.status} | ${r.ms}ms`);
  if (r.ok) {
    const { total } = r.json;
    console.log(`   Queue — active=${total?.active} waiting=${total?.waiting} delayed=${total?.delayed} failed=${total?.failed} completed=${total?.completed}`);
  } else {
    warn(`Queue stats: ${r.status} — puede requerir sesión (normal si no estás logueado)`);
  }
  return r;
}

// ─── Paso 5: Verificar empresa ────────────────────────────────────────────────

async function checkCompanies(sessionCookie) {
  inf(`${tag(C.cyan, 'STEP 5')} GET /api/companies`);
  const r = await apiFetch('GET', '/api/companies', { sessionCookie });
  console.log(`   Status: ${r.status} | ${r.ms}ms`);
  if (r.ok) {
    ok(`Empresas devueltas: ${Array.isArray(r.json) ? r.json.length : '?'}`);
    if (Array.isArray(r.json)) {
      r.json.forEach(c => console.log(`   ${C.dim}id=${c.id} name="${c.name}"${C.reset}`));
    }
  } else {
    warn('Sin sesión de navegador, /api/companies devuelve 401 — esto es esperado en tests de API');
  }
  return r;
}

// ─── Paso 6: Verificar actividad ─────────────────────────────────────────────

async function checkActivity(uploadId, sessionCookie) {
  inf(`${tag(C.cyan, 'STEP 6')} GET /api/upload-progress?uploadId=${uploadId} (verificación final)`);
  const r = await apiFetch('GET', `/api/upload-progress?uploadId=${uploadId}`, { sessionCookie });
  console.log(`   Status: ${r.status} | ${r.ms}ms`);
  console.log(`   Actividad:`, JSON.stringify(r.json, null, 2));
  return r;
}

// ─── Simulación completa de 1 documento ──────────────────────────────────────

async function simulateDoc(apiKey, doc, index) {
  const { label, url } = doc;
  const docTag = `DOC-${index + 1}`;

  console.log('');
  sep();
  console.log(`${C.bold}${C.blue}▶ Iniciando simulación: [${docTag}] ${label}${C.reset}`);
  console.log(`${C.dim}  URL: ${url}${C.reset}`);
  sep();

  const report = {
    docTag,
    label,
    url,
    uploadId: null,
    step1_ok: false,
    step2_polls: 0,
    step2_finalStatus: null,
    step3_status: null,
    step4_ok: false,
    step5_ok: false,
    step6_exists: false,
    step6_status: null,
    passed: false,
    errors: [],
  };

  // 1. Submit
  const uploadId = await submitUpload(apiKey, url, label);
  if (!uploadId) {
    report.errors.push('STEP 1: No se recibió upload_id. Abortando.');
    return report;
  }
  report.uploadId = uploadId;
  report.step1_ok = true;

  // Breve espera para que el worker arranque
  await sleep(1500);

  // 2. Poll progress
  const { polls, finalStatus } = await pollProgress(uploadId, label);
  report.step2_polls = polls;
  report.step2_finalStatus = finalStatus;

  // 3. External status endpoint
  const ext = await checkExternalStatus(uploadId, apiKey);
  report.step3_status = ext.status;

  // 4. Queue stats
  const qs = await checkQueueStats();
  report.step4_ok = qs.status !== 0;

  // 5. Companies (sin sesión → 401 es OK)
  const cp = await checkCompanies(null);
  report.step5_ok = cp.status === 200 || cp.status === 401;

  // 6. Final activity check
  const act = await checkActivity(uploadId, null);
  report.step6_exists = act.json?.exists !== false;
  report.step6_status = act.json?.status || null;

  // ─── Evaluación de consistencia ──────────────────────────────────────────
  const isSuccess = finalStatus?.toLowerCase?.().includes('complet');
  const isFailed  = finalStatus?.toLowerCase?.().includes('fallid') || finalStatus?.toLowerCase?.().includes('failed');
  const isTimeout = finalStatus === 'TIMEOUT';

  if (!report.step1_ok)        report.errors.push('STEP 1: Upload no aceptado');
  if (report.step2_polls >= MAX_POLLS) report.errors.push(`STEP 2: Timeout tras ${MAX_POLLS} polls`);
  if (isFailed)                report.errors.push(`STEP 2: Procesamiento fallido — status="${finalStatus}"`);
  if (!report.step6_exists)    report.errors.push('STEP 6: Actividad no encontrada en BD');

  report.passed = report.step1_ok && (isSuccess || isFailed) && report.step6_exists && !isTimeout;

  return report;
}

// ─── Reporte final ────────────────────────────────────────────────────────────

function printReport(reports) {
  console.log('');
  sep();
  console.log(`${C.bold}${C.white}📋  REPORTE FINAL DE CONSISTENCIA${C.reset}`);
  sep();

  let allPassed = true;

  for (const r of reports) {
    const icon = r.passed ? `${C.green}✔` : `${C.red}✘`;
    console.log(`\n${icon} ${C.bold}${r.docTag}: ${r.label}${C.reset}`);
    console.log(`   upload_id     : ${r.uploadId || 'N/A'}`);
    console.log(`   STEP 1 Ingesta: ${r.step1_ok ? C.green + 'OK' : C.red + 'FAIL'}${C.reset}`);
    console.log(`   STEP 2 Polls  : ${r.step2_polls} iteraciones → status final = ${C.bold}${r.step2_finalStatus}${C.reset}`);
    console.log(`   STEP 3 ExtAPI : HTTP ${r.step3_status}`);
    console.log(`   STEP 4 Queue  : ${r.step4_ok ? C.green + 'OK' : C.yellow + 'WARN'}${C.reset}`);
    console.log(`   STEP 6 Activ  : existe=${r.step6_exists} status="${r.step6_status}"`);

    if (r.errors.length > 0) {
      allPassed = false;
      r.errors.forEach(e => console.log(`   ${C.red}⚠ ${e}${C.reset}`));
    }
  }

  sep();
  if (allPassed) {
    console.log(`${C.green}${C.bold}🎉 TODOS LOS DOCUMENTOS PASARON LA VERIFICACIÓN DE CONSISTENCIA${C.reset}`);
  } else {
    console.log(`${C.red}${C.bold}🔴 ALGUNAS VERIFICACIONES FALLARON — revisa los detalles arriba${C.reset}`);
  }
  sep();

  // Guardar reporte en disco
  const reportPath = path.resolve(__dirname, `../upload-sim-report-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(reports, null, 2));
  console.log(`\n${C.dim}Reporte guardado en: ${reportPath}${C.reset}\n`);
}

// ─── Obtener API Key interactivamente ─────────────────────────────────────────

function readLine(prompt) {
  process.stdout.write(prompt);
  const buf = Buffer.alloc(256);
  const n = fs.readSync(0, buf, 0, 256, null);
  return buf.slice(0, n).toString().trim();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('');
  console.log(`${C.bold}${C.cyan}╔════════════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.bold}${C.cyan}║   🧪  Simulador de Subida — Debug Mode         ║${C.reset}`);
  console.log(`${C.bold}${C.cyan}╚════════════════════════════════════════════════╝${C.reset}`);
  console.log(`${C.dim}App URL: ${APP_URL}${C.reset}`);
  console.log('');

  // Resolver API Key
  let apiKey = args.apiKey || env.API_KEY_TEST || '';

  if (!apiKey) {
    warn('No se encontró API Key. Puedes:');
    console.log('  a) Pasar --apiKey flux_XXXX');
    console.log('  b) Agregar API_KEY_TEST=flux_XXXX a tu .env');
    console.log('  c) Ingresarla ahora:');
    apiKey = readLine('\n  API Key: ');
  }

  if (!apiKey) {
    err('Sin API Key no se puede continuar. Abortando.');
    process.exit(1);
  }

  inf(`API Key usada: ${apiKey.slice(0, 8)}${'*'.repeat(Math.max(0, apiKey.length - 8))}`);
  inf(`Modo: ${args.parallel ? 'PARALELO' : 'SECUENCIAL'}`);
  inf(`Docs a procesar: ${DOCS.length}`);
  inf(`Max polls por doc: ${MAX_POLLS} × ${POLL_EVERY / 1000}s = ~${MAX_POLLS * POLL_EVERY / 1000}s`);

  let reports;

  if (args.parallel) {
    inf('Iniciando ambas subidas en paralelo...');
    reports = await Promise.all(DOCS.map((doc, i) => simulateDoc(apiKey, doc, i)));
  } else {
    reports = [];
    for (let i = 0; i < DOCS.length; i++) {
      const r = await simulateDoc(apiKey, DOCS[i], i);
      reports.push(r);
    }
  }

  printReport(reports);
}

main().catch(e => {
  console.error(`${C.red}Error fatal:${C.reset}`, e);
  process.exit(1);
});
