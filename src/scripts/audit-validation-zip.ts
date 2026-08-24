/** Auditoría reproducible del ZIP de validación contra la base de datos. */
import { execFileSync } from 'node:child_process';
import { prisma } from '@/lib/prisma';

const ZIP = '/home/kornegor/Descargas/files (4).zip';
const ROOT = process.env.AUDIT_ROOT || 'validation_zip_1787548498638_8df2c499';

type SourceInvoice = {
  name: string;
  number: string;
  base: number | null;
  total: number;
  date: string | null;
  direction: 'RECIBIDA' | 'EMITIDA' | null;
  mathMismatch: boolean;
  missingIssuerCif: boolean;
  zeroTotal: boolean;
  positiveRectificative: boolean;
};

function money(raw: string | undefined): number | null {
  if (!raw) return null;
  const value = Number(raw.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(value) ? value : null;
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
    .filter((file) => file.endsWith('.pdf') && file !== '00_RESUMEN_ECONOMICO.pdf');

  const invoices: SourceInvoice[] = [];
  for (const file of files) {
    const pdf = execFileSync('unzip', ['-p', ZIP, file]);
    const text = execFileSync('pdftotext', ['-', '-'], { input: pdf, encoding: 'utf8' });
    const pages = text.split('\f');
    let foundInFile = 0;

    pages.forEach((page, pageIndex) => {
      const number = page.match(/N[º°]\s*([A-Z]+-\d{4}-\d+)/)?.[1];
      const date = page.match(/Fecha:\s*(\d{4}-\d{2}-\d{2})/)?.[1] || null;
      const direction = /\bRECIBIDA\b/.test(page)
        ? 'RECIBIDA'
        : /\bEMITIDA\b/.test(page)
          ? 'EMITIDA'
          : null;
      // En el PDF el bloque de etiquetas (Base, IVA, TOTAL) se imprime antes
      // de su columna de valores. El último importe monetario de la página es
      // por tanto el total final; los dos anteriores son base e IVA.
      const amounts = [...page.matchAll(/(-?[\d.]+,\d{2})\s*€/g)]
        .map((match) => money(match[1]))
        .filter((amount): amount is number => amount !== null);
      const total = amounts.at(-1) ?? null;
      if (!number || total === null) return;
      foundInFile += 1;

      // No inferir la base por posición: con retenciones el tercer importe
      // desde el final es la cuota de IVA. El PDF tiene siempre esta etiqueta
      // seguida de su valor, incluso cuando el orden visual de columnas cambia.
      const base = money(
        page.match(/Base imponible\s*\n\s*(-?[\d.]+,\d{2})\s*€/i)?.[1]
      );
      const iva = amounts.at(-2) ?? null;
      const issuerArea = page.split(/FACTURAR A:/i)[0] || page;
      invoices.push({
        name: file === '04_sueltas_grupo_09.pdf' ? file : `${file} - Pág ${pageIndex + 1}`,
        number,
        base,
        total,
        date,
        direction,
        mathMismatch: base !== null && iva !== null && Math.abs(base + iva - total) > 0.005,
        missingIssuerCif: !/CIF:\s*[A-Z]\d{8}/i.test(issuerArea),
        zeroTotal: Math.abs(total) < 0.005,
        // Una rectificativa por incremento/aumento/cargo es una factura
        // positiva, no un abono. Es el único caso semántico que no puede
        // validarse sólo comparando el valor absoluto del total.
        positiveRectificative:
          /factura\s+rectificativa/i.test(page) &&
          /\b(?:incremento|aumento|cargo)\b/i.test(page),
      });
    });

    if (foundInFile === 0) throw new Error(`No se encontraron facturas en ${file}`);
  }
  return invoices;
}

async function main() {
  const source = parseSource();
  const byName = new Map(source.map((invoice) => [invoice.name, invoice]));
  if (source.length !== 1001 || byName.size !== 1001) {
    throw new Error(`El ZIP debía contener 1001 facturas únicas por página; se leyeron ${source.length}/${byName.size}`);
  }

  const archiveEntries: any[] = await prisma.actividad.findMany({
    where: { parent_upload_id: ROOT },
    select: { upload_id: true, documento_nombre: true, documento_id: true },
  });
  const singular = archiveEntries.filter((entry) => entry.documento_nombre === '04_sueltas_grupo_09.pdf');
  const pageParents = archiveEntries
    .filter((entry) => entry.documento_nombre !== '00_RESUMEN_ECONOMICO.pdf' && entry.documento_nombre !== '04_sueltas_grupo_09.pdf')
    .map((entry) => entry.upload_id);
  const pageActivities: any[] = await prisma.actividad.findMany({
    where: { parent_upload_id: { in: pageParents }, documento_id: { not: null } },
    select: { documento_nombre: true, documento_id: true },
  });
  const candidates = [...pageActivities, ...singular.filter((entry) => entry.documento_id)]
    .filter((activity) => byName.has(activity.documento_nombre || ''));
  const documentIds = candidates.map((activity) => activity.documento_id!);
  const documents: any[] = await prisma.documentos.findMany({
    where: { id: { in: documentIds } },
    select: {
      id: true,
      numero_documento: true,
      importe_total: true,
      importe_sin_impuestos: true,
      tipo_documento: true,
      fecha_emision: true,
    },
  });
  const documentById = new Map(documents.map((document) => [String(document.id), document]));

  const mismatches: Array<Record<string, unknown>> = [];
  const semanticMismatches: Array<Record<string, unknown>> = [];
  for (const activity of candidates) {
    const expected = byName.get(activity.documento_nombre)!;
    const document = documentById.get(String(activity.documento_id));
    const actualTotal = document ? Number(document.importe_total) : NaN;
    const actualBase = document ? Number(document.importe_sin_impuestos) : NaN;
    const totalMatches =
      Math.abs(actualTotal - expected.total) < 0.005 ||
      (document?.tipo_documento?.includes('ABONO') === true &&
        Math.abs(Math.abs(actualTotal) - Math.abs(expected.total)) < 0.005);
    const actualDate = document?.fecha_emision
      ? new Date(document.fecha_emision).toISOString().slice(0, 10)
      : null;
    const baseMatches =
      expected.base === null ||
      Math.abs(Math.abs(actualBase) - Math.abs(expected.base)) < 0.005;
    if (
      !document ||
      document.numero_documento !== expected.number ||
      !totalMatches ||
      !baseMatches ||
      actualDate !== expected.date
    ) {
      mismatches.push({
        page: activity.documento_nombre,
        expected: { number: expected.number, base: expected.base, total: expected.total, date: expected.date },
        actual: document && {
          number: document.numero_documento,
          base: actualBase,
          total: actualTotal,
          date: actualDate,
          type: document.tipo_documento,
        },
      });
    }
    if (document) {
      const isAbono = document.tipo_documento?.includes('ABONO') === true;
      if (isAbono && actualTotal >= 0) {
        semanticMismatches.push({
          page: activity.documento_nombre,
          reason: 'ABONO_NO_NEGATIVO',
          actual: { number: document.numero_documento, total: actualTotal, type: document.tipo_documento },
        });
      }
      if (expected.positiveRectificative && (isAbono || actualTotal <= 0)) {
        semanticMismatches.push({
          page: activity.documento_nombre,
          reason: 'RECTIFICATIVA_POR_INCREMENTO_MAL_CLASIFICADA',
          actual: { number: document.numero_documento, total: actualTotal, type: document.tipo_documento },
        });
      }
      const actualDirection = /RECIBID[AO]/.test(document.tipo_documento || '')
        ? 'RECIBIDA'
        : /EMITID[AO]/.test(document.tipo_documento || '')
          ? 'EMITIDA'
          : null;
      if (expected.direction && actualDirection !== expected.direction) {
        semanticMismatches.push({
          page: activity.documento_nombre,
          reason: 'DIRECCION_EMITIDA_RECIBIDA_NO_COINCIDE',
          expected: expected.direction,
          actual: { number: document.numero_documento, type: document.tipo_documento },
        });
      }
    }
  }

  const incidences: any[] = await prisma.incidencias_documento.findMany({
    where: { documento_id: { in: documentIds } },
    select: { documento_id: true, descripcion: true },
  });
  const incidenceCodes = incidences.map((incidence) => {
    const code = incidence.descripcion?.match(/\[([A-Z_]+)\]/)?.[1];
    return code || 'INCIDENCIA_EXTRACTOR';
  });

  const duplicateSourceNumbers = [...source.reduce((map, invoice) => {
    map.set(invoice.number, (map.get(invoice.number) || 0) + 1);
    return map;
  }, new Map<string, number>()).entries()].filter(([, count]) => count > 1);
  const duplicateDocumentNumbers = [...documents.reduce((map, document) => {
    const key = document.numero_documento || '(sin número)';
    map.set(key, (map.get(key) || 0) + 1);
    return map;
  }, new Map<string, number>()).entries()].filter(([, count]) => count > 1);

  const report = {
    sourceInvoices: source.length,
    matchedActivities: candidates.length,
    persistedDocuments: documents.length,
    matched: candidates.length - mismatches.length,
    mismatches,
    semanticMismatches,
    sourceSignals: {
      mathMismatch: source.filter((invoice) => invoice.mathMismatch).length,
      missingIssuerCif: source.filter((invoice) => invoice.missingIssuerCif).length,
      zeroTotal: source.filter((invoice) => invoice.zeroTotal).length,
      duplicateInvoiceNumbers: duplicateSourceNumbers,
    },
    incidences: {
      rows: incidences.length,
      documents: new Set(incidences.map((incidence) => String(incidence.documento_id))).size,
      byCode: countBy(incidenceCodes),
    },
    persistedDuplicateInvoiceNumbers: duplicateDocumentNumbers,
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
    candidates.length !== source.length ||
    documents.length !== source.length ||
    mismatches.length > 0 ||
    semanticMismatches.length > 0
  ) {
    throw new Error('La auditoría no alcanzó una coincidencia completa');
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
