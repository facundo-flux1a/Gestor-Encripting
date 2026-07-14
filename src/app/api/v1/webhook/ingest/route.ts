import { NextResponse } from 'next/server';
import connection, { dbName } from '@/lib/db';
import { ingestionQueue, IngestionJobData } from '@/lib/queue';

/**
 * POST /api/v1/webhook/ingest
 *
 * Recibe el payload desde n8n tras la lectura de un email y su subida a S3.
 * Valida, registra en actividad y encola el job en BullMQ.
 * 
 * Header esperado: Authorization: Bearer <CRON_SECRET>
 */
export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization');
    const secret = process.env.CRON_SECRET;

    if (!secret || authHeader !== `Bearer ${secret}`) {
      console.warn('⚠️ [WEBHOOK] Intento de acceso no autorizado a /api/v1/webhook/ingest');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 });
    }

    const {
      text, // S3 path
      empresaId,
      fileHash,
      cif,
      uploadId,
      fechaSubida,
      mail_de_carga,
      nombre_documento,
      nombreEmpresa,
      recargo
    } = body;

    if (!text || !empresaId || !uploadId || !nombre_documento) {
      return NextResponse.json({ error: 'Faltan parámetros requeridos (text, empresaId, uploadId, nombre_documento)' }, { status: 400 });
    }

    console.log(`[WEBHOOK] Recibido payload de n8n para ${nombre_documento} (Upload ID: ${uploadId})`);

    // 1. Calcular tipo de archivo
    const fileExtension = nombre_documento.toLowerCase().split('.').pop() || '';
    const mimeTypeMap: Record<string, string> = {
      pdf: 'application/pdf',
      zip: 'application/zip',
      rar: 'application/x-rar-compressed',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
    };
    const mimeType = mimeTypeMap[fileExtension] || 'application/octet-stream';
    
    let normalizedFileType = fileExtension;
    if (['zip', 'rar', 'pdf', 'jpeg', 'png'].includes(fileExtension)) {
      normalizedFileType = fileExtension;
    } else if (fileExtension === 'jpg') {
      normalizedFileType = 'jpeg';
    } else {
      normalizedFileType = 'unknown';
    }

    // 2. Comprobar si existe duplicado
    let isDuplicate = false;
    if (fileHash) {
      try {
        const [rows] = await connection.query(
          `SELECT file_hash, numero_documento as file_name, fecha_creacion as uploaded_at 
           FROM documentos 
           WHERE file_hash = ? AND id_de_empresa = ?
           ORDER BY fecha_creacion DESC
           LIMIT 1`,
          [fileHash, empresaId]
        );
        const results = rows as any[];
        if (results.length > 0) {
          isDuplicate = true;
          console.warn(`[WEBHOOK] ❌ DUPLICADO DETECTADO: ${nombre_documento}`);
        }
      } catch (err) {
        console.error('[WEBHOOK] Error al verificar duplicados:', err);
      }
    }

    // 3. Crear registro de actividad inicial
    try {
      await connection.query(
        `INSERT INTO ${dbName}.actividad 
          (upload_id, parent_upload_id, id_de_empresa, documento_nombre, documento_tipo, status, step, progress, mensaje)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          uploadId,
          null, // parentUploadId
          empresaId,
          nombre_documento,
          normalizedFileType,
          isDuplicate ? 'Fallido' : 'iniciando',
          isDuplicate ? 'Verificación de duplicados' : 'Iniciando el flujo',
          0,
          isDuplicate ? '❌ Archivo duplicado. Ya fue subido anteriormente.' : 'Archivo recibido desde correo, preparando para procesamiento',
        ]
      );
    } catch (err) {
      console.error('[WEBHOOK] Error al insertar actividad:', err);
    }

    if (isDuplicate) {
      return NextResponse.json({ success: false, message: 'Archivo duplicado.' });
    }

    // 4. Actualizar actividad con filePath y fileHash (como hace upload-service)
    try {
      await connection.query(
        `UPDATE ${dbName}.actividad SET file_path = ?, file_hash = ?, cif = ? WHERE upload_id = ?`,
        [text, fileHash || null, cif || null, uploadId]
      );
    } catch (err) {
      console.warn(`[WEBHOOK] Error al hacer update de actividad para ${uploadId}:`, err);
    }

    // 5. Construir Public URL para el archivo S3
    const MINIO_ENDPOINT = process.env.MINIO_PUBLIC_ENDPOINT || process.env.MINIO_ENDPOINT || 'https://minio.allbase.com.ar';
    const MINIO_BUCKET_NAME = process.env.MINIO_BUCKET_NAME || 'gestor-documental';
    const publicUrl = `${MINIO_ENDPOINT.replace(/\/$/, '')}/${MINIO_BUCKET_NAME}/${text}`;

    // 6. Encolar en BullMQ
    const jobData: IngestionJobData = {
      text: text, // S3 path
      empresaId: String(empresaId),
      cif: cif || '',
      nombreEmpresa: nombreEmpresa || '',
      recargo: recargo === 'true' || recargo === true,
      fileHash: fileHash || '',
      uploadId,
      parentUploadId: uploadId,
      fileName: nombre_documento,
      originalFileName: nombre_documento,
      fileSize: 0, // No lo tenemos por webhook directamente a menos que lo pasen, pero no corta el flujo principal.
      publicUrl,
      isCompressedFile: ['zip', 'rar'].includes(normalizedFileType),
      mimeType,
      normalizedFileType,
      fileExtension,
      fechaSubida: fechaSubida || new Date().toISOString(),
      origen: 'correo',
    };

    console.log(`[WEBHOOK] 📡 Encolando en BullMQ (uploadId: ${uploadId})...`);
    await ingestionQueue.add(`ingest-${uploadId}`, jobData, { jobId: `ingest-${uploadId}` });

    return NextResponse.json({ success: true, message: `Archivo ${nombre_documento} encolado correctamente.` });

  } catch (error: any) {
    console.error('❌ [WEBHOOK] Error interno:', error);
    return NextResponse.json({ error: 'Error interno del servidor', details: error.message }, { status: 500 });
  }
}
