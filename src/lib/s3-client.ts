/**
 * s3-client.ts — Helper centralizado para acceso autenticado a MinIO (bucket privado).
 *
 * Exporta:
 *   getS3Client    → Retorna la instancia de S3Client singleton
 *   s3             → S3Client singleton configurado con credenciales del entorno
 *   getBucketName  → Retorna el nombre del bucket actual desde process.env
 *   extractS3Key   → Extrae el S3 key de una URL absoluta o path relativo
 *   getFileBuffer  → Descarga un archivo con fallback inteligente (raíz vs archivos/)
 *   getPresignedUrl → URL firmada temporal (para servicios externos como pdftools)
 *   buildProxyUrl  → URL del proxy interno /api/files/[filename]
 */

import { S3Client, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const ENDPOINT = (process.env.MINIO_PUBLIC_ENDPOINT || process.env.MINIO_ENDPOINT || 'https://minio.allbase.com.ar');

export function getBucketName(): string {
  return process.env.MINIO_BUCKET_NAME || 'gestor-documental';
}

export const MINIO_BUCKET = getBucketName();

export const s3 = new S3Client({
  region: process.env.MINIO_REGION || 'us-east-1',
  endpoint: ENDPOINT,
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY || '',
    secretAccessKey: process.env.MINIO_SECRET_KEY || '',
  },
  forcePathStyle: true,
});

/**
 * Extrae el S3 key de una URL absoluta o path relativo.
 *
 * Ejemplos:
 *   "https://minio.allbase.com.ar/gestor-documental/archivos/foo.pdf" → "archivos/foo.pdf"
 *   "https://minio.allbase.com.ar/gestor-documental/doc_123.pdf"      → "doc_123.pdf"
 *   "archivos/foo.pdf"                                               → "archivos/foo.pdf"
 */
export function extractS3Key(rawPath: string): string {
  if (!rawPath) return '';
  const trimmed = rawPath.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const url = new URL(trimmed);
      const segments = url.pathname.replace(/^\//, '').split('/');
      segments.shift(); // quitar el nombre del bucket
      return decodeURIComponent(segments.join('/'));
    } catch {
      return trimmed;
    }
  }
  const clean = decodeURIComponent(trimmed.replace(/^\//, ''));
  if (clean.startsWith('gestor-documental/')) {
    return clean.replace(/^gestor-documental\//, '');
  }
  if (clean.startsWith('gestor-documental-2/')) {
    return clean.replace(/^gestor-documental-2\//, '');
  }
  return clean;
}

/**
 * Descarga un archivo desde MinIO usando el SDK S3 autenticado.
 * Incluye fallback inteligente entre raíz y carpeta "archivos/" para soportar
 * tanto facturas de pdftools (en la raíz) como normales/legacy (en archivos/).
 */
export async function getFileBuffer(rawKey: string): Promise<{ buffer: Buffer; foundKey: string }> {
  const bucket = getBucketName();
  const key = extractS3Key(rawKey);

  // Lista de posibles ubicaciones a probar en orden
  const candidates = [key];
  if (key.startsWith('archivos/')) {
    candidates.push(key.replace(/^archivos\//, '')); // Probar en la raíz
  } else {
    candidates.push(`archivos/${key}`); // Probar adentro de archivos/
  }

  let lastError: any = null;

  for (const candidateKey of candidates) {
    try {
      const response = await s3.send(
        new GetObjectCommand({ Bucket: bucket, Key: candidateKey })
      );
      const stream = response.Body as NodeJS.ReadableStream;
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk instanceof Buffer ? chunk : Buffer.from(chunk));
      }
      return { buffer: Buffer.concat(chunks), foundKey: candidateKey };
    } catch (err: any) {
      lastError = err;
      if (err.name === 'NoSuchKey' || err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
        continue; // Probar siguiente candidato
      }
      throw err;
    }
  }

  throw lastError || new Error(`Archivo no encontrado en MinIO: ${key}`);
}

/**
 * Genera una Presigned URL para que servicios externos (ej: pdftools)
 * puedan acceder temporalmente al archivo sin necesitar credenciales.
 * Resuelve si el archivo está en la raíz o en archivos/.
 */
export async function getPresignedUrl(rawKey: string, expiresIn = 900): Promise<string> {
  const bucket = getBucketName();
  const key = extractS3Key(rawKey);

  // Resolver la key real verificando existencia
  let actualKey = key;
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    actualKey = key;
  } catch {
    if (!key.startsWith('archivos/')) {
      try {
        await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: `archivos/${key}` }));
        actualKey = `archivos/${key}`;
      } catch {}
    } else {
      const rootKey = key.replace(/^archivos\//, '');
      try {
        await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: rootKey }));
        actualKey = rootKey;
      } catch {}
    }
  }

  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: bucket, Key: actualKey }),
    { expiresIn }
  );
}

/**
 * Construye la URL del proxy interno de la app para servir un archivo.
 * Esta URL pasa por /api/files/[filename] que descarga autenticado desde S3.
 * Si el archivo está dentro de subcarpetas, preserva la ruta con el query param ?path=.
 */
export function buildProxyUrl(rawPath: string | null | undefined): string | null {
  if (!rawPath) return null;
  const key = extractS3Key(rawPath);
  if (!key) return null;

  const segments = key.split('/');
  const filename = segments[segments.length - 1];

  if (segments.length > 1) {
    return `/api/files/${encodeURIComponent(filename)}?path=${encodeURIComponent(key)}`;
  }

  return `/api/files/${encodeURIComponent(filename)}`;
}
