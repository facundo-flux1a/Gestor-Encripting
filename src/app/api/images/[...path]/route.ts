import { NextRequest, NextResponse } from 'next/server';

export async function GET(
    request: NextRequest,
    { params }: { params: { path: string[] } }
) {
    try {
        const { path } = await params;

        if (!path || path.length === 0) {
            return new NextResponse('Path missing', { status: 400 });
        }

        const bucketName = process.env.MINIO_BUCKET_NAME || 'gestor-documental';
        // Usar el endpoint de .env como primario (ya que lo actualizamos al estable)
        const primaryBaseUrl = (process.env.MINIO_PUBLIC_ENDPOINT || process.env.MINIO_ENDPOINT || 'https://minio.allbase.com.ar').replace(/\/$/, '');
        const secondaryBaseUrl = 'http://flux1a-minio-32adec-164-68-127-171.traefik.me:9000';

        // Reconstruir el path. Si el primer elemento es el bucket, lo removemos para no duplicarlo si ya está en el endpoint
        // Pero en este caso, la URL suele ser ENDPOINT/BUCKET/PATH
        // El path que recibimos es [bucket, ...archivo]
        const fullPath = path.join('/');
        
        const tryFetch = async (baseUrl: string) => {
            const url = `${baseUrl}/${fullPath}`;
            console.log(`📡 [ImageProxy] Intentando cargar desde: ${url}`);
            try {
                const res = await fetch(url, { next: { revalidate: 3600 } });
                if (res.ok) return res;
            } catch (e) {
                console.warn(`⚠️ [ImageProxy] Error en ${baseUrl}:`, e);
            }
            return null;
        };

        // Intentar primero con el primario (debería ser el estable ahora)
        let response = await tryFetch(primaryBaseUrl);

        // Si falla, intentar con el secundario (el viejo)
        if (!response) {
            console.log('🔄 [ImageProxy] Reintentando con base secundaria...');
            response = await tryFetch(secondaryBaseUrl);
        }

        // Si sigue fallando, intentar con el fallback explícito que pidió el usuario
        if (!response) {
            console.log('🔄 [ImageProxy] Reintentando con fallback explícito (minio.allbase.com.ar)...');
            response = await tryFetch('https://minio.allbase.com.ar');
        }

        if (!response || !response.ok) {
            console.error('❌ [ImageProxy] No se pudo obtener la imagen de ningún origen');
            return new NextResponse('Image not found', { status: 404 });
        }

        const contentType = response.headers.get('content-type') || 'image/png';
        const buffer = await response.arrayBuffer();

        return new NextResponse(buffer, {
            headers: {
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=3600, s-maxage=3600',
            },
        });
    } catch (error) {
        console.error('❌ [ImageProxy] Error crítico:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
