/**
 * Eval offline de extracción / guards.
 *
 * Modo A (sin Vertex): valida fixtures JSON en tests/fixtures/documents/expected/
 * Modo B (opcional): si EVAL_CALL_VERTEX=1, extrae desde raw/ (consume cuota).
 *
 * No escribe ni borra nada en MinIO.
 */
import 'dotenv/config';
import { readdirSync, readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { runFiscalGuards } from '../src/services/ingestion/fiscal-guards';
import { normalizeDocumentoFromGemini, DocumentoGemini } from '../src/services/ingestion/normalize';

const expectedDir = path.resolve('tests/fixtures/documents/expected');
const outDir = path.resolve('tests/fixtures/documents/eval-out');
mkdirSync(expectedDir, { recursive: true });
mkdirSync(outDir, { recursive: true });

interface ExpectedFile {
  id: string;
  archetype?: string;
  empresaCif?: string;
  /** Resultado tipado que debería producir la extracción (manual) */
  expected: DocumentoGemini;
  /** Si true, esperamos que guards fallen (REVISION intencional) */
  expectRevision?: boolean;
}

function loadExpected(): ExpectedFile[] {
  if (!existsSync(expectedDir)) return [];
  return readdirSync(expectedDir)
    .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
    .map((f) => JSON.parse(readFileSync(path.join(expectedDir, f), 'utf8')) as ExpectedFile);
}

function fieldScore(expected: DocumentoGemini, actual: DocumentoGemini) {
  const expEmisor = (expected.empresa_emisora?.cif || '').toUpperCase().replace(/[\s\-./]/g, '');
  const actEmisor = (actual.empresa_emisora?.cif || '').toUpperCase().replace(/[\s\-./]/g, '');
  const expRec = ((expected.cliente || expected.empresa_receptora)?.cif || '')
    .toUpperCase()
    .replace(/[\s\-./]/g, '');
  const actRec = ((actual.cliente || actual.empresa_receptora)?.cif || '')
    .toUpperCase()
    .replace(/[\s\-./]/g, '');

  const checks: Record<string, boolean> = {
    cif_emisor: !expEmisor || expEmisor === actEmisor,
    cif_receptor: !expRec || expRec === actRec,
    tipo: !expected.tipo_documento ||
      String(actual.tipo_documento || '').toUpperCase().includes(
        String(expected.tipo_documento).toUpperCase().split(' ')[0]
      ),
  };

  const expDoc = (expected as any).documento || expected;
  const actDoc = (actual as any).documento || actual;
  if (expDoc.importe_total != null) {
    checks.importe_total =
      Math.abs(Number(expDoc.importe_total) - Number(actDoc.importe_total ?? actual.importe_total ?? 0)) <= 0.05;
  }

  return checks;
}

async function main() {
  const fixtures = loadExpected();
  if (fixtures.length === 0) {
    console.log(`No hay expected en ${expectedDir}`);
    console.log('Creá un JSON por caso (ver tests/fixtures/documents/expected/_template.json)');
    console.log('Corpus raw ya está en tests/fixtures/documents/raw/ (manifest.json).');
    process.exit(0);
  }

  const rows: unknown[] = [];
  let okGuards = 0;
  let fieldHits = 0;
  let fieldTotal = 0;

  for (const fix of fixtures) {
    const actual = normalizeDocumentoFromGemini(fix.expected);
    // En modo A evaluamos que el expected tipado pase/falle guards como se espera.
    // Cuando haya extracción real, reemplazar `actual` por output del modelo.
    const guard = runFiscalGuards(actual, { empresaCif: fix.empresaCif });
    const fields = fieldScore(fix.expected, actual);
    for (const v of Object.values(fields)) {
      fieldTotal++;
      if (v) fieldHits++;
    }
    if (fix.expectRevision ? !guard.ok : guard.ok) okGuards++;

    rows.push({
      id: fix.id,
      archetype: fix.archetype,
      guardOk: guard.ok,
      failures: guard.failures,
      fields,
      expectRevision: !!fix.expectRevision,
    });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    cases: fixtures.length,
    guardsPassRate: fixtures.length ? okGuards / fixtures.length : 0,
    fieldAccuracy: fieldTotal ? fieldHits / fieldTotal : 0,
    rows,
  };

  const outPath = path.join(outDir, `report-${Date.now()}.json`);
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log('Wrote', outPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
