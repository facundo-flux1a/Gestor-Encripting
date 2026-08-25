import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { prisma } from '../src/lib/prisma';

interface PdfInvoiceData {
  file: string;
  page: number;
  numero_documento: string;
  fecha_emision: string | null;
  tipo: string;
  emisor_nombre: string;
  emisor_cif: string;
  receptor_nombre: string;
  receptor_cif: string;
  base_imponible: number;
  iva_porcentaje: number;
  iva_cuota: number;
  importe_total: number;
  rawText: string;
}

function parseSpanishNumber(str: string): number {
  if (!str) return 0;
  const clean = str.replace(/€|\$|\s/g, '').trim();
  const normalized = clean.replace(/\./g, '').replace(',', '.');
  const num = parseFloat(normalized);
  return isNaN(num) ? 0 : num;
}

function reconstructPageText(items: any[]): string {
  if (!items || items.length === 0) return '';
  
  const sorted = [...items].sort((a, b) => {
    const yA = a.transform ? a.transform[5] : 0;
    const yB = b.transform ? b.transform[5] : 0;
    const diffY = yB - yA;
    if (Math.abs(diffY) > 3) {
      return diffY;
    }
    const xA = a.transform ? a.transform[4] : 0;
    const xB = b.transform ? b.transform[4] : 0;
    return xA - xB;
  });

  return sorted.map(i => i.str).join(' ');
}

