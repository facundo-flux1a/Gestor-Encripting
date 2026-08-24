/**
 * Preflight local (sin LLM) para decidir extract vs paginate-first.
 * Conservador: solo "alta confianza" multi → paginate; ante duda → extract.
 */

export type PreflightDecision = 'extract' | 'paginate';

export interface PreflightResult {
  decision: PreflightDecision;
  confidence: 'high' | 'low';
  pageCount: number | null;
  invoiceHeaderHits: number;
  reason: string;
}

/**
 * Los exportadores contables suelen nombrar explícitamente a sus paquetes
 * ("lote_100_facturas", "grupo_50", "batch-invoices"). En PDFs escaneados la
 * capa de texto puede estar comprimida y no es visible con el chequeo local;
 * el nombre + más de una página es entonces una señal suficiente para enviar
 * directo al paginador, sin pedir al extractor que trate 300 facturas como una.
 */
export function hasMultiDocumentFileNameSignal(fileName?: string | null): boolean {
  if (!fileName) return false;
  return /(?:^|[_\s.-])(?:lote|batch|grupo|facturas|invoices|remesa)(?:[_\s.-]|$)/i.test(fileName);
}

/**
 * Estima páginas en un PDF born-digital contando objetos /Type /Page.
 * Escaneos raros pueden fallar → null (tratar como duda → extract).
 */
export function estimatePdfPageCount(buffer: Buffer): number | null {
  if (!buffer || buffer.length < 8) return null;
  const head = buffer.subarray(0, Math.min(8, buffer.length)).toString('latin1');
  if (!head.startsWith('%PDF')) return null;

  const text = buffer.toString('latin1');
  const pageObjs = text.match(/\/Type\s*\/Page(?!\s*s)/gi);
  if (pageObjs && pageObjs.length > 0) {
    return pageObjs.length;
  }
  // Fallback: /Count N en el árbol de páginas (toma el mayor razonable)
  const counts = [...text.matchAll(/\/Count\s+(\d+)/g)].map((m) => parseInt(m[1], 10));
  const max = counts.length ? Math.max(...counts) : 0;
  if (max > 0 && max < 5000) return max;
  return null;
}

/** Cabeceras tipicas de inicio de factura/albarán en capa texto */
export function countInvoiceHeaderHits(buffer: Buffer): number {
  const sample = buffer.toString('latin1').slice(0, Math.min(buffer.length, 2_000_000));
  // Normalizar escapes PDF básicos
  const plain = sample.replace(/\\[nrt]/g, ' ');
  const re =
    /(?:n[ºo°.]?\s*)?(?:factura|fact\.|invoice|albar[aá]n|abono|credit\s*note)\s*(?:n[ºo°.]?|no\.?|:)?\s*[A-Z0-9]/gi;
  const hits = plain.match(re);
  return hits ? hits.length : 0;
}

/**
 * Alta confianza multi solo si hay señales fuertes.
 * Flag EXTRACT_ROUTE_V2=0 desactiva paginate-first (siempre extract).
 */
export function resolvePreflight(
  buffer: Buffer,
  mimeType?: string | null,
  fileName?: string | null
): PreflightResult {
  const enabled = process.env.EXTRACT_ROUTE_V2 !== '0';
  if (!enabled) {
    return {
      decision: 'extract',
      confidence: 'low',
      pageCount: null,
      invoiceHeaderHits: 0,
      reason: 'EXTRACT_ROUTE_V2=0',
    };
  }

  const isPdf =
    !mimeType ||
    mimeType === 'application/pdf' ||
    mimeType.includes('pdf');

  if (!isPdf) {
    return {
      decision: 'extract',
      confidence: 'low',
      pageCount: null,
      invoiceHeaderHits: 0,
      reason: 'not_pdf',
    };
  }

  const pageCount = estimatePdfPageCount(buffer);
  const invoiceHeaderHits = countInvoiceHeaderHits(buffer);

  // Lotes con nombre explícito: cubre PDFs escaneados o con streams de texto
  // comprimidos, donde buscar "Factura" directamente en los bytes da 0 hits.
  if (pageCount != null && pageCount >= 2 && hasMultiDocumentFileNameSignal(fileName)) {
    return {
      decision: 'paginate',
      confidence: 'high',
      pageCount,
      invoiceHeaderHits,
      reason: `filename_multi_signal pages=${pageCount}`,
    };
  }

  // Alta confianza: >=2 páginas Y >=2 cabeceras de factura/albarán distintas en el texto
  if (pageCount != null && pageCount >= 2 && invoiceHeaderHits >= 2) {
    return {
      decision: 'paginate',
      confidence: 'high',
      pageCount,
      invoiceHeaderHits,
      reason: `high_confidence_multi pages=${pageCount} headers=${invoiceHeaderHits}`,
    };
  }

  return {
    decision: 'extract',
    confidence: 'low',
    pageCount,
    invoiceHeaderHits,
    reason:
      pageCount == null
        ? 'unknown_pages'
        : `doubt pages=${pageCount} headers=${invoiceHeaderHits}`,
  };
}
