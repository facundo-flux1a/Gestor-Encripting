import JSZip from 'jszip';
import {
  archiveChildStorageKey,
  detectArchiveChildType,
  deriveSplitDocumentIdentity,
  extractArchiveEntries,
} from '@/services/ingestion/archive';

async function zipOf(entries: Array<[string, Buffer | string]>): Promise<Buffer> {
  const zip = new JSZip();
  for (const [name, content] of entries) zip.file(name, content);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

describe('ingesta de ZIP/RAR — contrato de expansión', () => {
  it('no fusiona facturas con el mismo nombre en carpetas distintas', async () => {
    const archive = await zipOf([
      ['enero/Factura 001.pdf', '%PDF-1.7 enero'],
      ['febrero/Factura 001.pdf', '%PDF-1.7 febrero'],
    ]);

    const result = await extractArchiveEntries(archive, 'zip', 'upload_parent');
    const accepted = result.entries.filter((entry) => !entry.rejectionReason);

    expect(accepted).toHaveLength(2);
    expect(accepted.map((entry) => entry.fileName)).toEqual([
      'enero/Factura 001.pdf',
      'febrero/Factura 001.pdf',
    ]);
    expect(new Set(accepted.map((entry) => entry.uploadId)).size).toBe(2);
    expect(new Set(accepted.map((entry) => entry.fileHash)).size).toBe(2);
  });

  it('es idempotente: el mismo ZIP genera los mismos ids de hijos', async () => {
    const archive = await zipOf([
      ['Factura A.pdf', '%PDF-1.7 A'],
      ['Factura B.pdf', '%PDF-1.7 B'],
    ]);

    const first = await extractArchiveEntries(archive, 'zip', 'upload_parent');
    const second = await extractArchiveEntries(archive, 'zip', 'upload_parent');

    expect(first.entries.map((entry) => entry.uploadId)).toEqual(second.entries.map((entry) => entry.uploadId));
    expect(first.entries.map((entry) => entry.fileHash)).toEqual(second.entries.map((entry) => entry.fileHash));
  });

  it('extrae un ZIP anidado y conserva su procedencia', async () => {
    const nested = await zipOf([['factura_interior.pdf', '%PDF-1.7 interior']]);
    const archive = await zipOf([['recibidos.zip', nested]]);

    const result = await extractArchiveEntries(archive, 'zip', 'upload_parent');
    const accepted = result.entries.filter((entry) => !entry.rejectionReason);

    expect(result.nestedArchives).toBe(1);
    expect(accepted).toHaveLength(1);
    expect(accepted[0].originalFileName).toBe('recibidos.zip/factura_interior.pdf');
  });

  it('no confunde un DOCX/XLSX con un ZIP anidado', async () => {
    const fakeDocx = await zipOf([['word/document.xml', '<document>Factura</document>']]);
    const archive = await zipOf([['factura.docx', fakeDocx]]);
    const result = await extractArchiveEntries(archive, 'zip', 'upload_parent');

    expect(result.nestedArchives).toBe(0);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].fileName).toBe('factura.docx');
    expect(result.entries[0].normalizedFileType).toBe('word');
  });

  it('ignora metadatos del sistema pero deja visibles los archivos inválidos', async () => {
    const archive = await zipOf([
      ['__MACOSX/._Factura.pdf', 'metadata'],
      ['.DS_Store', 'metadata'],
      ['nota.txt', 'no es factura'],
    ]);

    const result = await extractArchiveEntries(archive, 'zip', 'upload_parent');

    expect(result.ignoredEntries).toBe(2);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].fileName).toBe('nota.txt');
    expect(result.entries[0].rejectionReason).toMatch(/no compatible/i);
  });

  it('detecta el formato real aunque el nombre no tenga extensión', async () => {
    const archive = await zipOf([['factura_sin_extension', '%PDF-1.7 contenido']]);
    const result = await extractArchiveEntries(archive, 'zip', 'upload_parent');
    const entry = result.entries[0];

    expect(entry.rejectionReason).toBeUndefined();
    expect(entry.normalizedFileType).toBe('pdf');
    expect(entry.mimeType).toBe('application/pdf');
    expect(detectArchiveChildType(Buffer.from('%PDF-1.7'), 'otro.bin')).toEqual({
      type: 'pdf',
      mime: 'application/pdf',
    });
  });

  it('rechaza rutas que intentarían salir del ZIP (zip-slip)', async () => {
    const archive = await zipOf([['../fuera.pdf', '%PDF-1.7 contenido']]);
    const result = await extractArchiveEntries(archive, 'zip', 'upload_parent');

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].rejectionReason).toMatch(/ruta.*segura/i);
  });

  it('falla de forma explícita si el ZIP padre está corrupto', async () => {
    await expect(
      extractArchiveEntries(Buffer.from('esto no es un zip'), 'zip', 'upload_parent')
    ).rejects.toThrow(/ZIP inválido|corrupto/i);
  });

  it('limita un contenedor enorme sin descomprimirlo completo', async () => {
    const archive = await zipOf([
      ['a.pdf', '%PDF-1.7 A'],
      ['b.pdf', '%PDF-1.7 B'],
    ]);
    const result = await extractArchiveEntries(archive, 'zip', 'upload_parent', { maxEntries: 1 });

    expect(result.entries.filter((entry) => !entry.rejectionReason)).toHaveLength(1);
    expect(result.entries.some((entry) => /máximo de 1 documentos/i.test(entry.rejectionReason || ''))).toBe(true);
  });

  it('genera una clave de MinIO aislada por empresa, padre e hijo', async () => {
    const archive = await zipOf([['carpeta/Factura 001.pdf', '%PDF-1.7 contenido']]);
    const [entry] = (await extractArchiveEntries(archive, 'zip', 'upload_parent')).entries;

    expect(archiveChildStorageKey('115', 'upload_parent', entry)).toBe(
      `archivos/115/upload_parent/children/${entry.uploadId}/Factura_001.pdf`
    );
  });

  it('mantiene estable el hash de cada página dividida al reintentar', () => {
    const input = {
      parentUploadId: 'upload_parent',
      parentFileHash: 'a'.repeat(64),
      empresaId: '117',
      pageStart: 42,
      pageEnd: 43,
      index: 41,
    };
    const first = deriveSplitDocumentIdentity(input);
    const retry = deriveSplitDocumentIdentity(input);
    const nextPage = deriveSplitDocumentIdentity({ ...input, pageStart: 44, pageEnd: 44, index: 42 });

    expect(first).toEqual(retry);
    expect(first.fileHash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.fileHash).not.toBe(nextPage.fileHash);
  });
});
