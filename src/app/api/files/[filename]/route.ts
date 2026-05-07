import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ filename: string }> }
) {
  const requestId = Math.random().toString(36).substring(7);
  try {
    const params = await context.params;
    const filename = params.filename;

    if (!filename) {
      console.error(`[${requestId}] ❌ [serve-file] Sin nombre de archivo`);
      return NextResponse.json(
        { error: 'Nombre de archivo no proporcionado' },
        { status: 400 }
      );
    }

    // Usar variables de entorno para mayor seguridad y flexibilidad
    const baseUrl = (process.env.MINIO_ENDPOINT || 'http://flux1a-minio-32adec-164-68-127-171.traefik.me:9000').replace(/\/$/, '');
    const bucketName = process.env.MINIO_BUCKET_NAME || 'gestor-documental';

    console.log(`[${requestId}] 📥 [serve-file] Solicitando: ${filename}`);

    const filePath = filename.startsWith('archivos/')
      ? filename
      : `archivos/${filename}`;

    const minioUrl = `${baseUrl}/${bucketName}/${filePath}`;

    console.log(`[${requestId}] 🔗 [serve-file] Conectando a MinIO: ${minioUrl}`);

    let response;
    try {
      response = await fetch(minioUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/pdf, application/octet-stream',
        },
      });
    } catch (error) {
      console.warn(`[${requestId}] ⚠️ [serve-file] Error al conectar con MinIO primario:`, error);
    }

    // 🔥 FALLBACK LOGIC
    if (!response || !response.ok) {
      const fallbackBaseUrl = 'https://minio.allbase.com.ar';
      const fallbackUrl = `${fallbackBaseUrl}/${bucketName}/${filePath}`;
      console.log(`[${requestId}] 🔄 [serve-file] Reintentando con fallback: ${fallbackUrl}`);
      
      try {
        response = await fetch(fallbackUrl, {
          method: 'GET',
          headers: {
            'Accept': 'application/pdf, application/octet-stream',
          },
        });
      } catch (fallbackError) {
        console.error(`[${requestId}] ❌ [serve-file] Error en fallback MinIO:`, fallbackError);
      }
    }

    if (!response || !response.ok) {
      console.error(`[${requestId}] ❌ [serve-file] Error final MinIO:`, response?.status || 'No Response');
      return NextResponse.json(
        { error: `Archivo no encontrado (${response?.status || 'Error de conexión'})` },
        { status: 404 }
      );
    }

    const contentType = response.headers.get('Content-Type') || 'application/octet-stream';
    const contentLength = response.headers.get('Content-Length');

    console.log(`[${requestId}] 📦 [serve-file] Headers recibidos:`, {
      type: contentType,
      length: contentLength
    });

    // Extraer nombre limpio para la descarga
    const downloadFilename = filename.split('/').pop() || 'archivo.pdf';

    // Implementar Streaming si es posible (Next.js 13+)
    // Esto es más eficiente que cargar todo en memoria
    if (response.body) {
      console.log(`[${requestId}] 🚀 [serve-file] Iniciando streaming de respuesta`);

      const headers = new Headers();
      headers.set('Content-Type', contentType);
      headers.set('Content-Disposition', `attachment; filename="${downloadFilename}"`);
      if (contentLength) headers.set('Content-Length', contentLength);
      headers.set('Cache-Control', 'public, max-age=3600');

      return new NextResponse(response.body, {
        status: 200,
        headers,
      });
    }

    // Fallback si no hay body readable (poco probable con fetch nativo)
    console.log(`[${requestId}] ⚠️ [serve-file] Usando fallback de Buffer`);
    const buffer = Buffer.from(await response.arrayBuffer());

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${downloadFilename}"`,
        'Content-Length': buffer.length.toString(),
        'Cache-Control': 'public, max-age=3600',
      },
    });

  } catch (error) {
    console.error(`[${requestId}] ❌ [serve-file] Error crítico:`, error);
    return NextResponse.json(
      { error: 'Error interno al procesar el archivo' },
      { status: 500 }
    );
  }
}