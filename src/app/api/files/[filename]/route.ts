import { NextRequest, NextResponse } from 'next/server';
import { getFileBuffer } from '@/lib/s3-client';

const MIME_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  avif: 'image/avif',
  txt: 'text/plain',
  csv: 'text/csv',
  zip: 'application/zip',
  rar: 'application/x-rar-compressed',
  json: 'application/json',
};

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ filename: string }> }
) {
  const requestId = Math.random().toString(36).substring(7);
  try {
    const params = await context.params;
    const rawFilename = params.filename;

    if (!rawFilename) {
      console.error(`[${requestId}] ❌ [serve-file] Sin nombre de archivo`);
      return NextResponse.json(
        { error: 'Nombre de archivo no proporcionado' },
        { status: 400 }
      );
    }

    const decodedFilename = decodeURIComponent(rawFilename).trim();
    
    // Si viene el query param 'path', usamos la ruta S3 completa (para archivos dentro de carpetas como zip-children/)
    const pathParam = request.nextUrl.searchParams.get('path');
    const keyToFetch = pathParam ? decodeURIComponent(pathParam).trim() : decodedFilename;

    console.log(`[${requestId}] 📥 [serve-file] Solicitando archivo autenticado: ${keyToFetch}`);

    // Descargar usando el helper privado de S3 (soporta tanto raíz como archivos/ y rutas completas)
    const { buffer, foundKey } = await getFileBuffer(keyToFetch);

    console.log(`[${requestId}] ✅ [serve-file] Archivo descargado de MinIO (${foundKey}, ${buffer.length} bytes)`);

    // Detección de tipo MIME
    const ext = foundKey.split('.').pop()?.toLowerCase() || '';
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    // Determinar si es descarga forzada o visualización embebida (inline)
    const shouldDownload = request.nextUrl.searchParams.get('download') === 'true' ||
      request.nextUrl.searchParams.get('download') === '1';

    const cleanFilename = foundKey.split('/').pop() || decodedFilename;
    const dispositionType = shouldDownload ? 'attachment' : 'inline';

    const headers = new Headers();
    headers.set('Content-Type', contentType);
    headers.set('Content-Disposition', `${dispositionType}; filename="${cleanFilename.replace(/"/g, '')}"; filename*=UTF-8''${encodeURIComponent(cleanFilename)}`);
    headers.set('Content-Length', buffer.length.toString());
    headers.set('Cache-Control', 'public, max-age=3600, s-maxage=3600');
    headers.set('Access-Control-Allow-Origin', '*');

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers,
    });

  } catch (error: any) {
    if (error.name === 'NoSuchKey' || error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      console.warn(`[${requestId}] ⚠️ [serve-file] Archivo no encontrado en MinIO`);
      return NextResponse.json(
        { error: 'Archivo no encontrado' },
        { status: 404 }
      );
    }

    console.error(`[${requestId}] ❌ [serve-file] Error crítico:`, error);
    return NextResponse.json(
      { error: 'Error interno al procesar el archivo' },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    },
  });
}