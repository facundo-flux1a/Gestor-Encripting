import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/user-service';
import db from '@/lib/db';
import type { RowDataPacket } from 'mysql2';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { convert as convertPdfToImg } from 'pdf-img-convert';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { writeFile, readFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';

const execFileAsync = promisify(execFile);

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

    // 2. Verificar permisos del usuario sobre el documento
    const [docCheck] = await db.query<RowDataPacket[]>(
      `SELECT d.id, d.ruta_archivo, d.file_hash, d.tipo_documento
       FROM documentos d
       JOIN empresas e ON d.id_de_empresa = e.id
       WHERE d.id = ? AND JSON_CONTAINS(e.id_de_usuario, CAST(? AS JSON))`,
      [documentId, user.id]
    );

    if (docCheck.length === 0) {
      console.error('❌ [THUMBNAIL] Documento no encontrado o sin permisos');
      return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 });
    }

    // 3. Obtener el archivo principal (de archivos_documento con fallback a documentos)
    const [archivos] = await db.query<RowDataPacket[]>(
      `SELECT hash_archivo, ruta_archivo, tipo_archivo 
       FROM archivos_documento 
       WHERE documento_id = ? AND ruta_archivo IS NOT NULL AND ruta_archivo != ''
       ORDER BY id ASC LIMIT 1`,
      [documentId]
    );

    const docBase = docCheck[0];
    let rutaArchivo = archivos[0]?.ruta_archivo || docBase.ruta_archivo;
    let hashArchivo = archivos[0]?.hash_archivo || docBase.file_hash;
    let tipoArchivo = archivos[0]?.tipo_archivo || docBase.tipo_documento || '';

    if (!rutaArchivo) {
      console.error('❌ [THUMBNAIL] El documento no tiene ruta_archivo registrada en la BD');
      return NextResponse.json({ error: 'Documento sin archivo adjunto' }, { status: 404 });
    }

    const hashFinal = hashArchivo || `doc_${documentId}`;

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

    const thumbnailKey = `thumbnails/thumbnail_${hashFinal}.jpg`;

    // 4. Comprobar si el thumbnail ya existe en MinIO y descargarlo
    try {
      const data = await s3Client.send(new GetObjectCommand({
        Bucket: MINIO_BUCKET_NAME,
        Key: thumbnailKey
      }));
      
      console.log(`✅ [THUMBNAIL] El thumbnail existe en MinIO. Devolviendo binario...`);
      
      const byteArray = await data.Body?.transformToByteArray();
      if (byteArray) {
        return new NextResponse(byteArray, {
          status: 200,
          headers: {
            'Content-Type': 'image/jpeg',
            'Cache-Control': 'no-cache, no-store, must-revalidate'
          }
        });
      }
    } catch (err: any) {
      if (err.name !== 'NoSuchKey' && err.$metadata?.httpStatusCode !== 404) {
        console.warn(`⚠️ [THUMBNAIL] Error al chequear MinIO:`, err);
      } else {
        console.log(`ℹ️ [THUMBNAIL] Thumbnail no existe en MinIO. Generando on-the-fly...`);
      }
    }

    // 5. Descargar el archivo original de MinIO o URL pública
    const isFullUrl = rutaArchivo.startsWith('http://') || rutaArchivo.startsWith('https://');
    const originalFileUrl = isFullUrl
      ? rutaArchivo
      : `${MINIO_ENDPOINT.replace(/\/$/, '')}/${MINIO_BUCKET_NAME}/${rutaArchivo}`;

    console.log(`📥 [THUMBNAIL] Descargando archivo original: ${originalFileUrl}`);
    
    const response = await fetch(originalFileUrl);
    if (!response.ok) {
      console.error(`❌ [THUMBNAIL] No se pudo descargar el original. Status: ${response.status}`);
      return NextResponse.json({ error: 'Error al descargar archivo original' }, { status: 500 });
    }

    const arrayBuffer = await response.arrayBuffer();
    const originalBuffer = Buffer.from(arrayBuffer);
    
    let imageBuffer: Buffer;
    const isPDF = tipoArchivo?.toLowerCase().includes('pdf') || rutaArchivo.toLowerCase().endsWith('.pdf');

    if (isPDF) {
      console.log(`📄 [THUMBNAIL] Generando miniatura de PDF (doc #${documentId})...`);

      // Intentar primero Ghostscript por rendimiento y calidad
      const tmpId = `thumb_${hashFinal}_${Date.now()}`;
      const tmpPdfPath = path.join(tmpdir(), `${tmpId}.pdf`);
      const tmpJpgPath = path.join(tmpdir(), `${tmpId}.jpg`);

      let gsSuccess = false;
      try {
        await writeFile(tmpPdfPath, originalBuffer);
        await execFileAsync('gs', [
          '-dNOPAUSE',
          '-dBATCH',
          '-dSAFER',
          '-sDEVICE=jpeg',
          '-dJPEGQ=85',
          '-dFirstPage=1',
          '-dLastPage=1',
          '-r150',
          `-sOutputFile=${tmpJpgPath}`,
          tmpPdfPath
        ]);
        imageBuffer = await readFile(tmpJpgPath);
        gsSuccess = true;
        console.log(`✅ [THUMBNAIL] Renderizado por Ghostscript exitoso (${imageBuffer.length} bytes)`);
      } catch (gsErr) {
        console.warn('⚠️ [THUMBNAIL] Ghostscript no disponible o falló. Reintentando con pdf-img-convert...', gsErr);
      } finally {
        await unlink(tmpPdfPath).catch(() => {});
        await unlink(tmpJpgPath).catch(() => {});
      }

      if (!gsSuccess) {
        const pdfImagePages = await convertPdfToImg(new Uint8Array(originalBuffer), {
          width: 800,
          page_numbers: [1]
        });
        if (!pdfImagePages || pdfImagePages.length === 0) {
          throw new Error('Fallo al renderizar el PDF');
        }
        imageBuffer = Buffer.from(pdfImagePages[0]);
      }
    } else if (
      tipoArchivo?.toLowerCase().includes('image') ||
      rutaArchivo.toLowerCase().match(/\.(jpg|jpeg|png|webp|gif)$/)
    ) {
      console.log(`🖼️ [THUMBNAIL] Archivo ya es una imagen. Reutilizando original...`);
      imageBuffer = originalBuffer;
    } else {
      console.error(`❌ [THUMBNAIL] Tipo de archivo no soportado: ${tipoArchivo}`);
      return NextResponse.json({ error: 'Tipo de archivo no soportado para vista previa' }, { status: 400 });
    }

    // 6. Subir el thumbnail generado a MinIO
    console.log(`📤 [THUMBNAIL] Subiendo nuevo thumbnail a MinIO en background: ${thumbnailKey}`);
    s3Client.send(new PutObjectCommand({
      Bucket: MINIO_BUCKET_NAME,
      Key: thumbnailKey,
      Body: imageBuffer,
      ContentType: 'image/jpeg',
      ACL: 'public-read',
    })).catch(err => console.error('❌ Error al subir thumbnail a MinIO:', err));

    console.log(`✅ [THUMBNAIL] Generación completada con éxito.`);
    
    return new NextResponse(imageBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    });

  } catch (error: any) {
    console.error('❌ [THUMBNAIL] Error general:', error);
    return NextResponse.json(
      { error: error.message || 'Error al generar la miniatura' },
      { status: 500 }
    );
  }
}
