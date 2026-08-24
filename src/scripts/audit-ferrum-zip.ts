/** Auditoría determinista del corpus Ferrum contra la ingesta aislada. */
import { execFileSync } from 'node:child_process';
import { prisma } from '@/lib/prisma';

const ZIP = process.env.AUDIT_ZIP || '/home/kornegor/Descargas/facturas_test_ferrum.zip';
const ROOT = process.env.AUDIT_ROOT || 'cerp_ferrum_zip_20260824_v1';

type Direction = 'RECIBIDA' | 'EMITIDA';
type SourceInvoice = {
  name: string;
  number: string;
  date: string;
  sourceDate: string;
  isValidDate: boolean;
  base: number;
  total: number;
  direction: Direction;
  isCredit: boolean;
};

function money(raw: string | undefined): number | null {
  if (!raw) return null;
  const value = Number(raw.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}

function toIsoDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const [day, month, year] = raw.split('/');
  return day && month && year ? `${year}-${month}-${day}` : null;
}

function isValidCalendarDate(raw: string): boolean {
  const [day, month, year] = raw.split('/').map(Number);
  const value = new Date(Date.UTC(year, month - 1, day));
  return (
    value.getUTCFullYear() === year &&
    value.getUTCMonth() === month - 1 &&
    value.getUTCDate() === day
  );
}

function countBy(values: string[]) {
  return values.reduce<Record<string, number>>((counts, value) => {
    counts[value] = (counts[value] || 0) + 1;
    return counts;
  }, {});
}

function parseSource(): SourceInvoice[] {
  const files = execFileSync('unzip', ['-Z1', ZIP], { encoding: 'utf8' })
    .split('\n')
    .map((file) => file.trim())
    .filter((file) => file.toLowerCase().endsWith('.pdf'));

  return files.map((file) => {
    const pdf = execFileSync('unzip', ['-p', ZIP, file]);
    const text = execFileSync('pdftotext', ['-', '-'], { input: pdf, encoding: 'utf8' });
    // Los PDFs de prueba alternan entre una cabecera en una columna y otra
    // tabulada. Se lee el identificador con su forma fiscal, no la etiqueta
    // colindante "FECHA" que se intercala en la extracción de texto.
    const header = text.match(/N[º°]\s*FACTURA([\s\S]{0,120}?)(?:FACTURAR A|Descripción)/i)?.[1] || '';
    const number = header.match(/\b(?:\d{4}\/\d+|[A-Z]{1,4}-?\d+(?:\/\d+)?)\b/i)?.[0];
    const sourceDate = header.match(/(\d{2}\/\d{2}\/\d{4})/)?.[1];
    const date = toIsoDate(sourceDate);
    const base = money(text.match(/Base imponible total\s+(-?[\d.]+,\d{2})\s*€/i)?.[1]);
    const amounts = [...text.matchAll(/(-?[\d.]+,\d{2})\s*€/g)]
      .map((match) => money(match[1]))
      .filter((amount): amount is number => amount !== null);
    const total = amounts.at(-1);
    const direction: Direction = file.startsWith('emitidas/') ? 'EMITIDA' : 'RECIBIDA';
    // Una rectificativa con importes positivos es una factura de incremento,
    // no un abono. Las notas de abono/crédito, incluso con valores fuente
    // positivos, sí deben normalizarse a negativo.
    const isCredit = (total ?? 0) < 0 || /NOTA DE (?:ABONO|CR[ÉE]DITO)/i.test(text);

    if (!number || !sourceDate || !date || base === null || total === undefined) {
      throw new Error(`No se pudieron extraer los campos fiscales de ${file}`);
    }

    return {
      name: file,
      number,
      date,
      sourceDate,
      isValidDate: isValidCalendarDate(sourceDate),
      base,
      total,
      direction,
      isCredit,
    };
  });
}

