import fs from 'fs';
import path from 'path';

// Cargar variables de entorno desde .env si no están presentes
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

const TARGET_DOCS = [
  {
    docNumber: 1,
    name: 'Doc Tecnico PDF',
    url: 'https://minio.allbase.com.ar/gestor-documental/archivos/doc_upload_1786535249216_d7436206b1_doc_4820ecd9_2026_08_12_10_17_59.pdf'
  },
  {
    docNumber: 2,
    name: 'Alquila y Descansa Factura RM PDF',
    url: 'https://minio.allbase.com.ar/gestor-documental/archivos/alquila-y-descansa-factura-registro-mercantil_2026_08_11_16_26_39_2026_08_12_10_17_59.pdf'
  }
];

const EMPRESA_CIF = 'B56214109';
const EMPRESA_NOMBRE = 'ALQUILA Y DESCANSA TAP S.L.';
const ITERATIONS_PER_DOC = 15;

async function fetchPdfBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP Error ${res.status} descargando ${url}`);
  const arrayBuf = await res.arrayBuffer();
  return Buffer.from(arrayBuf);
}

async function extractWithRealAI(fileBuffer: Buffer, fileName: string) {
  // 1. Azure DI OCR
  const diResult = await analyzeInvoiceDocument(fileBuffer, 'application/pdf');
  const ocrText = diResult.content || '';
  const azureDiContextBlock = buildAzureDiContext(diResult);

  // 2. Build Prompt
  let prompt = PROMPT_EXTRACTOR_FACTURABLE
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
  const normalized = normalizeDocumento(rawParsed);
  return { normalized, rawText: llmRes.text, tokens: llmRes.usage?.total_tokens || 0 };
}

async function main() {
  const outputLines: string[] = [];
  const log = (msg = '') => {
    console.log(msg);
    outputLines.push(msg);
  };

  log("=========================================================================");
  log("   🤖 SIMULACIÓN REAL CON LLM Y AZURE DI (30 LLAMADAS EN TOTAL)");
  log(`   Fecha: ${new Date().toLocaleString('es-AR')}`);
  log("=========================================================================\n");

  log(`🔧 Azure DI Endpoint: ${process.env.AZURE_DI_ENDPOINT}`);
  log(`🔧 Azure OpenAI Deployment: ${process.env.AZURE_OPENAI_DEPLOYMENT}\n`);

  for (let d = 0; d < TARGET_DOCS.length; d++) {
    const docInfo = TARGET_DOCS[d];
    log("=========================================================================");
    log(`📄 PROCESANDO DOCUMENTO #${docInfo.docNumber}: ${docInfo.name}`);
    log(`URL: ${docInfo.url}`);
    log("-------------------------------------------------------------------------");

    log("⏬ Descargando PDF desde MinIO...");
    const pdfBuffer = await fetchPdfBuffer(docInfo.url);
    log(`✔ PDF descargado (${(pdfBuffer.length / 1024).toFixed(1)} KB). Iniciando 15 iteraciones reales con LLM...\n`);

    const docResults: any[] = [];

    for (let i = 1; i <= ITERATIONS_PER_DOC; i++) {
      const startTime = Date.now();
      log(`⏳ [Doc #${docInfo.docNumber} | Llamada ${i}/${ITERATIONS_PER_DOC}] Ejecutando Azure DI + Azure OpenAI...`);

      try {
        const { normalized, tokens } = await extractWithRealAI(pdfBuffer, docInfo.name);
        const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);

        const emisor = normalized.empresa_emisora || {};
        const receptor = normalized.cliente || {};
        const docFields = normalized.documento || {};

        log(`   - Duración : ${elapsedSec}s | Tokens usados: ${tokens}`);
        log(`   - Tipo Doc : ${normalized.tipo_documento || 'N/A'}`);
        log(`   - N° Doc   : ${docFields.numero_documento || normalized.numero_documento || 'N/A'}`);
        log(`   - Importe  : ${docFields.importe_total ?? normalized.importe_total ?? 'N/A'} EUR`);
        log(`   - Emisor   : ${emisor.nombre || 'N/A'} (CIF: ${emisor.cif || 'N/A'})`);
        log(`   - Receptor : ${receptor.nombre || 'N/A'} (CIF: ${receptor.cif || 'N/A'})`);
        log(`   - Incidencia: ${normalized.incidencia ? `SÍ (${normalized.descripcion_incidencia})` : 'NO'}\n`);

        docResults.push({
          iter: i,
          tipo: normalized.tipo_documento,
          numero: docFields.numero_documento || normalized.numero_documento,
          importe: docFields.importe_total ?? normalized.importe_total,
          emisor: { nombre: emisor.nombre, cif: emisor.cif },
          receptor: { nombre: receptor.nombre, cif: receptor.cif },
          incidencia: normalized.incidencia,
          descIncidencia: normalized.descripcion_incidencia
        });

      } catch (err: any) {
        log(`   ❌ Error en llamada ${i}: ${err.message}\n`);
        docResults.push({ iter: i, error: err.message });
      }
    }

    // --- REPORTE DE CONSISTENCIA ---
    log(`-------------------------------------------------------------------------`);
    log(`📊 REPORTE DE CONSISTENCIA PARA DOCUMENTO #${docInfo.docNumber} (${docResults.filter(r => !r.error).length}/15 ÉXITOS)`);
    log(`-------------------------------------------------------------------------`);

    const validRuns = docResults.filter(r => !r.error);
    if (validRuns.length > 0) {
      const emisorMap: Record<string, number> = {};
      const receptorMap: Record<string, number> = {};
      const tipoMap: Record<string, number> = {};
      const numMap: Record<string, number> = {};
      const importeMap: Record<string, number> = {};

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
      });

      log(`👥 Entidades Emisoras Extraídas:`);
      Object.entries(emisorMap).forEach(([k, v]) => log(`   - ${k} → ${v}/${validRuns.length} veces (${((v / validRuns.length) * 100).toFixed(1)}%)`));

      log(`👥 Entidades Receptoras Extraídas:`);
      Object.entries(receptorMap).forEach(([k, v]) => log(`   - ${k} → ${v}/${validRuns.length} veces (${((v / validRuns.length) * 100).toFixed(1)}%)`));

      log(`📄 Tipo de Documento: ${JSON.stringify(tipoMap)}`);
      log(`📄 Número de Documento: ${JSON.stringify(numMap)}`);
      log(`💰 Importe Total: ${JSON.stringify(importeMap)}\n`);
    }
  }

  log("=========================================================================");
  log("🏁 RESUMEN FINAL DE LAS 30 LLAMADAS AL LLM");
  log("=========================================================================\n");

  const txtPath = path.resolve(process.cwd(), 'reporte_simulacion_llm_30x.txt');
  fs.writeFileSync(txtPath, outputLines.join('\n'), 'utf8');
  console.log(`\n✔ SIMULACIÓN REAL COMPLETADA. Reporte completo guardado en: ${txtPath}\n`);
}

main().catch(err => {
  console.error("Fatal Error:", err);
  process.exit(1);
});
