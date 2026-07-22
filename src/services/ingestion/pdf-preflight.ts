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
export function resolvePreflight(buffer: Buffer, mimeType?: string | null): PreflightResult {
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
