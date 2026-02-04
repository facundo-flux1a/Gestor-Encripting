import { NextRequest, NextResponse } from 'next/server';

export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ path: string[] }> }
) {
    try {
        const { path } = await params;

        // Reconstruir la URL destino (MinIO)
        const { MINIO_ENDPOINT, MINIO_BUCKET_NAME } = process.env;
        // Nota: path es un array. El primer elemento podría ser el bucket si la URL del cliente lo incluye
        // En UploadDialog usamos: /s3-proxy/bucket/key...
        // params.path será ['bucket', 'key', ...]

        // Validar que tenemos endpoint
        if (!MINIO_ENDPOINT) {
            return new NextResponse('Configuration Error', { status: 500 });
        }

        const targetUrl = new URL(request.url);
        // Reemplazar host/protocol con el de MinIO, manteniendo el path y query string
        // Ojo: request.url es la URL completa del proxy (e.g. https://gestor.../s3-proxy/...)
        // Queremos construir: http://minio...:9000/bucket/key?query...

        const minioBase = MINIO_ENDPOINT.replace(/\/$/, '');
        const fullPath = path.join('/');
        const queryString = targetUrl.search;

        const destination = `${minioBase}/${fullPath}${queryString}`;

        console.log(`🔌 [Proxy] Redirigiendo a: ${destination}`);

        // Streaming del cuerpo de la petición hacia MinIO
        // request.body es un ReadableStream
        const response = await fetch(destination, {
            method: 'PUT',
            headers: {
                // Copiar cabeceras relevantes (Content-Type, Content-Length, etc)
                'Content-Type': request.headers.get('Content-Type') || 'application/octet-stream',
                'Content-Length': request.headers.get('Content-Length') || '',
            },
            body: request.body, // Piping del stream
            duplex: 'half', // Necesario para enviar body en fetch dentro de Node
        } as any);

        console.log(`🔌 [Proxy] Respuesta MinIO: ${response.status} ${response.statusText}`);

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ [Proxy] Error upstream:`, errorText);
            return new NextResponse(errorText, { status: response.status });
        }

        // Devolver respuesta (usualmente ETag)
        const responseHeaders = new Headers();
        if (response.headers.has('ETag')) {
            responseHeaders.set('ETag', response.headers.get('ETag')!);
        }

        return new NextResponse(null, {
            status: response.status,
            headers: responseHeaders,
        });

    } catch (error: any) {
        console.error('❌ [Proxy] Error interno:', error);
        return new NextResponse(`Internal Proxy Error: ${error.message}`, { status: 500 });
    }
}

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Aumentar timeout si es posible
