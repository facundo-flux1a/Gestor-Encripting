/**
 * src/lib/file-hash.ts
 *
 * Funciones de hash y generación de IDs para el sistema de ingesta.
 * Replica exactamente las fórmulas que usa n8n en sus Code nodes y MySQL queries.
 */
import crypto from 'crypto';

/**
 * Calcula el hash SHA-256 de un archivo (del buffer físico).
 * Usado para detección de duplicados por archivo idéntico.
 */
export function computeFileHash(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Calcula el file_hash de un documento extraído.
 * FÓRMULA EXACTA DE n8n: SHA256(uploadId + NUMERO_DOCUMENTO + empresaId)
 *
 * Este hash es lo que n8n usaba en sus SET @file_hash = SHA2(CONCAT(...), 256)
 * dentro de las queries de "Insertar documento*".
 * Se usa para detectar duplicados del mismo documento en la misma empresa.
 */
export function computeDocumentHash(
  uploadId: string,
  numeroDocumento: string,
  empresaId: string
): string {
  return crypto
    .createHash('sha256')
    .update(`${uploadId}${numeroDocumento}${empresaId}`)
    .digest('hex');
}

/**
 * Genera un uploadId individual para un documento hijo dentro de un lote.
 * FÓRMULA EXACTA DE n8n: parentUploadId + "_doc_" + randomHex(8)
 *
 * Ejemplo: "upload_1783519699631_pr8xpv2z5_doc_a3f1b2c4"
 */
export function generateChildUploadId(parentUploadId: string): string {
  const suffix = crypto.randomBytes(4).toString('hex');
  return `${parentUploadId}_doc_${suffix}`;
}

/**
 * Detecta el tipo de archivo basándose en el MIME type y/o la extensión.
 * Replica la lógica del nodo If inicial de n8n que revisa fileExtension.
 */
export function detectFileType(
  mimeType: string,
  fileName: string
): 'zip' | 'rar' | 'pdf' | 'image' | 'unknown' {
  const mime = mimeType.toLowerCase();
  const ext = fileName.split('.').pop()?.toLowerCase() || '';

  if (mime === 'application/zip' || mime === 'application/x-zip-compressed' || ext === 'zip') return 'zip';
  if (mime === 'application/x-rar-compressed' || mime === 'application/vnd.rar' || mime === 'application/x-rar' || ext === 'rar') return 'rar';
  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (mime.startsWith('image/')) return 'image';

  return 'unknown';
}

/**
 * Normaliza el nombre de archivo: reemplaza espacios por guiones.
 * Replica la función normalizeFileName() de upload-service.ts.
 * Garantiza URLs limpias sin codificación %20.
 */
export function normalizeFileName(fileName: string): string {
  return fileName.replace(/ /g, '-');
}