async function main() {
  const source = parseSource();
  const sourceByName = new Map(source.map((invoice) => [invoice.name, invoice]));
  const archiveEntries: any[] = await prisma.actividad.findMany({
    where: { parent_upload_id: ROOT },
    select: { upload_id: true, documento_nombre: true, documento_id: true },
  });
  const candidates = archiveEntries.filter(
    (activity) => activity.documento_id && sourceByName.has(activity.documento_nombre || '')
  );
  const documentIds = candidates.map((activity) => activity.documento_id!);
  const documents: any[] = await prisma.documentos.findMany({
    where: { id: { in: documentIds } },
    select: {
      id: true,
      numero_documento: true,
      fecha_emision: true,
      importe_sin_impuestos: true,
      importe_total: true,
      tipo_documento: true,
      id_de_empresa: true,
    },
  });
  const documentById = new Map(documents.map((document) => [String(document.id), document]));
  const companyId = documents[0]?.id_de_empresa;
  const persistedInCompany = companyId
    ? await prisma.documentos.count({ where: { id_de_empresa: companyId } })
    : 0;

  const mismatches: Array<Record<string, unknown>> = [];
  const semanticMismatches: Array<Record<string, unknown>> = [];
  for (const activity of candidates) {
    const expected = sourceByName.get(activity.documento_nombre)!;
    const actual = documentById.get(String(activity.documento_id));
    const actualDate = actual?.fecha_emision
      ? new Date(actual.fecha_emision).toISOString().slice(0, 10)
      : null;
    const actualBase = actual ? Number(actual.importe_sin_impuestos) : NaN;
    const actualTotal = actual ? Number(actual.importe_total) : NaN;
    const actualIsCredit = actual?.tipo_documento?.includes('ABONO') === true;
    const actualDirection = /RECIBID[AO]/.test(actual?.tipo_documento || '')
      ? 'RECIBIDA'
      : /EMITID[AO]/.test(actual?.tipo_documento || '')
        ? 'EMITIDA'
        : null;
    const valueMatches =
      Math.abs(Math.abs(actualBase) - Math.abs(expected.base)) < 0.005 &&
      Math.abs(Math.abs(actualTotal) - Math.abs(expected.total)) < 0.005;

    const dateMatches = expected.isValidDate ? actualDate === expected.date : actualDate === null;
    if (!actual || actual.numero_documento !== expected.number || !dateMatches || !valueMatches) {
      mismatches.push({
        file: expected.name,
        expected: { number: expected.number, date: expected.date, base: expected.base, total: expected.total },
        actual: actual && {
          number: actual.numero_documento,
          date: actualDate,
          base: actualBase,
          total: actualTotal,
          type: actual.tipo_documento,
        },
      });
    }
    if (actualDirection !== expected.direction) {
      semanticMismatches.push({ file: expected.name, reason: 'DIRECCION', expected: expected.direction, actual: actual?.tipo_documento });
    }
    if (expected.isCredit !== actualIsCredit) {
      semanticMismatches.push({ file: expected.name, reason: 'TIPO_ABONO', expected: expected.isCredit, actual: actual?.tipo_documento });
    }
    if (actualIsCredit && actualTotal >= 0) {
      semanticMismatches.push({ file: expected.name, reason: 'ABONO_NO_NEGATIVO', actual: actual?.importe_total });
    }
  }

  const incidences: any[] = await prisma.incidencias_documento.findMany({
    where: { documento_id: { in: documentIds } },
    select: { documento_id: true, descripcion: true },
  });
  const incidencesByDocument = new Map<string, any[]>();
  for (const incidence of incidences) {
    const key = String(incidence.documento_id);
    incidencesByDocument.set(key, [...(incidencesByDocument.get(key) || []), incidence]);
  }
  const today = new Date().toISOString().slice(0, 10);
  const twelveMonthsAgo = new Date(`${today}T00:00:00.000Z`);
  twelveMonthsAgo.setUTCFullYear(twelveMonthsAgo.getUTCFullYear() - 1);
  const oldestAllowedDate = twelveMonthsAgo.toISOString().slice(0, 10);
  const incidenceMismatches: Array<Record<string, unknown>> = [];
  for (const activity of candidates) {
    const expected = sourceByName.get(activity.documento_nombre)!;
    const rows = incidencesByDocument.get(String(activity.documento_id)) || [];
    let expectedRule: 'INVALIDA' | 'ANTIGUA' | 'FUTURA' | null = null;
    if (!expected.isValidDate) expectedRule = 'INVALIDA';
    else if (expected.date < oldestAllowedDate) expectedRule = 'ANTIGUA';
    else if (expected.date > today) expectedRule = 'FUTURA';

    const description = rows[0]?.descripcion || '';
    const descriptionMatches =
      (expectedRule === 'INVALIDA' &&
        rows.length === 1 &&
        description.includes(expected.sourceDate) &&
        /no es una fecha válida del calendario/i.test(description)) ||
      (expectedRule === 'ANTIGUA' &&
        rows.length === 1 &&
        description.includes(expected.date) &&
        /fecha de emisión antigua/i.test(description)) ||
      (expectedRule === 'FUTURA' &&
        rows.length === 1 &&
        description.includes(expected.date) &&
        description.includes('[FECHA_EMISION_FUTURA]')) ||
      (expectedRule === null && rows.length === 0);
    if (!descriptionMatches) {
      incidenceMismatches.push({
        file: expected.name,
        expectedRule,
        actual: rows.map((row) => row.descripcion),
      });
    }
  }
  const report = {
    sourceInvoices: source.length,
    linkedActivities: candidates.length,
    persistedDocuments: documents.length,
    totalDocumentsInCompany: persistedInCompany,
    matched: candidates.length - mismatches.length,
    mismatches,
    semanticMismatches,
    incidences: {
      rows: incidences.length,
      matched: candidates.length - incidenceMismatches.length,
      mismatches: incidenceMismatches,
      byCode: countBy(incidences.map((incidence) => incidence.descripcion?.match(/\[([A-Z_]+)\]/)?.[1] || 'INCIDENCIA_EXTRACTOR')),
    },
    types: countBy(documents.map((document) => document.tipo_documento || '(sin tipo)')),
    abonos: {
      total: documents.filter((document) => document.tipo_documento?.includes('ABONO')).length,
      positiveOrZero: documents.filter(
        (document) => document.tipo_documento?.includes('ABONO') && Number(document.importe_total) >= 0
      ).length,
    },
  };
  console.log(JSON.stringify(report, null, 2));

  if (
    source.length !== candidates.length ||
    source.length !== documents.length ||
    source.length !== persistedInCompany ||
    mismatches.length > 0 ||
    semanticMismatches.length > 0 ||
    incidenceMismatches.length > 0
  ) {
    throw new Error('La auditoría Ferrum no alcanzó una coincidencia completa');
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
