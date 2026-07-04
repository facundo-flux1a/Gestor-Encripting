import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/services/api-key-service';
import db from '@/lib/db';
import type { RowDataPacket } from 'mysql2';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { writeFile, readFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { upstash } from '@/lib/upstash';
import { getCurrentUser } from '@/services/user-service';

const execFileAsync = promisify(execFile);

export const dynamic = 'force-dynamic';

// --- CONFIGURACIÓN DE LÍMITES ---
const MAX_CONCURRENT_PER_KEY = 10;     // Max simultáneas
const MAX_REQUESTS_PER_MINUTE = 30;    // Max por minuto

/**
 * GET /api/v1/documents/[id]/thumbnail
 *
 * Autenticación (header obligatorio):
 *   X-Api-Key: flux_xxxxx
 *
 * Respuesta: Binario PNG (200 OK) con la primera página del documento.
 * Si la miniatura ya fue generada previamente, se sirve directamente desde MinIO.
 * Si no existe, se genera on-the-fly, se persiste en MinIO y se devuelve el binario.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    console.log('🖼️ [V1-THUMBNAIL] Iniciando petición...');

    // 1. Validar API Key o Sesión de Usuario
    const rawKey = request.headers.get('x-api-key') || '';
    let empresaId: number | null = null;
    let limitKeyId: string | number = '';
    let user: any = null;

    if (rawKey) {
      const authResult = await validateApiKey(rawKey);
      if (!authResult.valid || !authResult.empresa_id) {
        return NextResponse.json(
          { error: 'API Key inválida o revocada.' },
          { status: 401 }
        );
      }
      empresaId = authResult.empresa_id;
      limitKeyId = authResult.key_id || authResult.empresa_id;
    } else {
      user = await getCurrentUser();
      if (!user) {
        return NextResponse.json({ error: 'No autorizado. Se requiere X-Api-Key o sesión válida.' }, { status: 401 });
      }
      limitKeyId = `user_${user.id}`;
    }

    // --- RATE LIMITING Y CONCURRENCIA ---
    const rateLimitKey = `rl:thumb:rpm:${limitKeyId}`;
    const concurrencyKey = `rl:thumb:conc:${limitKeyId}`;
    
    // Incrementamos el contador de requests por minuto
    const currentRpm = await upstash.incr(rateLimitKey);
    if (currentRpm === 1) await upstash.expire(rateLimitKey, 60);
    
    if (currentRpm > MAX_REQUESTS_PER_MINUTE) {
      console.warn(`⚠️ [V1-THUMBNAIL] Rate limit excedido para key/usuario ${limitKeyId}`);
      return NextResponse.json(
        { error: 'Demasiadas peticiones. Por favor, espere un momento.' },
        { status: 429, headers: { 'Retry-After': '60' } }
      );
    }

    // Incrementamos el contador de concurrencia
    const currentConcurrent = await upstash.incr(concurrencyKey);
    if (currentConcurrent === 1) await upstash.expire(concurrencyKey, 60); // TTL de seguridad de 60s por si crashea

    if (currentConcurrent > MAX_CONCURRENT_PER_KEY) {
      console.warn(`⚠️ [V1-THUMBNAIL] Límite de concurrencia excedido para key/usuario ${limitKeyId}`);
      // Decrementamos inmediatamente porque no vamos a procesar esta request
      await upstash.decr(concurrencyKey);
      return NextResponse.json(
        { error: 'Demasiadas peticiones simultáneas. Por favor, procese en lotes más pequeños.' },
        { status: 429, headers: { 'Retry-After': '5' } }
      );
    }

    let isConcurrencyDecremented = false;
    const releaseConcurrency = async () => {
      if (!isConcurrencyDecremented) {
        await upstash.decr(concurrencyKey).catch(() => {});
        isConcurrencyDecremented = true;
      }
    };

    try {
      const params = await context.params;
      const documentId = parseInt(params.id, 10);
      if (isNaN(documentId)) {
        await releaseConcurrency();
        return NextResponse.json({ error: 'ID de documento inválido' }, { status: 400 });
      }

      // 2. Verificar que el documento pertenece a la empresa de la API Key o al usuario
      let docCheck: RowDataPacket[] = [];
      if (empresaId) {
        [docCheck] = await db.query<RowDataPacket[]>(
          `SELECT d.id FROM documentos d WHERE d.id = ? AND d.id_de_empresa = ?`,
          [documentId, empresaId]
        );
      } else if (user) {
        [docCheck] = await db.query<RowDataPacket[]>(
          `SELECT d.id FROM documentos d 
           JOIN empresas e ON d.id_de_empresa = e.id 
           WHERE d.id = ? AND JSON_CONTAINS(e.id_de_usuario, CAST(? AS JSON))`,
          [documentId, user.id]
        );
      }

      if (docCheck.length === 0) {
        console.error('❌ [V1-THUMBNAIL] Documento no encontrado o sin permisos');
        await releaseConcurrency();
        return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 });
      }

      // 3. Obtener el archivo principal y el hash del documento
      const [archivos] = await db.query<RowDataPacket[]>(
        `SELECT 
           a.hash_archivo, 
           a.ruta_archivo, 
           a.tipo_archivo,
           d.file_hash
         FROM archivos_documento a
         JOIN documentos d ON a.documento_id = d.id
         WHERE a.documento_id = ? 
         ORDER BY a.id ASC LIMIT 1`,
        [documentId]
      );

      if (archivos.length === 0) {
        await releaseConcurrency();
        return NextResponse.json({ error: 'El documento no tiene archivos' }, { status: 404 });
      }

      const archivo = archivos[0];
      console.log(`🔍 [V1-THUMBNAIL] Datos del archivo:`, JSON.stringify(archivo));

      // Usar file_hash de documentos como fallback si hash_archivo está vacío
      const hashFinal = archivo.hash_archivo || archivo.file_hash;
      if (!hashFinal || !archivo.ruta_archivo) {
        console.error(`❌ [V1-THUMBNAIL] Sin hash ni ruta válidos`);
        await releaseConcurrency();
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

      const thumbnailKey = `thumbnails/thumbnail_${hashFinal}.jpg`;

      // 4. Comprobar si el thumbnail ya existe en MinIO y devolverlo directamente
      try {
        const data = await s3Client.send(new GetObjectCommand({
          Bucket: MINIO_BUCKET_NAME,
          Key: thumbnailKey
        }));

        console.log(`✅ [V1-THUMBNAIL] Cache hit en MinIO. Devolviendo binario...`);
        const byteArray = await data.Body?.transformToByteArray();
        if (byteArray) {
          await releaseConcurrency();
          return new NextResponse(byteArray, {
            status: 200,
            headers: {
              'Content-Type': 'image/jpeg',
              'Cache-Control': 'public, max-age=2592000, immutable'
            }
          });
        }
      } catch (err: any) {
        if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
          console.log(`ℹ️ [V1-THUMBNAIL] No existe en MinIO. Generando on-the-fly...`);
        } else {
          console.warn(`⚠️ [V1-THUMBNAIL] Error al chequear MinIO:`, err);
        }
      }

      // 5. Generar el thumbnail
      // Detectar si ruta_archivo ya es una URL completa o un path relativo
    const isFullUrl = archivo.ruta_archivo.startsWith('http://') || archivo.ruta_archivo.startsWith('https://');
    const originalFileUrl = isFullUrl
      ? archivo.ruta_archivo
      : `${MINIO_ENDPOINT.replace(/\/$/, '')}/${MINIO_BUCKET_NAME}/${archivo.ruta_archivo}`;
    console.log(`📥 [V1-THUMBNAIL] Descargando archivo original: ${originalFileUrl}`);
    const response = await fetch(originalFileUrl);
    if (!response.ok) {
      console.error(`❌ [V1-THUMBNAIL] Error al descargar original. Status: ${response.status}`);
      return NextResponse.json({ error: 'Error al descargar archivo original' }, { status: 500 });
    }

    const arrayBuffer = await response.arrayBuffer();
    const originalBuffer = Buffer.from(arrayBuffer);

    let imageBuffer: Buffer;
    const isPDF = archivo.tipo_archivo?.toLowerCase().includes('pdf') || archivo.ruta_archivo.toLowerCase().endsWith('.pdf');

    if (isPDF) {
      console.log(`📄 [V1-THUMBNAIL] Convirtiendo PDF página 1 a PNG via Ghostscript...`);

      // Archivos temporales únicos para evitar colisiones entre requests
      const tmpId = `thumb_${hashFinal}_${Date.now()}`;
      const tmpPdfPath = path.join(tmpdir(), `${tmpId}.pdf`);
      const tmpJpgPath = path.join(tmpdir(), `${tmpId}.jpg`);

      try {
        // 1. Escribir el PDF al disco temporalmente
        await writeFile(tmpPdfPath, originalBuffer);

        // 2. Invocar Ghostscript: convierte solo la página 1 a JPEG de 150dpi
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

        // 3. Leer el JPEG generado
        imageBuffer = await readFile(tmpJpgPath);
        console.log(`✅ [V1-THUMBNAIL] Ghostscript OK. JPEG generado: ${imageBuffer.length} bytes`);
      } finally {
        // 4. Limpiar archivos temporales siempre (incluso si hubo error)
        await unlink(tmpPdfPath).catch(() => {});
        await unlink(tmpJpgPath).catch(() => {});
      }
    } else if (
      archivo.tipo_archivo?.toLowerCase().includes('image') ||
      archivo.ruta_archivo.toLowerCase().match(/\.(jpg|jpeg|png|webp|gif)$/)
    ) {
      console.log(`🖼️ [V1-THUMBNAIL] Archivo ya es imagen. Reutilizando buffer...`);
      imageBuffer = originalBuffer;
    } else {
      console.error(`❌ [V1-THUMBNAIL] Tipo no soportado: ${archivo.tipo_archivo}`);
      return NextResponse.json({ error: 'Tipo de archivo no soportado para vista previa' }, { status: 400 });
    }

    // 6. Persistir en MinIO en background (no bloqueamos la respuesta)
    console.log(`📤 [V1-THUMBNAIL] Subiendo thumbnail a MinIO en background: ${thumbnailKey}`);
    s3Client.send(new PutObjectCommand({
      Bucket: MINIO_BUCKET_NAME,
      Key: thumbnailKey,
      Body: imageBuffer,
      ContentType: 'image/jpeg',
      ACL: 'public-read',
    })).catch(err => console.error('❌ [V1-THUMBNAIL] Error al subir a MinIO:', err));

    console.log(`✅ [V1-THUMBNAIL] Generación completada. Devolviendo binario...`);

    // 7. Devolver el binario directamente (200 OK)
    await releaseConcurrency();
    return new NextResponse(imageBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=2592000, immutable'
      }
    });

    } catch (err) {
      await releaseConcurrency();
      throw err;
    }
  } catch (error) {
    console.error('❌ [V1-THUMBNAIL] Error general:', error);
    return NextResponse.json(
      { error: 'Error al generar la miniatura' },
      { status: 500 }
    );
  }
}
