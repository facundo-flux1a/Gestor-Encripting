import { NextRequest, NextResponse } from 'next/server';
import connection, { dbName } from '@/lib/db';
import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/services/email-service';
import { getUnauthorizedSenderEmailHtml, getRejectedFilesEmailHtml } from '@/services/ingestion/email-templates';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { ingestionQueue, notificationQueue, IngestionJobData } from '@/lib/queue';
import { hashField } from '@/lib/encryption';

// Configuración S3
const MINIO_ENDPOINT = process.env.MINIO_INTERNAL_ENDPOINT || process.env.MINIO_ENDPOINT || process.env.MINIO_PUBLIC_ENDPOINT || 'https://minio.allbase.com.ar';
const MINIO_PUBLIC_URL = process.env.MINIO_PUBLIC_ENDPOINT || MINIO_ENDPOINT;
const s3Client = new S3Client({
  region: process.env.MINIO_REGION || 'us-east-1',
  endpoint: MINIO_ENDPOINT,
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY || '',
    secretAccessKey: process.env.MINIO_SECRET_KEY || ''
  },
  forcePathStyle: true,
});
const MINIO_BUCKET_NAME = process.env.MINIO_BUCKET_NAME || 'gestor-documental';

export async function POST(req: NextRequest) {
  try {
    // 1. Autenticación con Bearer Token
    const authHeader = req.headers.get('authorization');
    const secret = process.env.CRON_SECRET;
    
    if (!secret || authHeader !== `Bearer ${secret}`) {
      console.warn('⚠️ [MailParser] Intento de acceso no autorizado');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
    }

    const {
      emailFrom,
      emailSubject,
      emailDate,
      files,
      isZipContainer,
      extractedFiles,
      content,
      filename: zipFilename,
      uploadId: parentUploadId
    } = body;

    if (!emailFrom) {
      return NextResponse.json({ error: 'emailFrom es requerido' }, { status: 400 });
    }

    console.log(`\n📨 [MailParser] Recibido payload de: ${emailFrom} | Asunto: ${emailSubject || 'N/A'}`);

    // Extraer solo el email limpio (ej. "Nombre <correo@dominio.com>" -> "correo@dominio.com")
    const cleanEmailMatch = emailFrom.match(/<([^>]+)>/);
    const cleanEmail = cleanEmailMatch ? cleanEmailMatch[1].trim().toLowerCase() : emailFrom.trim().toLowerCase();
    
    const mailHash = hashField(cleanEmail);

    // 2. Lookup de Empresa
    const empresaPrisma = await prisma.empresas.findFirst({
      where: { mail_de_carga_hash: mailHash },
      select: { id: true, CIF: true, recargo: true, nombre_de_empresa: true }
    });

    if (!empresaPrisma) {
      console.warn(`[MailParser] ❌ Remitente no autorizado: ${cleanEmail}`);
      
      // Chequear throttling en `correos_inhabilitados`
      const [throttled] = await connection.query<any[]>(
        `SELECT id, fecha_creacion FROM correos_inhabilitados 
         WHERE email = ? AND fecha_creacion > DATE_SUB(NOW(), INTERVAL 1 HOUR)
         ORDER BY fecha_creacion DESC LIMIT 1`,
        [cleanEmail]
      );

      if (throttled.length === 0) {
        // Enviar correo de rechazo
        const dateObj = new Date(emailDate || Date.now());
        const dateStr = dateObj.toLocaleDateString('es-ES');
        const timeStr = dateObj.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
        
        const html = getUnauthorizedSenderEmailHtml(
          cleanEmail,
          emailSubject || 'Sin Asunto',
          isZipContainer ? 1 : (files?.length || 0),
          dateStr,
          timeStr,
          `${dateStr} a las ${timeStr}`
        );

        await sendEmail({
          to: cleanEmail,
          subject: '⚠️ Remitente No Autorizado - Sistema Documental',
          html
        });
        
        // Registrar para no hacer spam
        await connection.query(
          `INSERT INTO correos_inhabilitados (email, fecha_creacion) VALUES (?, NOW())`,
          [cleanEmail]
        );
      } else {
        console.log(`[MailParser] 🕒 Correo de rechazo ya enviado a ${cleanEmail} recientemente (ignorado).`);
      }

      // Retornar 200 para que el MailParser no reintente
      return NextResponse.json({ success: true, message: 'Remitente no autorizado. Rechazado limpiamente.' });
    }

    const empresaId = String(empresaPrisma.id);
    const cif = empresaPrisma.CIF || '';
    const recargo = !!empresaPrisma.recargo;
    const nombreEmpresa = empresaPrisma.nombre_de_empresa || '';
    
    console.log(`[MailParser] ✅ Empresa identificada: ${nombreEmpresa} (ID: ${empresaId})`);

    const rejectedFiles: { filename: string; reason: string; time: string }[] = [];
    const acceptedUploadIds: string[] = [];
    const now = new Date();
    const timestamp = `${now.getFullYear()}_${(now.getMonth() + 1).toString().padStart(2, '0')}_${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}_${now.getMinutes().toString().padStart(2, '0')}_${now.getSeconds().toString().padStart(2, '0')}`;

    // Helper para verificar duplicado y encolar
    const processFile = async (fileUploadId: string, filename: string, fileHash: string, fileBuffer: Buffer, mimeType: string, isCompressed = false) => {
      // Verificar duplicado
      const [rows] = await connection.query<any[]>(
        `SELECT file_hash, numero_documento FROM documentos 
         WHERE file_hash = ? AND id_de_empresa = ? LIMIT 1`,
        [fileHash, empresaId]
      );
      
      if (rows.length > 0) {
        console.warn(`[MailParser] ⚠️ Archivo duplicado ignorado: ${filename}`);
        rejectedFiles.push({
          filename,
          reason: 'El archivo ya fue subido anteriormente a esta empresa.',
          time: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
        });
        // Registrar en fallos (silencioso si falla - tabla opcional)
        try {
          await connection.query(
            `INSERT INTO fallos_de_mails (email, asunto, fecha, error) VALUES (?, ?, NOW(), ?)`,
            [cleanEmail, emailSubject || 'Sin asunto', `Duplicado: ${filename}`]
          );
        } catch (e: any) {
          console.warn(`[MailParser] ⚠️ No se pudo registrar fallo (ignorado): ${e.message}`);
        }
        return false; // saltar
      }

      // Normalizar nombre
      const cleanFileName = filename.replace(/ /g, '-').replace(/[^a-zA-Z0-9.-]/g, '');
      const baseName = cleanFileName.includes('.') ? cleanFileName.substring(0, cleanFileName.lastIndexOf('.')) : cleanFileName;
      const ext = cleanFileName.includes('.') ? cleanFileName.substring(cleanFileName.lastIndexOf('.')) : '';
      const uniqueFileName = `${baseName}_${timestamp}${ext}`;
      // Aislar por empresa y uploadId evita sobrescribir adjuntos que llegan
      // en el mismo segundo con igual nombre (caso frecuente en correos/ZIP).
      const filePath = `archivos/${empresaId}/${fileUploadId}/${uniqueFileName}`;

      // Subir a S3
      console.log(`[MailParser] ☁️ Subiendo ${filename} a MinIO...`);
      await s3Client.send(new PutObjectCommand({
        Bucket: MINIO_BUCKET_NAME,
        Key: filePath,
        Body: fileBuffer,
        ContentType: mimeType,
        ACL: 'public-read',
      }));

      const publicUrl = `${MINIO_PUBLIC_URL.replace(/\/$/, '')}/${MINIO_BUCKET_NAME}/${filePath}`;
      
      const fileExt = ext.replace('.', '').toLowerCase();
      const typeMap: Record<string, string> = {
        zip: 'zip', rar: 'rar', pdf: 'pdf',
        jpg: 'jpeg', jpeg: 'jpeg', png: 'png', webp: 'webp',
        tif: 'tiff', tiff: 'tiff', bmp: 'bmp',
        doc: 'word', docx: 'word', xls: 'excel', xlsx: 'excel',
      };
      const normalizedFileType = typeMap[fileExt] || 'unknown';
      // Algunos proveedores de correo mandan un lote mixto (files[]) con un
      // ZIP adjunto sin activar isZipContainer. La extensión/MIME sigue siendo
      // la fuente de verdad para que ese adjunto también se expanda.
      const isArchive = isCompressed || normalizedFileType === 'zip' || normalizedFileType === 'rar';

      // Crear actividad (INSERT IGNORE para ser idempotente en reintentos del MailParser)
      await connection.query(
        `INSERT IGNORE INTO ${dbName}.actividad 
         (upload_id, id_de_empresa, documento_nombre, documento_tipo, status, step, progress, mensaje, file_path, file_hash, cif)
         VALUES (?, ?, ?, ?, 'iniciando', 'Archivo recibido desde correo', 0, 'Preparando para procesamiento', ?, ?, ?)`,
        [fileUploadId, empresaId, cleanFileName, normalizedFileType, filePath, fileHash, cif]
      );

      // Encolar en BullMQ
      const jobData: IngestionJobData = {
        text: filePath,
        empresaId,
        cif,
        nombreEmpresa,
        recargo,
        fileHash,
        uploadId: fileUploadId,
        parentUploadId: fileUploadId,
        fileName: cleanFileName,
        originalFileName: filename,
        fileSize: fileBuffer.length,
        publicUrl,
        isCompressedFile: isArchive,
        mimeType,
        normalizedFileType,
        fileExtension: fileExt,
        fechaSubida: new Date().toISOString(),
        origen: 'correo',
      };

      await ingestionQueue.add(`ingest-${fileUploadId}`, jobData, { jobId: `ingest-${fileUploadId}` });
      acceptedUploadIds.push(fileUploadId);
      console.log(`[MailParser] 🚀 Job encolado para: ${filename}`);
      return true;
    };

    // 3. Procesar payload
    if (isZipContainer) {
      console.log(`[MailParser] 📦 Procesando ZIP container: ${zipFilename}`);
      const buffer = Buffer.from(content, 'base64');
      await processFile(parentUploadId, zipFilename, body.hash, buffer, 'application/zip', true);
    } else if (files && Array.isArray(files)) {
      console.log(`[MailParser] 📄 Procesando batch de ${files.length} archivos normales`);
      for (const file of files) {
        const buffer = Buffer.from(file.content, 'base64');
        await processFile(file.uploadId, file.filename, file.hash, buffer, file.mimeType, false);
      }
    }

    // 4. Encolar notificación diferida (15 mins)
    if (acceptedUploadIds.length > 0 || rejectedFiles.length > 0) {
      console.log(`[MailParser] 📧 Encolando job de notificación diferida para ${cleanEmail}`);
      
      const notifData = {
        parentUploadId,
        uploadIds: acceptedUploadIds,
        emailFrom: cleanEmail,
        empresaId,
        nombreEmpresa,
        batchTimestamp: timestamp,
        earlyRejectedFiles: rejectedFiles.length > 0 ? rejectedFiles : undefined
      };

      // Guardamos para que el worker de notificación los recoja 15 mins después
      await notificationQueue.add(`notify-${parentUploadId}`, notifData, { 
        jobId: `notify-${parentUploadId}`,
        delay: 15 * 60 * 1000 // 15 minutos en milisegundos
      });
    }

    return NextResponse.json({ success: true, message: 'Batch procesado exitosamente.' });

  } catch (error: any) {
    console.error('❌ [MailParser] Error interno:', error);
    return NextResponse.json({ error: 'Error interno del servidor', details: error.message }, { status: 500 });
  }
}
