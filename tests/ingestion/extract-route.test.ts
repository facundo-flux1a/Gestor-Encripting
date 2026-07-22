import { resolveExtractRoute } from '@/services/ingestion/extract-route';

describe('resolveExtractRoute', () => {
  it('persiste factura única facturable', () => {
    expect(
      resolveExtractRoute({
        raw: { es_facturable: true, es_multiple: false },
        mimeType: 'application/pdf',
      })
    ).toBe('persist');
  });

  it('sin es_facturable asume facturable (optimista)', () => {
    expect(
      resolveExtractRoute({
        raw: { es_multiple: false },
        mimeType: 'application/pdf',
      })
    ).toBe('persist');
  });

  it('reenvía no facturable', () => {
    expect(
      resolveExtractRoute({
        raw: { es_facturable: false, es_multiple: false },
        mimeType: 'application/pdf',
      })
    ).toBe('non-facturable');
  });

  it('PDF múltiple → paginate', () => {
    expect(
      resolveExtractRoute({
        raw: { es_facturable: true, es_multiple: true },
        mimeType: 'application/pdf',
      })
    ).toBe('paginate');
  });

  it('imagen múltiple → multi-image', () => {
    expect(
      resolveExtractRoute({
        raw: { es_facturable: true, es_multiple: true },
        mimeType: 'image/jpeg',
      })
    ).toBe('multi-image');
  });

  it('hijo paginado no re-enruta aunque diga multiple', () => {
    expect(
      resolveExtractRoute({
        raw: { es_facturable: true, es_multiple: true },
        mimeType: 'application/pdf',
        pageStart: 1,
        pageEnd: 2,
      })
    ).toBe('persist');
  });
});
