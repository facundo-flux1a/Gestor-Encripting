/**
 * s3-client.ts — Helper centralizado para acceso autenticado a MinIO (bucket privado).
 *
 * Exporta:
 *   s3            → S3Client singleton configurado con credenciales del entorno
 *   MINIO_BUCKET  → Nombre del bucket desde env
 *   extractS3Key  → Extrae el S3 key de una URL absoluta o path relativo
 *   getFileBuffer → Descarga un archivo y devuelve Buffer (acceso autenticado)
 *   getPresignedUrl → URL firmada temporal (para servicios externos como pdftools)
 *   buildProxyUrl → URL del proxy interno /api/files/[filename]
 */

import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const ENDPOINT = (process.env.MINIO_PUBLIC_ENDPOINT || process.env.MINIO_ENDPOINT)!;
export const MINIO_BUCKET = process.env.MINIO_BUCKET_NAME!;

export const s3 = new S3Client({
  region: process.env.MINIO_REGION || 'us-east-1',
  endpoint: ENDPOINT,
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY!,
    secretAccessKey: process.env.MINIO_SECRET_KEY!,
  },
  forcePathStyle: true,
});

/**
 * Extrae el S3 key de una URL absoluta o path relativo.
 *
 * Ejemplos:
 *   "https://minio.allbase.com.ar/gestor-documental-2/archivos/foo.pdf" → "archivos/foo.pdf"
 *   "archivos/foo.pdf"  → "archivos/foo.pdf"
 *   "/archivos/foo.pdf" → "archivos/foo.pdf"
 */
export function extractS3Key(rawPath: string): string {
  if (!rawPath) return '';
  if (rawPath.startsWith('http://') || rawPath.startsWith('https://')) {
    try {
      const url = new URL(rawPath);
      const segments = url.pathname.replace(/^\//, '').split('/');
      segments.shift(); // quitar el nombre del bucket
      return segments.join('/');
    } catch {
      return rawPath;
    }
  }
  return rawPath.replace(/^\//, '');
}

/**
 * Descarga un archivo desde MinIO usando el SDK S3 autenticado.
 * Funciona con buckets privados (no necesita ACL public-read).
 *
 * @param key  El S3 key del objeto (e.g. "archivos/foo.pdf")
 */
export async function getFileBuffer(key: string): Promise<Buffer> {
  const response = await s3.send(
    new GetObjectCommand({ Bucket: MINIO_BUCKET, Key: key })
  );
  const stream = response.Body as NodeJS.ReadableStream;
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk instanceof Buffer ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/**
 * Genera una Presigned URL para que servicios externos (ej: pdftools)
 * puedan acceder temporalmente al archivo sin necesitar credenciales.
 *
 * @param key       El S3 key del objeto
 * @param expiresIn Segundos de validez (default: 900 = 15 min)
 */
export async function getPresignedUrl(key: string, expiresIn = 900): Promise<string> {
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: MINIO_BUCKET, Key: key }),
    { expiresIn }
  );
}

/**
 * Construye la URL del proxy interno de la app para servir un archivo.
 * Esta URL pasa por /api/files/[filename] que descarga autenticado desde S3.
 *
 * @param rawPath  URL absoluta de MinIO o path relativo (puede ser null/undefined)
 * @returns        URL del proxy (/api/files/...) o null si rawPath está vacío
 */
export function buildProxyUrl(rawPath: string | null | undefined): string | null {
  if (!rawPath) return null;
  const key = extractS3Key(rawPath);
  const filename = key.split('/').pop();
  if (!filename) return null;
  return `/api/files/${encodeURIComponent(filename)}`;
}
