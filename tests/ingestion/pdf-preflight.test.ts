import {
  estimatePdfPageCount,
  countInvoiceHeaderHits,
  hasMultiDocumentFileNameSignal,
  resolvePreflight,
} from '@/services/ingestion/pdf-preflight';

describe('pdf-preflight', () => {
  const prev = process.env.EXTRACT_ROUTE_V2;

  afterEach(() => {
    if (prev === undefined) delete process.env.EXTRACT_ROUTE_V2;
    else process.env.EXTRACT_ROUTE_V2 = prev;
  });

  it('estimatePdfPageCount null si no es PDF', () => {
    expect(estimatePdfPageCount(Buffer.from('hello'))).toBeNull();
  });

  it('estimatePdfPageCount cuenta /Type /Page', () => {
    const body = '%PDF-1.4\n/Type /Page\n/Type /Page\n/Type /Pages\n';
    expect(estimatePdfPageCount(Buffer.from(body))).toBe(2);
  });

  it('countInvoiceHeaderHits detecta cabeceras', () => {
    const buf = Buffer.from('%PDF Factura Nº A-1 xxx Factura No. B-2');
    expect(countInvoiceHeaderHits(buf)).toBeGreaterThanOrEqual(2);
  });

  it('alta confianza → paginate', () => {
    process.env.EXTRACT_ROUTE_V2 = '1';
    const body =
      '%PDF-1.4\n/Type /Page\n/Type /Page\nFactura Nº 001\nFactura Nº 002\n';
    const r = resolvePreflight(Buffer.from(body), 'application/pdf');
    expect(r.decision).toBe('paginate');
    expect(r.confidence).toBe('high');
  });

  it('1 página → extract', () => {
    process.env.EXTRACT_ROUTE_V2 = '1';
    const body = '%PDF-1.4\n/Type /Page\nFactura Nº 001\n';
    const r = resolvePreflight(Buffer.from(body), 'application/pdf');
    expect(r.decision).toBe('extract');
  });

  it('un lote nombrado se pagina aunque su texto PDF esté comprimido', () => {
    process.env.EXTRACT_ROUTE_V2 = '1';
    const body = '%PDF-1.4\n/Type /Page\n/Type /Page\n';
    const r = resolvePreflight(Buffer.from(body), 'application/pdf', '02_lote_200_facturas.pdf');
    expect(r.decision).toBe('paginate');
    expect(r.reason).toBe('filename_multi_signal pages=2');
  });

  it('no pagina por nombre de factura común sin una señal de lote', () => {
    expect(hasMultiDocumentFileNameSignal('Factura_2026_001.pdf')).toBe(false);
    expect(hasMultiDocumentFileNameSignal('grupo_50_facturas.pdf')).toBe(true);
  });

  it('EXTRACT_ROUTE_V2=0 fuerza extract', () => {
    process.env.EXTRACT_ROUTE_V2 = '0';
    const body =
      '%PDF-1.4\n/Type /Page\n/Type /Page\nFactura Nº 001\nFactura Nº 002\n';
    expect(resolvePreflight(Buffer.from(body)).decision).toBe('extract');
  });
});
