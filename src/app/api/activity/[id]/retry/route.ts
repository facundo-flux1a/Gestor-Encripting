import { NextResponse } from 'next/server';
import connection from '@/lib/db';
import { getSession } from '@/services/auth-service';
import crypto from 'crypto';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const activityId = params.id;

    // 1️⃣ Obtener actividad original
    const [rows] = await connection.query(
      `SELECT 
        a.*,
        e.CIF
       FROM erp49.actividad a
       INNER JOIN erp49.empresas e ON a.id_de_empresa = e.id
       INNER JOIN erp49.usuarios u ON e.id_de_usuario = u.id
       WHERE a.id = ? AND u.id = ?`,
      [activityId, session.userId]
    );

    const activities = rows as any[];

    if (activities.length === 0) {
      return NextResponse.json({ error: 'Actividad no encontrada' }, { status: 404 });
    }

    const originalActivity = activities[0];

    // 2️⃣ Validar que el status permita retry
    const allowedStatuses = ['Fallido', 'Interrumpido', 'Error'];
    if (!allowedStatuses.some(s => originalActivity.status.toLowerCase().includes(s.toLowerCase()))) {
      return NextResponse.json({ 
        error: `No se puede reintentar. Estado actual: ${originalActivity.status}`,
        allowedStatuses 
      }, { status: 400 });
    }

    // 3️⃣ Parsear webhook_payload
    let webhookPayload: any;
    try {
      webhookPayload = JSON.parse(originalActivity.webhook_payload);
    } catch (error) {
      return NextResponse.json({ 
        error: 'Error al leer datos originales del archivo. El payload no es válido.' 
      }, { status: 500 });
    }

    // 4️⃣ Generar nuevo upload_id
    const timestamp = Date.now();
    const randomSuffix = crypto.randomBytes(4).toString('hex');
    const newUploadId = `upload_${timestamp}_retry_${randomSuffix}`;

    console.log('🔄 [Retry] Iniciando reintento:', {
      activityId,
      originalUploadId: originalActivity.upload_id,
      newUploadId,
      fileName: originalActivity.documento_nombre,
    });

    // 5️⃣ Crear nueva entrada en actividad (el retry)
    await connection.query(
      `INSERT INTO erp49.actividad (
        upload_id,
        parent_upload_id,
        id_de_empresa,
        documento_nombre,
        documento_tipo,
        status,
        step,
        progress,
        mensaje,
        file_path,
        file_hash,
        cif,
        retry_count,
        webhook_payload,
        is_retry,
        original_upload_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newUploadId,
        originalActivity.parent_upload_id, // Mantener el parent si existe
        originalActivity.id_de_empresa,
        originalActivity.documento_nombre,
        originalActivity.documento_tipo,
        'Iniciando',
        'Reintentando procesamiento',
        0,
        `Reintento #${(originalActivity.retry_count || 0) + 1}`,
        originalActivity.file_path,
        originalActivity.file_hash,
        originalActivity.cif,
        (originalActivity.retry_count || 0) + 1,
        originalActivity.webhook_payload,
        true, // is_retry
        originalActivity.upload_id, // original_upload_id
      ]
    );

    // 6️⃣ Preparar payload para N8N
    const retryPayload = {
      ...webhookPayload,
      
      // 🔑 FLAGS DE RETRY
      isRetry: true,
      isIndividualRetry: true,
      
      // 🆔 IDs
      uploadId: newUploadId,
      originalUploadId: originalActivity.upload_id,
      
      // 📄 Info del archivo
      fileName: originalActivity.documento_nombre,
      text: originalActivity.file_path, // Path en MinIO
      fileHash: originalActivity.file_hash,
      
      // 🏢 Empresa
      empresaId: originalActivity.id_de_empresa.toString(),
      cif: originalActivity.cif,
      
      // 📊 Metadata
      retryCount: (originalActivity.retry_count || 0) + 1,
      retryReason: 'manual_retry',
      originalError: originalActivity.error_detalle,
      
      // 🔗 URL del webhook (la misma del original)
      webhookUrl: webhookPayload.webhookUrl || 
        'https://agent.flux1a.com.ar/webhook/bbdefd63-f86a-4590-a52a-37a891accbf3334',
    };

    console.log('📤 [Retry] Enviando a N8N:', {
      newUploadId,
      fileName: retryPayload.fileName,
      filePath: retryPayload.text,
      retryCount: retryPayload.retryCount,
    });

    // 7️⃣ Llamar al webhook de N8N
    const webhookUrl = retryPayload.webhookUrl;
    const webhookResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(retryPayload),
    });

    if (!webhookResponse.ok) {
      const errorText = await webhookResponse.text();
      console.error('❌ [Retry] Error en webhook:', errorText);
      
      // Actualizar la actividad con el error
      await connection.query(
        `UPDATE erp49.actividad 
         SET status = 'Fallido', 
             mensaje = 'Error al reintentar',
             error_detalle = ?
         WHERE upload_id = ?`,
        [`Error del webhook: ${errorText}`, newUploadId]
      );
      
      throw new Error(`Error al reintentar: ${webhookResponse.status}`);
    }

    console.log('✅ [Retry] Webhook llamado exitosamente');

    return NextResponse.json({
      success: true,
      message: `Reintento iniciado exitosamente`,
      newUploadId,
      retryCount: retryPayload.retryCount,
      fileName: originalActivity.documento_nombre,
    });

  } catch (error: any) {
    console.error('❌ [Retry] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Error al reintentar la actividad' },
      { status: 500 }
    );
  }
}