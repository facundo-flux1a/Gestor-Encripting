import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/user-service';
import db from '@/lib/db';
import type { RowDataPacket } from 'mysql2';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { convert as convertPdfToImg } from 'pdf-img-convert';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    console.log('🖼️ [THUMBNAIL] Iniciando petición...');

    // 1. Validar autenticación
    const user = await getCurrentUser();
    if (!user) {
      console.warn('⚠️ [THUMBNAIL] No hay usuario autenticado');
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const params = await context.params;
    const documentId = parseInt(params.id, 10);

    if (isNaN(documentId)) {
      return NextResponse.json({ error: 'ID de documento inválido' }, { status: 400 });
    }

    // 2. Verificar que el documento pertenece a una empresa del usuario
    const [docCheck] = await db.query<RowDataPacket[]>(
      `SELECT d.id 
       FROM documentos d
       JOIN empresas e ON d.id_de_empresa = e.id
       WHERE d.id = ? AND JSON_CONTAINS(e.id_de_usuario, CAST(? AS JSON))`,
      [documentId, user.id]
    );

    if (docCheck.length === 0) {
      console.error('❌ [THUMBNAIL] Documento no encontrado o sin permisos');
      return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 });
    }

    // 3. Obtener el archivo principal asociado al documento
    const [archivos] = await db.query<RowDataPacket[]>(
      `SELECT hash_archivo, ruta_archivo, tipo_archivo 
       FROM archivos_documento 
       WHERE documento_id = ? 
       ORDER BY id ASC LIMIT 1`,
      [documentId]
    );

    if (archivos.length === 0) {
      console.error('❌ [THUMBNAIL] El documento no tiene archivos asociados');
      return NextResponse.json({ error: 'El documento no tiene archivos' }, { status: 404 });
    }

    const archivo = archivos[0];
    if (!archivo.hash_archivo || !archivo.ruta_archivo) {
      console.error('❌ [THUMBNAIL] Archivo inválido (sin ruta o hash)');
      return NextResponse.json({ error: 'Archivo inválido' }, { status: 400 });
    }

    const MINIO_ENDPOINT = process.env.MINIO_PUBLIC_ENDPOINT || process.env.MINIO_ENDPOINT || 'https://minio.allbase.com.ar';
    const MINIO_BUCKET_NAME = process.env.MINIO_BUCKET_NAME || 'flux1a';
    const MINIO_ACCESS_KEY = process.env.MINIO_ACCESS_KEY;
    const MINIO_SECRET_KEY = process.env.MINIO_SECRET_KEY;

    if (!MINIO_ACCESS_KEY || !MINIO_SECRET_KEY) {
      throw new Error('Configuración de MinIO incompleta.');
    }

    const s3Client = new S3Client({
      region: process.env.MINIO_REGION || 'us-east-1',
      endpoint: MINIO_ENDPOINT,
      credentials: {
        accessKeyId: MINIO_ACCESS_KEY,
        secretAccessKey: MINIO_SECRET_KEY,
      },
      forcePathStyle: true,
    });

    const thumbnailKey = `thumbnails/thumbnail_${archivo.hash_archivo}.png`;

    // 4. Comprobar si el thumbnail ya existe en MinIO y descargarlo
    try {
      const getObjectParams = {
        Bucket: MINIO_BUCKET_NAME,
        Key: thumbnailKey
      };
      const data = await s3Client.send(new GetObjectCommand(getObjectParams));
      
      console.log(`✅ [THUMBNAIL] El thumbnail existe en MinIO. Devolviendo binario...`);
      
      // Convertir el stream a Uint8Array
      const byteArray = await data.Body?.transformToByteArray();
      if (byteArray) {
        return new NextResponse(byteArray, {
          status: 200,
          headers: {
            'Content-Type': 'image/png',
            'Cache-Control': 'public, max-age=2592000, immutable'
          }
        });
      }
    } catch (err: any) {
      if (err.name !== 'NoSuchKey' && err.$metadata?.httpStatusCode !== 404) {
        console.warn(`⚠️ [THUMBNAIL] Error inesperado al chequear MinIO:`, err);
        // Continuamos para intentar generarlo
      } else {
        console.log(`ℹ️ [THUMBNAIL] Thumbnail no existe en MinIO. Generando on-the-fly...`);
      }
    }

    // 5. El thumbnail NO existe, hay que generarlo.
    const originalFileUrl = `${MINIO_ENDPOINT.replace(/\/$/, '')}/${MINIO_BUCKET_NAME}/${archivo.ruta_archivo}`;
    console.log(`📥 [THUMBNAIL] Descargando archivo original: ${originalFileUrl}`);
    
    const response = await fetch(originalFileUrl);
    if (!response.ok) {
      console.error(`❌ [THUMBNAIL] No se pudo descargar el original. Status: ${response.status}`);
      return NextResponse.json({ error: 'Error al descargar archivo original' }, { status: 500 });
    }

    const arrayBuffer = await response.arrayBuffer();
    const originalBuffer = Buffer.from(arrayBuffer);
    
    let imageBuffer: Buffer;
    const isPDF = archivo.tipo_archivo?.toLowerCase().includes('pdf') || archivo.ruta_archivo.toLowerCase().endsWith('.pdf');

    if (isPDF) {
      console.log(`📄 [THUMBNAIL] Archivo es PDF. Convirtiendo página 1 a PNG...`);
      // Convertir PDF a imagen (solo página 1, ancho 800)
      const pdfImagePages = await pdf2img.convert(new Uint8Array(originalBuffer), {
        width: 800,
        page_numbers: [1]
      });
      
      if (!pdfImagePages || pdfImagePages.length === 0) {
         throw new Error('Fallo al renderizar el PDF');
      }
      imageBuffer = Buffer.from(pdfImagePages[0]);
    } else if (
      archivo.tipo_archivo?.toLowerCase().includes('image') ||
      archivo.ruta_archivo.toLowerCase().match(/\.(jpg|jpeg|png|webp|gif)$/)
    ) {
      console.log(`🖼️ [THUMBNAIL] Archivo ya es una imagen. Reutilizando original...`);
      imageBuffer = originalBuffer;
    } else {
      console.error(`❌ [THUMBNAIL] Tipo de archivo no soportado para thumbnail: ${archivo.tipo_archivo}`);
      return NextResponse.json({ error: 'Tipo de archivo no soportado para vista previa' }, { status: 400 });
    }

    // 6. Subir el nuevo thumbnail a MinIO para futuras peticiones
    console.log(`📤 [THUMBNAIL] Subiendo nuevo thumbnail a MinIO en background: ${thumbnailKey}`);
    // Usamos el cliente S3 para subir la imagen, pero no esperamos que termine para responder
    s3Client.send(new PutObjectCommand({
      Bucket: MINIO_BUCKET_NAME,
      Key: thumbnailKey,
      Body: imageBuffer,
      ContentType: 'image/png',
      ACL: 'public-read',
    })).catch(err => console.error('❌ Error al subir thumbnail a MinIO en bg:', err));

    console.log(`✅ [THUMBNAIL] Generación completada. Devolviendo binario...`);
    
    // 7. Devolver el buffer binario directamente (200 OK)
    return new NextResponse(imageBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=2592000, immutable'
      }
    });

  } catch (error) {
    console.error('❌ [THUMBNAIL] Error general:', error);
    return NextResponse.json(
      { error: 'Error al generar la miniatura' },
      { status: 500 }
    );
  }
}