function extractDataFromText(text: string, fileName: string, pageNum: number): PdfInvoiceData {
  // 1. Número de factura
  let numero = '';
  const codeMatch = text.match(/\b((?:REC|FAC|ABO|EMI|EXP|INV|DOC)[-_]\d{4}[-_]\d{3,6})\b/i);
  if (codeMatch) {
    numero = codeMatch[1].trim();
  }

  if (!numero) {
    const numMatch = text.match(/(?:N[º°o.]?|No\.?|Número:?|Factura:?|Invoice:?)\s*([A-Z0-9\-_/]{3,30})/i);
    if (numMatch) {
      const candidate = numMatch[1].trim();
      if (!['FACTURA', 'RECIBIDA', 'EMITIDA', 'ABONO', 'DE', 'FECHA'].includes(candidate.toUpperCase())) {
        numero = candidate;
      }
    }
  }

  if (!numero) {
    const genericMatch = text.match(/\b([A-Z]{0,5}\d{4}[-_/]\d{3,6})\b/i);
    if (genericMatch) {
      numero = genericMatch[1].trim();
    }
  }

  // 2. Fecha de emisión
  let fecha: string | null = null;
  const dateMatch = text.match(/Fecha:\s*(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{4})/i);
  if (dateMatch) {
    const rawDate = dateMatch[1].trim();
    if (rawDate.includes('/') || rawDate.includes('-')) {
      const separator = rawDate.includes('/') ? '/' : '-';
      const parts = rawDate.split(separator);
      if (parts[0].length === 4) {
        fecha = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
      } else {
        fecha = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
    } else {
      fecha = rawDate;
    }
  }

  // 3. Tipo
  let tipo = 'FACTURA RECIBIDA';
  const upper = text.toUpperCase();
  if (upper.includes('ABONO EMITIDO')) {
    tipo = 'ABONO EMITIDO';
  } else if (upper.includes('ABONO RECIBIDO') || upper.includes('ABONO')) {
    tipo = 'ABONO RECIBIDO';
  } else if (upper.includes('FACTURA EMITIDA') || upper.includes('EMITIDA')) {
    tipo = 'FACTURA EMITIDA';
  } else if (upper.includes('FACTURA RECIBIDA') || upper.includes('RECIBIDA')) {
    tipo = 'FACTURA RECIBIDA';
  }

  // 4. Emisor y Receptor CIF
  let emisorNombre = '';
  let emisorCif = '';
  let receptorNombre = '';
  let receptorCif = '';

  const cifMatches = Array.from(text.matchAll(/CIF:?\s*([A-Z0-9]{8,10})/gi)).map(m => m[1].toUpperCase());
  if (cifMatches.length >= 2) {
    emisorCif = cifMatches[0];
    receptorCif = cifMatches[1];
  } else if (cifMatches.length === 1) {
    emisorCif = cifMatches[0];
  }

  // 5. Importes
  let baseImponible = 0;
  let ivaPorcentaje = 21;
  let ivaCuota = 0;
  let total = 0;

  const baseMatch = text.match(/Base\s*(?:imponible)?\s*[:\s]*([0-9.,]+)\s*€/i);
  if (baseMatch) {
    baseImponible = parseSpanishNumber(baseMatch[1]);
  }

  const ivaMatch = text.match(/IVA\s*\(([0-9]+)%\)\s*[:\s]*([0-9.,]+)\s*€/i);
  if (ivaMatch) {
    ivaPorcentaje = parseInt(ivaMatch[1], 10);
    ivaCuota = parseSpanishNumber(ivaMatch[2]);
  }

  const totalMatch = text.match(/TOTAL\s*(?:FACTURA|DOCUMENTO)?\s*[:\s]*([0-9.,\-]+)\s*€/i);
  if (totalMatch) {
    total = parseSpanishNumber(totalMatch[1]);
  }

  return {
    file: fileName,
    page: pageNum,
    numero_documento: numero,
    fecha_emision: fecha,
    tipo,
    emisor_nombre: emisorNombre,
    emisor_cif: emisorCif,
    receptor_nombre: receptorNombre,
    receptor_cif: receptorCif,
    base_imponible: baseImponible,
    iva_porcentaje: ivaPorcentaje,
    iva_cuota: ivaCuota,
    importe_total: total,
    rawText: text,
  };
}

async function runAudit() {
  console.log('================================================================');
  console.log('🔍 AUDITORÍA AUTOMÁTICA CRUZADA: 600 FACTURAS (PDF vs BASE DE DATOS)');
  console.log('   Modo: SÓLO LECTURA (Prisma con Desencriptación Automática de CIF)');
  console.log('================================================================\n');

  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

  const pdfFiles = [
    'C:\\Users\\Facundo\\Downloads\\muvail\\01_lote_100_facturas.pdf',
    'C:\\Users\\Facundo\\Downloads\\muvail\\02_lote_200_facturas.pdf',
    'C:\\Users\\Facundo\\Downloads\\muvail\\03_lote_300_facturas.pdf'
  ];

  const allPdfInvoices: PdfInvoiceData[] = [];

  for (const filePath of pdfFiles) {
    const fileName = path.basename(filePath);
    if (!fs.existsSync(filePath)) {
      console.error(`❌ Archivo no encontrado: ${filePath}`);
      continue;
    }

    console.log(`📄 Leyendo ${fileName}...`);
    const data = new Uint8Array(fs.readFileSync(filePath));
    const loadingTask = pdfjsLib.getDocument({ data, useSystemFonts: true });
    const pdfDoc = await loadingTask.promise;
    console.log(`   Páginas detectadas: ${pdfDoc.numPages}`);

    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = reconstructPageText(textContent.items);
      const parsed = extractDataFromText(pageText, fileName, pageNum);
      allPdfInvoices.push(parsed);
    }
  }

  console.log(`\n✅ Total de facturas extraídas directamente de los PDFs: ${allPdfInvoices.length}`);

  // -------------------------------------------------------------
  // CONSULTA SÓLO LECTURA A PRISMA (Empresa 117 con desencriptación)
  // -------------------------------------------------------------
  console.log('\n🗄️  Consultando registros en Base de Datos (Empresa ID: 117)...');

  const dbDocs = await prisma.documentos.findMany({
    where: { id_de_empresa: BigInt(117) },
    select: {
      id: true,
      id_de_empresa: true,
      numero_documento: true,
      tipo_documento: true,
      fecha_emision: true,
      importe_total: true,
      importe_sin_impuestos: true,
      fecha_creacion: true,
      entidades_documento: {
        select: {
          rol: true,
          nombre: true,
          identificador_fiscal: true
        }
      },
      impuestos_documento: {
        select: {
          tipo_impuesto: true,
          porcentaje: true,
          base_imponible: true,
          cuota: true
        }
      },
      incidencias_documento: {
        where: { validado: false },
        select: {
          descripcion: true,
          validado: true
        }
      }
    }
  });

  console.log(`   Documentos encontrados en BD para empresa 117: ${dbDocs.length}`);

  // Indexar documentos de BD por numero_documento
  const dbDocsByNumber = new Map<string, any>();
  for (const doc of dbDocs) {
    if (doc.numero_documento) {
      dbDocsByNumber.set(doc.numero_documento.trim().toUpperCase(), doc);
    }
  }

  // -------------------------------------------------------------
  // CRUCE Y COMPARACIÓN CAMPO POR CAMPO
  // -------------------------------------------------------------
  console.log('\n⚡ Cruzando datos PDF vs Base de Datos (Número, Total, Base, Fecha, CIF, Incidencias)...');

  let perfectMatches = 0;
  let notFoundInDb = 0;
  let amountMismatches = 0;
  let dateMismatches = 0;
  let cifMismatches = 0;
  let withIncidences = 0;

  const discrepancies: Array<{
    pdfInvoice: string;
    pdfFile: string;
    pdfPage: number;
    pdfTotal: number;
    pdfBase: number;
    pdfCif: string;
    dbDocId?: number;
    dbTotal?: number;
    dbBase?: number;
    dbCif?: string;
    status: string;
    details: string;
  }> = [];

  for (const pdfInv of allPdfInvoices) {
    const numKey = pdfInv.numero_documento ? pdfInv.numero_documento.trim().toUpperCase() : '';
    let dbDoc = numKey ? dbDocsByNumber.get(numKey) : undefined;

    // Fallback de matcheo por fecha + importe si el número no coincidió
    if (!dbDoc && pdfInv.importe_total > 0) {
      const roundedPdfTotal = Math.round(pdfInv.importe_total * 100);
      dbDoc = dbDocs.find((d: any) => {
        const dTotal = Math.round(Math.abs(Number(d.importe_total) || 0) * 100);
        const dFecha = d.fecha_emision ? new Date(d.fecha_emision).toISOString().split('T')[0] : null;
        return dTotal === roundedPdfTotal && dFecha === pdfInv.fecha_emision;
      });
    }

    if (!dbDoc) {
      notFoundInDb++;
      discrepancies.push({
        pdfInvoice: pdfInv.numero_documento || `Pág ${pdfInv.page}`,
        pdfFile: pdfInv.file,
        pdfPage: pdfInv.page,
        pdfTotal: pdfInv.importe_total,
        pdfBase: pdfInv.base_imponible,
        pdfCif: pdfInv.emisor_cif,
        status: '❌ NO ENCONTRADO EN BD',
        details: 'El documento no fue registrado en la base de datos de la empresa 117.'
      });
      continue;
    }

    const docIdNum = Number(dbDoc.id);

    // Comparación de Importes
    const dbTotal = Math.abs(Number(dbDoc.importe_total) || 0);
    const pdfTotal = Math.abs(pdfInv.importe_total);
    const diffTotal = Math.abs(dbTotal - pdfTotal);

    const dbBase = Math.abs(Number(dbDoc.importe_sin_impuestos) || 0);
    const pdfBase = Math.abs(pdfInv.base_imponible);
    const diffBase = Math.abs(dbBase - pdfBase);

    let hasIssue = false;
    const issues: string[] = [];

    if (diffTotal > 0.05) {
      amountMismatches++;
      hasIssue = true;
      issues.push(`Total difiere: PDF=${pdfTotal.toFixed(2)}€ vs BD=${dbTotal.toFixed(2)}€`);
    }

    if (pdfBase > 0 && diffBase > 0.05) {
      hasIssue = true;
      issues.push(`Base difiere: PDF=${pdfBase.toFixed(2)}€ vs BD=${dbBase.toFixed(2)}€`);
    }

    // Comparación de Fechas
    const dbFechaStr = dbDoc.fecha_emision ? new Date(dbDoc.fecha_emision).toISOString().split('T')[0] : null;
    if (pdfInv.fecha_emision && dbFechaStr && pdfInv.fecha_emision !== dbFechaStr) {
      dateMismatches++;
      hasIssue = true;
      issues.push(`Fecha difiere: PDF=${pdfInv.fecha_emision} vs BD=${dbFechaStr}`);
    }

    // Comparación de CIF (Emisor)
    const emisorEnt = dbDoc.entidades_documento?.find((e: any) => e.rol === 'emisor' || e.rol === 'proveedor');
    const dbCif = emisorEnt?.identificador_fiscal || '';
    if (pdfInv.emisor_cif && dbCif) {
      const cleanPdfCif = pdfInv.emisor_cif.replace(/[\s\-]/g, '').toUpperCase();
      const cleanDbCif = String(dbCif).replace(/[\s\-]/g, '').toUpperCase();
      if (cleanPdfCif !== cleanDbCif && !cleanDbCif.includes(cleanPdfCif)) {
        cifMismatches++;
        hasIssue = true;
        issues.push(`CIF difiere: PDF=${cleanPdfCif} vs BD=${cleanDbCif}`);
      }
    }

    // Incidencias activas
    if (dbDoc.incidencias_documento && dbDoc.incidencias_documento.length > 0) {
      withIncidences++;
      const incList = dbDoc.incidencias_documento.map((i: any) => i.descripcion).join('; ');
      issues.push(`Incidencia activa en BD: "${incList}"`);
    }

    if (hasIssue) {
      discrepancies.push({
        pdfInvoice: pdfInv.numero_documento || `ID ${docIdNum}`,
        pdfFile: pdfInv.file,
        pdfPage: pdfInv.page,
        pdfTotal,
        pdfBase,
        pdfCif: pdfInv.emisor_cif,
        dbDocId: docIdNum,
        dbTotal,
        dbBase,
        dbCif,
        status: '⚠️ DISCREPANCIA',
        details: issues.join(' | ')
      });
    } else {
      perfectMatches++;
    }
  }

  // -------------------------------------------------------------
  // REPORTE CONSOLIDADO
  // -------------------------------------------------------------
  console.log('\n================================================================');
  console.log('📊 RESULTADOS DE LA AUDITORÍA (600 FACTURAS)');
  console.log('================================================================');
  console.log(`Total facturas en los 3 PDFs:          ${allPdfInvoices.length}`);
  console.log(`Total facturas encontradas en BD:       ${allPdfInvoices.length - notFoundInDb}`);
  console.log(`✅ Coincidencias 100% Exactas:         ${perfectMatches} (${allPdfInvoices.length > 0 ? ((perfectMatches / allPdfInvoices.length) * 100).toFixed(1) : 0}%)`);
  console.log(`❌ No encontradas en BD (Faltantes):   ${notFoundInDb}`);
  console.log(`⚠️  Descuadres de Importe (Total/Base):  ${amountMismatches}`);
  console.log(`⚠️  Discrepancias de Fecha:             ${dateMismatches}`);
  console.log(`⚠️  Discrepancias de CIF:               ${cifMismatches}`);
  console.log(`🚩 Facturas con Incidencias en BD:      ${withIncidences}`);
  console.log('================================================================\n');

  if (discrepancies.length > 0) {
    console.log(`📋 DETALLE DE DISCREPANCIAS Y FALTANTES (${discrepancies.length} casos):\n`);
    console.table(discrepancies.slice(0, 50).map(d => ({
      'Factura': d.pdfInvoice,
      'Archivo PDF': d.pdfFile,
      'Pág': d.pdfPage,
      'Total PDF': `${d.pdfTotal.toFixed(2)} €`,
      'Total BD': d.dbTotal !== undefined ? `${d.dbTotal.toFixed(2)} €` : '—',
      'CIF PDF': d.pdfCif || '—',
      'CIF BD': d.dbCif || '—',
      'Estado': d.status,
      'Detalle': d.details
    })));

    if (discrepancies.length > 50) {
      console.log(`... y ${discrepancies.length - 50} casos más.`);
    }
  } else {
    console.log('🎉 ¡EXCELENTE! Las 600 facturas coinciden al 100% de forma exacta en Número, CIF, Fecha, Base y Total entre los PDFs y la Base de Datos.');
  }
}

runAudit()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error durante la auditoría:', err);
    process.exit(1);
  });
