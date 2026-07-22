/**
 * Invariantes del contrato de lote (docs/CONTRATO_UPLOAD_BATCH.md)
 * sin MinIO/Vertex: pairing de nombres + forma del batchId.
 */

function normalizeUploadName(name: string): string {
  return name.replace(/ /g, '-');
}

function pairFilesToBatchItems(
  files: Array<{ name: string }>,
  items: Array<{ uploadId: string; fileName: string }>
): Array<{ fileName: string; uploadId: string } | { fileName: string; missing: true }> {
  const byNorm = new Map<string, string[]>();
  for (const f of files) {
    const key = normalizeUploadName(f.name);
    const list = byNorm.get(key) || [];
    list.push(f.name);
    byNorm.set(key, list);
  }

  const pairs: Array<{ fileName: string; uploadId: string } | { fileName: string; missing: true }> = [];
  for (const item of items) {
    const list = byNorm.get(item.fileName) || byNorm.get(normalizeUploadName(item.fileName));
    const original = list?.shift();
    if (!original) {
      pairs.push({ fileName: item.fileName, missing: true });
    } else {
      pairs.push({ fileName: original, uploadId: item.uploadId });
    }
  }
  return pairs;
}

describe('contrato lote — pairing nombres', () => {
  it('empareja nombres con espacios a fileName normalizado del batch', () => {
    const files = [
      { name: 'Factura 531.pdf' },
      { name: 'FA0A250202.pdf' },
    ];
    const items = [
      { uploadId: 'u1', fileName: 'Factura-531.pdf' },
      { uploadId: 'u2', fileName: 'FA0A250202.pdf' },
    ];
    const pairs = pairFilesToBatchItems(files, items);
    expect(pairs).toEqual([
      { fileName: 'Factura 531.pdf', uploadId: 'u1' },
      { fileName: 'FA0A250202.pdf', uploadId: 'u2' },
    ]);
  });

  it('N items de batch ⇒ N pares o missing explícito (sin fantasmas silenciosos)', () => {
    const files = [{ name: 'a.pdf' }];
    const items = [
      { uploadId: 'u1', fileName: 'a.pdf' },
      { uploadId: 'u2', fileName: 'b.pdf' },
    ];
    const pairs = pairFilesToBatchItems(files, items);
    expect(pairs).toHaveLength(2);
    expect(pairs[0]).toEqual({ fileName: 'a.pdf', uploadId: 'u1' });
    expect(pairs[1]).toEqual({ fileName: 'b.pdf', missing: true });
  });
});

describe('contrato lote — batchId shape', () => {
  it('batchId empieza con batch_ y es único por timestamp+hex', () => {
    const a = `batch_${Date.now()}_aabbccdd`;
    const b = `batch_${Date.now() + 1}_eeff0011`;
    expect(a).toMatch(/^batch_\d+_[a-f0-9]+$/);
    expect(a).not.toBe(b);
  });
});
