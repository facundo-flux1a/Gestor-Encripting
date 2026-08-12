import fs from 'fs';
import path from 'path';

function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
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
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

loadEnv();

import { analyzeInvoiceDocument } from '../src/services/ingestion/azure-di';
import { callAzureOpenAiChat } from '../src/services/ingestion/azure-openai';
import { buildAzureDiContext } from '../src/services/ingestion/azure-di-map';
import { PROMPT_EXTRACTOR_FACTURABLE } from '../src/services/ingestion/prompts_v2';
import { parseLlmResponse, normalizeDocumento } from '../src/services/ingestion/normalize';

const TARGET_URL = 'https://minio.allbase.com.ar/gestor-documental/archivos/alquila-y-descansa-factura-mismo-cif-test_2026_08_12_17_15_04.pdf';
const FILE_NAME = 'alquila-y-descansa-factura-mismo-cif-test_2026_08_12_17_15_04.pdf';
const EMPRESA_CIF = 'B56214109';
const EMPRESA_NOMBRE = 'ALQUILA Y DESCANSA TAP S.L.';
const TOTAL_ITERATIONS = 15;

async function fetchPdfBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP Error ${res.status} descargando ${url}`);
  const arrayBuf = await res.arrayBuffer();
  return Buffer.from(arrayBuf);
}

async function extractWithRealAI(fileBuffer: Buffer) {
  // 1. Azure DI OCR
  const diResult = await analyzeInvoiceDocument(fileBuffer, 'application/pdf');
  const ocrText = diResult.content || '';
  const azureDiContextBlock = buildAzureDiContext(diResult);

  // 2. Build Prompt
  const prompt = PROMPT_EXTRACTOR_FACTURABLE
    .replace(/\{\{CIF_EMPRESA\}\}/g, EMPRESA_CIF)
    .replace(/\{\{NOMBRE_EMPRESA\}\}/g, EMPRESA_NOMBRE)
    .replace(/\{\{RECARGO_EMPRESA\}\}/g, 'false');

  const promptWithOcr = azureDiContextBlock
    ? `${prompt}\n\n[TEXTO OCR DEL DOCUMENTO (fuente principal - texto completo)]:\n${ocrText}\n\n${azureDiContextBlock}`
    : `${prompt}\n\n[TEXTO OCR DEL DOCUMENTO EXTRAÍDO POR AZURE DI]:\n${ocrText}`;

  // 3. Call LLM (Azure OpenAI)
  const llmRes = await callAzureOpenAiChat({
    prompt: promptWithOcr,
    json: true,
    maxCompletionTokens: 16384
  });

  const rawParsed = parseLlmResponse(llmRes.text);
  const normalized = normalizeDocumento(rawParsed, EMPRESA_CIF);
  return { normalized, tokens: llmRes.usage?.total_tokens || 0 };
}

async function main() {
  const outputLines: string[] = [];
  const log = (msg = '') => {
    console.log(msg);
    outputLines.push(msg);
  };

  log("=========================================================================");
  log("🤖 SIMULACIÓN DE CONSISTENCIA DE EXTRACCIÓN CON LLM (15 ITERACIONES EN MEMORIA)");
  log(`📄 Documento: ${FILE_NAME}`);
  log(`🔗 URL: ${TARGET_URL}`);
  log(`Fecha: ${new Date().toLocaleString('es-AR')}`);
  log("=========================================================================\n");

  log("⏬ Descargando PDF desde MinIO...");
  const pdfBuffer = await fetchPdfBuffer(TARGET_URL);
  log(`✔ PDF descargado (${(pdfBuffer.length / 1024).toFixed(1)} KB). Iniciando 15 ejecuciones sin persistencia en BD...\n`);

  const results: any[] = [];

  for (let i = 1; i <= TOTAL_ITERATIONS; i++) {
    const startTime = Date.now();
    log(`⏳ [Llamada ${i}/${TOTAL_ITERATIONS}] Ejecutando Azure DI + Azure OpenAI...`);

    try {
      const { normalized, tokens } = await extractWithRealAI(pdfBuffer);
      const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);

      const emisor = normalized.empresa_emisora || {};
      const receptor = normalized.cliente || {};
      const docFields = normalized.documento || {};

      const emisorCif = (emisor.cif || '').trim().toUpperCase();
      const receptorCif = (receptor.cif || '').trim().toUpperCase();
      const esMismoCif = !!(emisorCif && receptorCif && emisorCif === receptorCif);

      log(`   - Duración : ${elapsedSec}s | Tokens usados: ${tokens}`);
      log(`   - Tipo Doc : ${normalized.tipo_documento || 'N/A'}`);
      log(`   - N° Doc   : ${docFields.numero_documento || normalized.numero_documento || 'N/A'}`);
      log(`   - Importe  : ${docFields.importe_total ?? normalized.importe_total ?? 'N/A'} EUR`);
      log(`   - Emisor   : ${emisor.nombre || 'N/A'} (CIF: ${emisor.cif || 'N/A'})`);
      log(`   - Receptor : ${receptor.nombre || 'N/A'} (CIF: ${receptor.cif || 'N/A'})`);
      log(`   - Mismo CIF: ${esMismoCif ? '⚠️ SÍ (COINCIDEN)' : 'NO'}`);
      log(`   - Incidencia: ${normalized.incidencia ? `SÍ (${normalized.descripcion_incidencia})` : 'NO'}\n`);

      results.push({
        iter: i,
        tipo: normalized.tipo_documento,
        numero: docFields.numero_documento || normalized.numero_documento,
        importe: docFields.importe_total ?? normalized.importe_total,
        emisor: { nombre: emisor.nombre, cif: emisor.cif },
        receptor: { nombre: receptor.nombre, cif: receptor.cif },
        esMismoCif,
        incidencia: normalized.incidencia,
        descIncidencia: normalized.descripcion_incidencia
      });

    } catch (err: any) {
      log(`   ❌ Error en llamada ${i}: ${err.message}\n`);
      results.push({ iter: i, error: err.message });
    }
  }

  // --- REPORTE DE CONSISTENCIA ---
  log("=========================================================================");
  log(`📊 REPORTE FINAL DE CONSISTENCIA PARA FACTURA MISMO CIF (${results.filter(r => !r.error).length}/${TOTAL_ITERATIONS} ÉXITOS)`);
  log("=========================================================================\n");

  const validRuns = results.filter(r => !r.error);
  if (validRuns.length > 0) {
    const emisorMap: Record<string, number> = {};
    const receptorMap: Record<string, number> = {};
    const tipoMap: Record<string, number> = {};
    const numMap: Record<string, number> = {};
    const importeMap: Record<string, number> = {};
    let mismoCifCount = 0;

    validRuns.forEach(r => {
      const emKey = `[EMISOR] ${r.emisor.nombre || 'Vacío'} | CIF: ${r.emisor.cif || 'Vacío'}`;
      const recKey = `[RECEPTOR] ${r.receptor.nombre || 'Vacío'} | CIF: ${r.receptor.cif || 'Vacío'}`;
      const tKey = r.tipo || 'Vacío';
      const nKey = r.numero || 'Vacío';
      const iKey = String(r.importe ?? 'Vacío');

      emisorMap[emKey] = (emisorMap[emKey] || 0) + 1;
      receptorMap[recKey] = (receptorMap[recKey] || 0) + 1;
      tipoMap[tKey] = (tipoMap[tKey] || 0) + 1;
      numMap[nKey] = (numMap[nKey] || 0) + 1;
      importeMap[iKey] = (importeMap[iKey] || 0) + 1;

      if (r.esMismoCif) mismoCifCount++;
    });

    log(`👥 Entidades Emisoras Extraídas:`);
    Object.entries(emisorMap).forEach(([k, v]) => log(`   - ${k} → ${v}/${validRuns.length} veces (${((v / validRuns.length) * 100).toFixed(1)}%)`));

    log(`\n👥 Entidades Receptoras Extraídas:`);
    Object.entries(receptorMap).forEach(([k, v]) => log(`   - ${k} → ${v}/${validRuns.length} veces (${((v / validRuns.length) * 100).toFixed(1)}%)`));

    log(`\n⚖️ Coincidencia de CIF Emisor/Receptor:`);
    log(`   - ¿CIF de Emisor == CIF de Receptor?: ${mismoCifCount}/${validRuns.length} veces (${((mismoCifCount / validRuns.length) * 100).toFixed(1)}%)\n`);

    log(`📄 Tipo de Documento: ${JSON.stringify(tipoMap)}`);
    log(`📄 Número de Documento: ${JSON.stringify(numMap)}`);
    log(`💰 Importe Total: ${JSON.stringify(importeMap)}\n`);
  }

  const txtPath = path.resolve(process.cwd(), 'reporte_simulacion_mismo_cif_15x.txt');
  fs.writeFileSync(txtPath, outputLines.join('\n'), 'utf8');
  console.log(`✔ SIMULACIÓN COMPLETADA. Reporte guardado en: ${txtPath}\n`);
}

main().catch(err => {
  console.error("Fatal Error:", err);
  process.exit(1);
});
