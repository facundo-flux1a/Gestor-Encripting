import { NextRequest, NextResponse } from 'next/server';
import { getFileBuffer, extractS3Key } from '@/lib/s3-client';

const MIME_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  avif: 'image/avif',
};

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  try {
    const params = await context.params;
    const path = params.path;

    if (!path || path.length === 0) {
      return new NextResponse('Path missing', { status: 400 });
    }

    const fullPath = path.join('/');
    const key = extractS3Key(fullPath);

    console.log(`📡 [ImageProxy] Descargando imagen autenticada desde MinIO: ${key}`);

    const { buffer, foundKey } = await getFileBuffer(key);

    const ext = foundKey.split('.').pop()?.toLowerCase() || 'png';
    const contentType = MIME_TYPES[ext] || 'image/png';

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${encodeURIComponent(foundKey.split('/').pop() || 'image')}"`,
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error: any) {
    if (error.name === 'NoSuchKey' || error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      console.warn('⚠️ [ImageProxy] Imagen no encontrada en MinIO');
      return new NextResponse('Image not found', { status: 404 });
    }
    console.error('❌ [ImageProxy] Error crítico:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
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
