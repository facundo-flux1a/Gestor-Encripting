/**
 * Smoke: lee N archivos locales del corpus (ya bajados de MinIO) con Vertex
 * y muestra normalize + fiscal-guards. No escribe en MinIO ni en DB.
 *
 * Usage: npx tsx --env-file=.env scripts/smoke-extract.ts
 */
import 'dotenv/config';
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { VertexAI, Part } from '@google-cloud/vertexai';
import { PROMPT_EXTRACTOR_FACTURABLE } from '../src/services/ingestion/prompts_v2';
import {
  parseGeminiResponse,
  normalizeDocumentoFromGemini,
} from '../src/services/ingestion/normalize';
import { runFiscalGuards, formatGuardFailures } from '../src/services/ingestion/fiscal-guards';

const RAW = path.resolve('tests/fixtures/documents/raw');
const OUT = path.resolve('tests/fixtures/documents/eval-out');
mkdirSync(OUT, { recursive: true });

// CIF del lote más frecuente en el corpus (Espai) — alineado a empresa id=1 de testing
const EMPRESA_CIF = process.env.SMOKE_EMPRESA_CIF || 'B97376321';
const EMPRESA_NOMBRE = process.env.SMOKE_EMPRESA_NOMBRE || 'ESPAI DE DUES S.L.';

const PICK = [
  /Factura-5310678875/i,
  /Factura_5310788021/i,
  /Factura-5410752373/i,
  /Factura_5310763843/i,
  /pdf_digital_small__22652549/i,
];

function mimeFromName(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  return 'application/pdf';
}

function pickFiles(): string[] {
  const all = readdirSync(RAW);
  const chosen: string[] = [];
  for (const re of PICK) {
    const hit = all.find((f) => re.test(f) && !chosen.includes(f));
    if (hit) chosen.push(hit);
  }
  // fill up to 4 with small pdfs
  for (const f of all) {
    if (chosen.length >= 4) break;
    if (chosen.includes(f)) continue;
    if (/pdf_digital_small__.*\.pdf$/i.test(f)) chosen.push(f);
  }
  return chosen.slice(0, 4);
}

async function callVertex(prompt: string, buffer: Buffer, mimeType: string) {
  const projectId = process.env.VERTEX_AI_PROJECT_ID!;
  const location = process.env.VERTEX_AI_LOCATION || 'global';
  const modelName = process.env.VERTEX_AI_MODEL || 'gemini-2.5-flash';

  let rawCreds = process.env.VERTEX_AI_CREDENTIALS?.trim() || '';
  if (rawCreds && !rawCreds.startsWith('{')) {
    rawCreds = rawCreds.replace(/^['"]|['"]$/g, '').trim();
  }
  const credentials = rawCreds ? JSON.parse(rawCreds) : undefined;

  const vertexAI = new VertexAI({
    project: projectId,
    location,
    googleAuthOptions: credentials ? { credentials } : undefined,
    ...(location === 'global' ? { apiEndpoint: 'aiplatform.googleapis.com' } : {}),
  });

  const model = vertexAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      maxOutputTokens: 8192,
      temperature: 0.1,
      responseMimeType: 'application/json',
    },
  });

  const filePart: Part = {
    inlineData: { data: buffer.toString('base64'), mimeType },
  };
  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }, filePart] }],
  });
  const text = result.response.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  const finishReason = result.response.candidates?.[0]?.finishReason;
  const usage = (result.response as any).usageMetadata;
  return { text, finishReason, usage };
}

function summarize(doc: any) {
  const nested = doc.documento || {};
  return {
    tipo: doc.tipo_documento,
    numero: nested.numero_documento || doc.numero_documento,
    fecha: nested.fecha_emision || doc.fecha_emision,
    emisor: doc.empresa_emisora?.nombre,
    cif_emisor: doc.empresa_emisora?.cif,
    cliente: (doc.cliente || doc.empresa_receptora)?.nombre,
    cif_cliente: (doc.cliente || doc.empresa_receptora)?.cif,
    total: nested.importe_total ?? doc.importe_total,
    base: nested.importe_sin_iva ?? nested.importe_sin_impuestos ?? doc.importe_sin_impuestos,
    impuestos: (doc.totales_por_impuesto || doc.desglose_iva || []).map((i: any) => ({
      tipo: i.tipo_iva,
      pct: i.porcentaje ?? i.porcentaje_iva,
      base: i.base_imponible,
      cuota: i.cuota_iva,
    })),
    incidencia: doc.incidencia,
    desc_incidencia: (doc.descripcion_incidencia || '').toString().slice(0, 160),
  };
}

async function main() {
  const files = pickFiles();
  if (files.length === 0) {
    console.error('No hay archivos en', RAW);
    process.exit(1);
  }

  console.log('Archivos a probar:', files.length);
  const report: unknown[] = [];

  for (const file of files) {
    const full = path.join(RAW, file);
    const buf = readFileSync(full);
    const mime = mimeFromName(file);
    console.log('\n==========');
    console.log('FILE:', file, `(${Math.round(buf.length / 1024)} KB, ${mime})`);

    const prompt = PROMPT_EXTRACTOR_FACTURABLE
      .replace(/\{\{CIF_EMPRESA\}\}/g, EMPRESA_CIF)
      .replace(/\{\{NOMBRE_EMPRESA\}\}/g, EMPRESA_NOMBRE)
      .replace(/\{\{RECARGO_EMPRESA\}\}/g, 'false');

    try {
      const { text, finishReason, usage } = await callVertex(prompt, buf, mime);
      console.log('finishReason:', finishReason, '| tokens:', usage?.totalTokenCount ?? '?');

      const parsed = parseGeminiResponse(text);
      const normalized = normalizeDocumentoFromGemini(parsed as any);
      const summary = summarize(normalized);
      const guards = runFiscalGuards(normalized, { empresaCif: EMPRESA_CIF });

      console.log('EXTRACT:', JSON.stringify(summary, null, 2));
      console.log(
        'GUARDS:',
        guards.ok ? 'VALIDADO' : 'REVISION → ' + formatGuardFailures(guards.failures)
      );

      report.push({
        file,
        finishReason,
        tokens: usage?.totalTokenCount,
        summary,
        guards: { ok: guards.ok, failures: guards.failures },
        rawNormalized: normalized,
      });
    } catch (e: any) {
      console.error('ERROR:', e.message);
      report.push({ file, error: e.message });
    }

    // pacing anti-429
    await new Promise((r) => setTimeout(r, 8000));
  }

  const outPath = path.join(OUT, `smoke-${Date.now()}.json`);
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log('\nReport →', outPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
