import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ filename: string }> }
) {
  try {
    // ✅ Await params en Next.js 15
    const params = await context.params;
    const filename = params.filename;
    
    if (!filename) {
      return NextResponse.json(
        { error: 'Nombre de archivo no proporcionado' },
        { status: 400 }
      );
    }

    console.log('📥 [serve-file] Solicitando archivo:', filename);
    
    // ✅ Construir URL de MinIO con path correcto: archivos/{filename}
    const baseUrl = 'http://flux1a-minio-32adec-164-68-127-171.traefik.me:9000';
    const bucketName = 'gestor-documental';
    
    // Si el filename ya incluye "archivos/", usarlo tal cual
    // Si no, agregarlo automáticamente
    const filePath = filename.startsWith('archivos/') 
      ? filename 
      : `archivos/${filename}`;
    
    const minioUrl = `${baseUrl}/${bucketName}/${filePath}`;
    
    console.log('🔗 [serve-file] Fetching desde MinIO:', minioUrl);
    
    // Obtener archivo desde MinIO
    const response = await fetch(minioUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/pdf, application/octet-stream',
      },
    });
    
    if (!response.ok) {
      console.error('❌ [serve-file] Error desde MinIO:', response.status, response.statusText);
      return NextResponse.json(
        { error: 'Archivo no encontrado en el almacenamiento' },
        { status: 404 }
      );
    }
    
    // Obtener Content-Type original (puede ser PDF u otro)
    const contentType = response.headers.get('Content-Type') || 'application/octet-stream';
    
    // Convertir a buffer
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    console.log('✅ [serve-file] Archivo obtenido:', {
      size: buffer.length,
      type: contentType,
      filename: filePath
    });
    
    // Extraer nombre del archivo para la descarga
    const downloadFilename = filename.split('/').pop() || 'archivo.pdf';
    
    // Devolver archivo como respuesta
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${downloadFilename}"`,
        'Content-Length': buffer.length.toString(),
        'Cache-Control': 'public, max-age=3600', // Cache por 1 hora
      },
    });
  } catch (error) {
    console.error('❌ [serve-file] Error inesperado:', error);
    return NextResponse.json(
      { error: 'Error al obtener el archivo' },
      { status: 500 }
    );
  }
}