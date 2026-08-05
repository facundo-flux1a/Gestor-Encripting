/**
 * Mapea resultado prebuilt-invoice de Azure DI → shape DocumentoExtraido
 * (el mismo que espera normalize + fiscal-guards + db-writer).
 *
 * Complementa campos que Azure suele dejar vacíos en facturas ES:
 * - VendorTaxId / CustomerTaxId vía OCR (`analyzeResult.content`)
 * - SubTotal / TaxDetails incompletos → base e IVA reconstruidos
 */

import type { AzureDiAnalyzeResult, AzureDiField } from './azure-di';
import { parseFlexibleDate } from './date-utils';
import type { DocumentoExtraido, EmpresaDoc, Impuesto } from './normalize';

export { parseFlexibleDate } from './date-utils';

const COMMON_IVA_RATES = [0, 4, 5, 10, 21] as const;

function str(field?: AzureDiField): string {
  if (!field) return '';
  if (field.valueString != null) return String(field.valueString);
  if (field.valueDate != null) return String(field.valueDate).slice(0, 10);
  if (field.content != null) return String(field.content);
  return '';
}

function num(field?: AzureDiField): number {
  if (!field) return 0;
  if (field.valueCurrency?.amount != null) return Number(field.valueCurrency.amount) || 0;
  if (field.valueNumber != null) return Number(field.valueNumber) || 0;
  const n = parseFloat(String(field.content || '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function addr(field?: AzureDiField): string {
  if (!field) return '';
  const a = field.valueAddress;
  if (a) {
    return [a.streetAddress, a.city, a.postalCode, a.state, a.countryRegion]
      .filter(Boolean)
      .join(', ');
  }
  return str(field);
}

/** Limpia CIF/NIF/NIE ES (quita ES, guiones, puntos). */
export function cleanCif(raw: string | null | undefined): string {
  if (!raw || !String(raw).trim()) return '';
  let cif = String(raw)
    .toUpperCase()
    .replace(/[\s\-./()]/g, '');
  if (cif.startsWith('ES') && cif.length > 9) {
    cif = cif.slice(2);
  } else if (cif.startsWith('ES') && /^ES[A-Z]\d{7,8}/.test(cif)) {
    cif = cif.slice(2);
  }
  return cif;
}

function looksLikeSpanishTaxId(cif: string): boolean {
  if (cif.length !== 9) return false;
  return (
    /^[A-Z]\d{7}[A-Z0-9]$/.test(cif) ||
    /^[A-Z]\d{8}$/.test(cif) ||
    /^[XYZ]\d{7}[A-Z]$/.test(cif) ||
    /^\d{8}[A-Z]$/.test(cif)
  );
}

/**
 * Extrae CIF/NIF candidatos del texto OCR de Azure DI.
 * Prioriza los etiquetados (CIF:/NIF:) — típicos en pie de factura ES.
 * Tolera OCR tipo CIF/DNl y valores casi-CIF (897376321 ≈ B97376321).
 */
export function extractCifsFromText(text: string): { labeled: string[]; all: string[] } {
  if (!text?.trim()) return { labeled: [], all: [] };

  const labeled: string[] = [];
  const labeledRe =
    /(?:CIF|N\.?\s*I\.?\s*F\.?|NIF|DN[Il1]|VAT(?:\s*ID)?|EORI\/VIES)\s*[.::=\-–/]?\s*(?:ES\s*)?([A-Z0-9]-?\d{7,8}[A-Z0-9]?|\d{8,9}[A-Z]?)/gi;
  let m: RegExpExecArray | null;
  while ((m = labeledRe.exec(text)) !== null) {
    const c = cleanCif(m[1]);
    if ((looksLikeSpanishTaxId(c) || /^\d{8,9}$/.test(c)) && !labeled.includes(c)) labeled.push(c);
  }

  const all: string[] = [...labeled];
  const bareRe = /\b(?:ES)?([A-Z]-?\d{7,8}[A-Z0-9]?|\d{8}[A-Z])\b/gi;
  while ((m = bareRe.exec(text)) !== null) {
    const c = cleanCif(m[1]);
    if (looksLikeSpanishTaxId(c) && !all.includes(c)) all.push(c);
  }

  return { labeled, all };
}

/** OCR frecuente: B97376321 → 897376321 / A97376321 */
export function matchesEmpresaCifLookalike(raw: string, empresaCif: string): boolean {
  const ours = cleanCif(empresaCif);
  if (!ours) return false;
  const c = cleanCif(raw);
  if (c === ours) return true;
  const digO = ours.replace(/\D/g, '');
  const digC = String(raw).replace(/\D/g, '');
  if (!digO || !digC) return false;
  return digC === digO || digC === `8${digO}` || digC.endsWith(digO);
}

/**
 * Varias facturas en el mismo PDF (Cash/Musgrave, packs, etc.).
 * Solo por números de factura distintos (no por “DUPLICADO” repetido en 1 hoja).
 */
export function detectMultipleInvoicesInText(text: string): boolean {
  if (!text?.trim()) return false;

  const nums = new Set<string>();
  const re =
    /Factura\s*n[uú]m(?:ero|oro)?\s*[.:;]?\s*([0-9][0-9\s.\-\/]{4,20})/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const norm = m[1].replace(/[\s./]/g, '');
    if (norm.length >= 6) nums.add(norm);
  }
  return nums.size >= 2;
}

/** Proveedores conocidos cuyo CIF no suele venir en el ticket OCR. */
const KNOWN_VENDOR_CIF: Array<{ match: RegExp; cif: string; nombre: string }> = [
  {
    match: /MUSGRAVE|CASH\s+MASSANASSA|cash\.musgrave/i,
    cif: 'A80837941',
    nombre: 'MUSGRAVE ESPAÑA S.A.U.',
  },
];

export function resolveKnownVendorCif(
  vendorName: string,
  content: string
): { cif: string; nombre: string; match: RegExp } | null {
  const hay = `${vendorName}\n${content}`;
  for (const row of KNOWN_VENDOR_CIF) {
    if (row.match.test(hay)) return { cif: row.cif, nombre: row.nombre, match: row.match };
  }
  return null;
}

function addDaysIso(isoDate: string, days: number): string | null {
  const d = new Date(`${isoDate}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Emisión: InvoiceDate Azure u OCR ("Fecha factura/emisión/documento").
 */
export function resolveFechaEmision(
  fields: Record<string, AzureDiField>,
  content: string | undefined
): string {
  for (const key of ['InvoiceDate', 'ServiceDate', 'Date', 'BillingDate'] as const) {
    const parsed = parseFlexibleDate(str(fields[key]));
    if (parsed) return parsed;
  }

  const text = content || '';

  const labeled =
    text.match(
      /Fecha\s*(?:de\s*)?(?:factura|emisi[oó]n|documento|expedici[oó]n)\s*[^\d]{0,48}(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/i
    );
  if (labeled?.[1]) {
    const parsed = parseFlexibleDate(labeled[1]);
    if (parsed) return parsed;
  }

  // "Fecha:" genérica en líneas que no sean pago/vencimiento
  for (const line of text.split(/\n/)) {
    if (/pago|vencim|vto\.?|vencimiento|due/i.test(line)) continue;
    const m = line.match(/Fecha\s*[^\d]{0,24}(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/i);
    if (m?.[1]) {
      const parsed = parseFlexibleDate(m[1]);
      if (parsed) return parsed;
    }
  }

  return '';
}

/**
 * Vencimiento: DueDate Azure, PaymentDate, "Fecha pago"/"Fecha Vto" en OCR,
 * o emisión + N días del PaymentTerm. Vacío es válido (no inventar).
 */
export function resolveFechaVencimiento(
  fields: Record<string, AzureDiField>,
  content: string | undefined,
  fechaEmision: string,
  formaPago: string
): string {
  for (const key of ['DueDate', 'PaymentDate', 'PaymentDueDate'] as const) {
    const parsed = parseFlexibleDate(str(fields[key]));
    if (parsed) return parsed;
  }

  const text = content || '';
  const labeled =
    text.match(
      /Fecha\s*(?:de\s*)?(?:pago|vto\.?|vencimiento)\s*[^\d]{0,48}(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/i
    ) ||
    text.match(/Vencimiento\s*[^\d]{0,24}(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/i);
  if (labeled?.[1]) {
    const parsed = parseFlexibleDate(labeled[1]);
    if (parsed) return parsed;
  }

  const term = `${formaPago} ${str(fields.PaymentTerm)} ${text.slice(0, 4000)}`;
  const daysMatch = term.match(/(\d{1,3})\s*D[IÍ]AS?/i);
  if (daysMatch && fechaEmision) {
    const n = Number(daysMatch[1]);
    if (n > 0 && n <= 365) {
      const derived = addDaysIso(fechaEmision.slice(0, 10), n);
      if (derived) return derived;
    }
  }

  return '';
}

function party(fields: Record<string, AzureDiField> | undefined, prefix: 'Vendor' | 'Customer'): EmpresaDoc {
  if (!fields) return { nombre: '', cif: '', direccion: '' };
  return {
    nombre: str(fields[`${prefix}Name`]),
    cif: cleanCif(str(fields[`${prefix}TaxId`])),
    direccion: addr(fields[`${prefix}Address`]),
    telefono: '',
    email: '',
  };
}

/** Rate Azure a veces viene como 0.21; normaliza a porcentaje entero típico. */
export function normalizeTaxRate(rate: number): number {
  if (!Number.isFinite(rate) || rate <= 0) return 0;
  let pct = rate;
  if (pct > 0 && pct <= 1) pct = pct * 100;
  // Snap a tipos IVA habituales si está muy cerca
  for (const common of COMMON_IVA_RATES) {
    if (Math.abs(pct - common) <= 0.15) return common;
  }
  return Math.round(pct * 100) / 100;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function sumLineAmounts(fields: Record<string, AzureDiField>): number {
  const items = fields.Items?.valueArray;
  if (!Array.isArray(items) || items.length === 0) return 0;
  return round2(
    items.reduce((acc, item) => {
      const obj = item.valueObject || {};
      return acc + num(obj.Amount);
    }, 0)
  );
}

function mapTaxDetails(fields: Record<string, AzureDiField>): Impuesto[] {
  const taxDetails = fields.TaxDetails?.valueArray;
  if (Array.isArray(taxDetails) && taxDetails.length > 0) {
    const mapped = taxDetails
      .map((item) => {
        const obj = item.valueObject || {};
        const amount = num(obj.Amount);
        let rate = normalizeTaxRate(num(obj.Rate));
        let base = num(obj.NetAmount);
        const desc = `${str(obj.Description)} ${str(item)}`.toUpperCase();
        const isIrpf = /IRPF|RETENC/.test(desc) || amount < 0;

        if (base <= 0 && rate > 0 && amount !== 0) {
          base = round2(Math.abs(amount) / (rate / 100));
        }
        if (rate <= 0 && base > 0 && amount !== 0) {
          rate = normalizeTaxRate((Math.abs(amount) / base) * 100);
        }

        return {
          tipo_iva: isIrpf ? 'IRPF' : 'IVA',
          porcentaje: rate,
          base_imponible: base,
          cuota_iva: amount,
          total_con_iva: round2(base + amount),
        } as Impuesto;
      })
      .filter((t) => t.cuota_iva !== 0 || t.base_imponible !== 0);

    if (mapped.length > 0) return mapped;
  }

  // Fallback: un solo total de impuesto
  const totalTax = num(fields.TotalTax);
  const subTotal = num(fields.SubTotal);
  const invoiceTotal = num(fields.InvoiceTotal) || num(fields.AmountDue);
  if (totalTax > 0 || subTotal > 0) {
    const base = subTotal || (invoiceTotal > totalTax ? round2(invoiceTotal - totalTax) : 0);
    const pct = base > 0 ? normalizeTaxRate((totalTax / base) * 100) : 0;
    return [
      {
        tipo_iva: 'IVA',
        porcentaje: pct,
        base_imponible: base,
        cuota_iva: totalTax,
        total_con_iva: round2(base + totalTax),
      },
    ];
  }
  return [];
}

/**
 * Repara base / impuestos cuando Azure deja SubTotal=0 o TaxDetails sin cuota.
 */
export function reconcileImportes(
  importeTotal: number,
  importeSinIva: number,
  impuestos: Impuesto[],
  fields: Record<string, AzureDiField>
): { base: number; impuestos: Impuesto[] } {
  let base = importeSinIva;
  let taxes = [...impuestos];
  const totalTaxField = num(fields.TotalTax);
  const lineSum = sumLineAmounts(fields);

  const sumCuotas = () => round2(taxes.reduce((a, t) => a + (Number(t.cuota_iva) || 0), 0));
  const sumBases = () => round2(taxes.reduce((a, t) => a + (Number(t.base_imponible) || 0), 0));

  // Base ausente: total − IVA, suma de bases de tax lines, o suma de líneas
  if (base <= 0 && importeTotal > 0) {
    if (sumCuotas() !== 0) {
      base = round2(importeTotal - sumCuotas());
    } else if (totalTaxField > 0 && importeTotal > totalTaxField) {
      base = round2(importeTotal - totalTaxField);
    } else if (sumBases() > 0) {
      base = sumBases();
    } else if (lineSum > 0) {
      base = lineSum;
    }
  }

  // Tax lines sin cuota pero tenemos base+total → sintetizar IVA
  if (taxes.length === 0 && base > 0 && importeTotal > base) {
    const cuota = round2(importeTotal - base);
    if (cuota > 0) {
      taxes = [
        {
          tipo_iva: 'IVA',
          porcentaje: normalizeTaxRate((cuota / base) * 100),
          base_imponible: base,
          cuota_iva: cuota,
          total_con_iva: importeTotal,
        },
      ];
    }
  }

  // Tax lines con bases pero cuotas a 0 y total conocido
  if (taxes.length > 0 && sumCuotas() === 0 && base > 0 && importeTotal > base) {
    const cuota = round2(importeTotal - base);
    if (taxes.length === 1) {
      taxes[0] = {
        ...taxes[0],
        cuota_iva: cuota,
        porcentaje: taxes[0].porcentaje || normalizeTaxRate((cuota / base) * 100),
        total_con_iva: round2(base + cuota),
      };
    } else {
      taxes.push({
        tipo_iva: 'IVA',
        porcentaje: normalizeTaxRate((cuota / base) * 100),
        base_imponible: base,
        cuota_iva: cuota,
        total_con_iva: importeTotal,
      });
    }
  }

  // Rellenar bases de líneas IVA si faltan: preferir cuota/tipo; si no, base global
  for (let i = 0; i < taxes.length; i++) {
    const t = taxes[i];
    if ((t.base_imponible || 0) > 0) continue;
    const cuota = Number(t.cuota_iva) || 0;
    const pct = Number(t.porcentaje) || 0;
    const derived = pct > 0 && cuota !== 0 ? round2(Math.abs(cuota) / (pct / 100)) : 0;
    const lineBase = derived || (taxes.length === 1 ? base : 0);
    if (lineBase > 0) {
      taxes[i] = {
        ...t,
        base_imponible: lineBase,
        total_con_iva: round2(lineBase + cuota),
      };
    }
  }

  // Si TotalTax existe y taxes vacíos tras lo anterior
  if (taxes.length === 0 && totalTaxField > 0 && base > 0) {
    taxes = [
      {
        tipo_iva: 'IVA',
        porcentaje: normalizeTaxRate((totalTaxField / base) * 100),
        base_imponible: base,
        cuota_iva: totalTaxField,
        total_con_iva: round2(base + totalTaxField),
      },
    ];
  }

  return { base: base > 0 ? base : importeSinIva, impuestos: taxes };
}

/**
 * Completa CIF emisor/receptor desde campos Azure + OCR content.
 */
export function enrichPartyCifs(
  emisor: EmpresaDoc,
  cliente: EmpresaDoc,
  content: string | undefined,
  empresaCif?: string | null
): { emisor: EmpresaDoc; cliente: EmpresaDoc } {
  const ours = cleanCif(empresaCif || '');
  const outEmisor = { ...emisor, cif: cleanCif(emisor.cif) };
  const outCliente = { ...cliente, cif: cleanCif(cliente.cif) };
  const { labeled, all } = extractCifsFromText(content || '');

  const candidates = [...labeled, ...all.filter((c) => !labeled.includes(c))];

  // Cliente = empresa (incl. OCR basura 897376321 ≈ B97376321)
  if (!outCliente.cif && ours) {
    if (candidates.some((c) => matchesEmpresaCifLookalike(c, ours))) {
      outCliente.cif = ours;
    }
  }
  if (outCliente.cif && ours && matchesEmpresaCifLookalike(outCliente.cif, ours)) {
    outCliente.cif = ours;
  }

  // Emisor: primer CIF etiquetado distinto del cliente/empresa
  if (!outEmisor.cif) {
    const vendorFromLabeled = labeled.find(
      (c) => !matchesEmpresaCifLookalike(c, ours) && c !== outCliente.cif && looksLikeSpanishTaxId(c)
    );
    if (vendorFromLabeled) {
      outEmisor.cif = vendorFromLabeled;
    } else {
      const vendorFromAll = candidates.find(
        (c) => !matchesEmpresaCifLookalike(c, ours) && c !== outCliente.cif && looksLikeSpanishTaxId(c)
      );
      if (vendorFromAll) outEmisor.cif = vendorFromAll;
    }
  }

  // Si Azure puso el CIF de la empresa en Vendor y el cliente vacío → swap
  if (ours && outEmisor.cif === ours && !outCliente.cif) {
    outCliente.cif = ours;
    const other = candidates.find((c) => c !== ours);
    outEmisor.cif = other || '';
  }

  // Evitar emisor=receptor: si Azure duplicó, reasignar
  if (outEmisor.cif && outCliente.cif && outEmisor.cif === outCliente.cif) {
    const other = candidates.find((c) => c !== outEmisor.cif && looksLikeSpanishTaxId(c));
    if (ours && outEmisor.cif === ours) {
      outCliente.cif = ours;
      outEmisor.cif = other || '';
    } else if (other) {
      if (ours && other === ours) outCliente.cif = ours;
      else outCliente.cif = outCliente.cif === ours ? outCliente.cif : other;
      if (ours && outEmisor.cif === ours && other !== ours) {
        outEmisor.cif = other;
        outCliente.cif = ours;
      }
    }
  }

  // Cash/Musgrave etc.: CIF/nombre de catálogo (OCR suele omitir TaxId o poner el cliente como Vendor)
  const known = resolveKnownVendorCif(outEmisor.nombre || '', content || '');
  if (known) {
    if (!outEmisor.cif) outEmisor.cif = known.cif;
    const nombreOk = known.match.test(outEmisor.nombre || '');
    if (!outEmisor.nombre?.trim() || !nombreOk) {
      outEmisor.nombre = known.nombre;
    }
  }

  return { emisor: outEmisor, cliente: outCliente };
}

function mapLineas(fields: Record<string, AzureDiField>) {
  const items = fields.Items?.valueArray;
  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }
  const articulos = items.map((item) => {
    const obj = item.valueObject || {};
    return {
      codigo: str(obj.ProductCode),
      descripcion: str(obj.Description),
      cantidad: num(obj.Quantity) || 1,
      precio_unitario: num(obj.UnitPrice),
      descuento_porcentaje: 0,
      precio_neto: num(obj.UnitPrice),
      importe_linea: num(obj.Amount),
    };
  });
  return [{ albaran: '', fecha_albaran: '', articulos }];
}

/**
 * Decide FACTURA EMITIDA vs RECIBIDA comparando CIF empresa del dashboard.
 */
export function resolveTipoDocumento(
  emisorCif: string,
  clienteCif: string,
  empresaCif?: string | null
): string {
  const ours = cleanCif(empresaCif || '');
  if (!ours) return 'FACTURA RECIBIDA';
  if (cleanCif(emisorCif) === ours) return 'FACTURA EMITIDA';
  if (cleanCif(clienteCif) === ours) return 'FACTURA RECIBIDA';
  return 'FACTURA RECIBIDA';
}

/**
 * true si el analyze parece una factura usable (no página en blanco).
 */
export function azureDiLooksLikeInvoice(result: AzureDiAnalyzeResult): boolean {
  const doc = result.documents?.[0];
  if (!doc?.fields) return false;
  const f = doc.fields;
  const hasId = Boolean(str(f.InvoiceId));
  const hasTotal = num(f.InvoiceTotal) > 0 || num(f.AmountDue) > 0 || num(f.SubTotal) > 0;
  const hasParty = Boolean(str(f.VendorName) || str(f.VendorTaxId) || str(f.CustomerName));
  const hasCifInText = extractCifsFromText(result.content || '').all.length > 0;
  return hasId || (hasTotal && hasParty) || (hasTotal && hasCifInText);
}

export function mapAzureDiInvoiceToDocumentShape(
  result: AzureDiAnalyzeResult,
  opts?: { empresaCif?: string | null }
): DocumentoExtraido {
  const fields = result.documents?.[0]?.fields || {};
  const content = result.content || '';
  const rawEmisor = party(fields, 'Vendor');
  const rawCliente = party(fields, 'Customer');
  const { emisor, cliente } = enrichPartyCifs(rawEmisor, rawCliente, content, opts?.empresaCif);

  const tipo = resolveTipoDocumento(emisor.cif || '', cliente.cif || '', opts?.empresaCif);
  let importeTotal = num(fields.InvoiceTotal) || num(fields.AmountDue);
  let importeSinIva = num(fields.SubTotal);
  let impuestos = mapTaxDetails(fields);

  const reconciled = reconcileImportes(importeTotal, importeSinIva, impuestos, fields);
  importeSinIva = reconciled.base;
  impuestos = reconciled.impuestos;

  // Si aún no hay total pero sí base+cuotas
  if (importeTotal <= 0 && importeSinIva > 0 && impuestos.length > 0) {
    const cuotas = impuestos.reduce((a, t) => a + (Number(t.cuota_iva) || 0), 0);
    importeTotal = round2(importeSinIva + cuotas);
  }

  const fechaEmision = resolveFechaEmision(fields, content);
  const formaPago = str(fields.PaymentTerm);
  const fechaVencimiento = resolveFechaVencimiento(fields, content, fechaEmision, formaPago);
  const esMultiple = detectMultipleInvoicesInText(content);
  const confidence = result.documents?.[0]?.confidence;

  return {
    es_facturable: true,
    es_multiple: esMultiple,
    tipo_documento: tipo,
    categoria_principal: '',
    subcategoria: '',
    incidencia: false,
    descripcion_incidencia: '',
    empresa_emisora: emisor,
    cliente,
    documento: {
      numero_documento: str(fields.InvoiceId),
      fecha_emision: fechaEmision,
      fecha_vencimiento: fechaVencimiento,
      forma_pago: formaPago,
      comercial: '',
      importe_total: importeTotal,
      importe_sin_iva: importeSinIva,
      descuento_global: 0,
      base_no_sujeta: 0,
    },
    numero_documento: str(fields.InvoiceId),
    fecha_emision: fechaEmision,
    fecha_vencimiento: fechaVencimiento,
    importe_total: importeTotal,
    importe_sin_iva: importeSinIva,
    descuento_global: 0,
    base_no_sujeta: 0,
    moneda: fields.InvoiceTotal?.valueCurrency?.currencyCode || 'EUR',
    lineas: mapLineas(fields),
    totales_por_impuesto: impuestos,
    _extractor: 'azure-di',
    _azure_di_confidence: confidence ?? null,
  };
}

/**
 * Serializa los campos estructurados que Azure DI extrajo del documento
 * en un bloque de texto legible para inyectar al prompt del LLM en modo hybrid.
 *
 * NO es "verdad irrefutable" — es contexto de apoyo para que el LLM razone
 * con más información y no tenga que inferir totales desde el OCR crudo.
 */
export function buildAzureDiContext(result: AzureDiAnalyzeResult): string {
  const fields = result.documents?.[0]?.fields;
  if (!fields) return '';

  const lines: string[] = [];

  // — Identificación del documento —
  const invoiceId = str(fields.InvoiceId);
  if (invoiceId) lines.push(`Número de factura detectado: ${invoiceId}`);

  const invoiceDate = str(fields.InvoiceDate);
  if (invoiceDate) lines.push(`Fecha de emisión detectada: ${invoiceDate}`);

  const dueDate = str(fields.DueDate);
  if (dueDate) lines.push(`Fecha de vencimiento detectada: ${dueDate}`);

  // — Importes principales —
  const invoiceTotal = num(fields.InvoiceTotal) || num(fields.AmountDue);
  if (invoiceTotal > 0) lines.push(`Total de factura detectado: ${invoiceTotal.toFixed(2)} €`);

  const subTotal = num(fields.SubTotal);
  if (subTotal > 0) lines.push(`Base imponible (SubTotal) detectada: ${subTotal.toFixed(2)} €`);

  const totalTax = num(fields.TotalTax);
  if (totalTax > 0) lines.push(`Total de impuestos detectado: ${totalTax.toFixed(2)} €`);

  // — Desglose de IVA por tramos —
  const taxDetails = fields.TaxDetails?.valueArray;
  if (Array.isArray(taxDetails) && taxDetails.length > 0) {
    lines.push('Desglose de impuestos detectado:');
    taxDetails.forEach((item, i) => {
      const obj = item.valueObject || {};
      const rate = normalizeTaxRate(num(obj.Rate));
      const amount = num(obj.Amount);
      const base = num(obj.NetAmount);
      const desc = str(obj.Description);
      const parts = [`  Tramo ${i + 1}:`];
      if (rate > 0) parts.push(`Tipo ${rate}%`);
      if (base !== 0) parts.push(`Base ${base.toFixed(2)} €`);
      if (amount !== 0) parts.push(`Cuota ${amount.toFixed(2)} €`);
      if (desc) parts.push(`(${desc})`);
      lines.push(parts.join(' '));
    });
  }

  // — Entidades —
  const vendorName = str(fields.VendorName);
  const vendorTaxId = cleanCif(str(fields.VendorTaxId));
  if (vendorName || vendorTaxId) {
    lines.push(`Emisor/Proveedor detectado: ${[vendorName, vendorTaxId].filter(Boolean).join(' | CIF: ')}`);
  }

  const customerName = str(fields.CustomerName);
  const customerTaxId = cleanCif(str(fields.CustomerTaxId));
  if (customerName || customerTaxId) {
    lines.push(`Cliente/Receptor detectado: ${[customerName, customerTaxId].filter(Boolean).join(' | CIF: ')}`);
  }

  // — Moneda —
  const currency = fields.InvoiceTotal?.valueCurrency?.currencyCode || fields.AmountDue?.valueCurrency?.currencyCode;
  if (currency && currency !== 'EUR') lines.push(`Moneda detectada: ${currency}`);

  if (lines.length === 0) return '';

  return [
    '--- CONTEXTO ESTRUCTURADO (preanálisis de Azure Document Intelligence) ---',
    'Nota: estos valores son un preanálisis automático. Pueden tener errores.',
    '⚠️ ADVERTENCIA DE SIGNOS: Azure DI a veces elimina los signos negativos de los importes (bases, cuotas). Si un importe parece positivo aquí, VERIFICA en el texto OCR crudo si originalmente tenía un signo negativo (por ejemplo en abonos o devoluciones).',
    'Úsalos como punto de referencia para contrastar con el texto OCR, no como verdad absoluta.',
    '',
    ...lines,
    '--- FIN CONTEXTO ESTRUCTURADO ---',
  ].join('\n');
}

/** @deprecated usar mapAzureDiInvoiceToDocumentShape */
export const mapAzureDiInvoiceToGeminiShape = mapAzureDiInvoiceToDocumentShape;
