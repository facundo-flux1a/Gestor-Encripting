import { NextResponse } from 'next/server';
import connection from '@/lib/db';
import { getSession } from '@/services/auth-service';
import { RowDataPacket } from 'mysql2';

const WEBHOOK_URL = process.env.MICROSERVICE_WEBHOOK_URL || 'https://agent.flux1a.com.ar/webhook/bbdefd63-f86a-4590-a52a-37a891accbf333';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const conn = await connection.getConnection();

  try {
    await conn.beginTransaction();

    const session = await getSession();

    if (!session) {
      await conn.rollback();
      conn.release();
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const activityId = params.id;

    // 1️⃣ Obtener datos de la actividad desde la BD
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT 
        a.upload_id,
        a.id_de_empresa,
        a.file_path,
        a.file_hash,
        a.cif,
        a.documento_nombre,
        a.retry_count
      FROM erp49.actividad a
      INNER JOIN erp49.empresas e ON a.id_de_empresa = e.id
      WHERE a.id = ? AND JSON_CONTAINS(e.id_de_usuario, CAST(? AS JSON))`,
      [activityId, session.userId]
    );

    if (!rows || rows.length === 0) {
      await conn.rollback();
      conn.release();
      return NextResponse.json(
        { error: 'Actividad no encontrada' },
        { status: 404 }
      );
    }

    const activity = rows[0];

    console.log('🔄 [RETRY] Datos obtenidos de la BD:', {
      activityId,
      uploadId: activity.upload_id,
      hasFilePath: !!activity.file_path,
      hasFileHash: !!activity.file_hash,
      hasCif: !!activity.cif,
      empresaId: activity.id_de_empresa,
      retryCount: activity.retry_count
    });

    // 2️⃣ Validar que tengamos los datos mínimos necesarios
    if (!activity.file_path || !activity.file_hash || !activity.id_de_empresa) {
      await conn.rollback();
      conn.release();
      return NextResponse.json(
        { error: 'Datos insuficientes para reintentar. Faltan: file_path, file_hash o id_de_empresa.' },
        { status: 400 }
      );
    }

    // 3️⃣ Construir el payload para el webhook usando el upload_id ORIGINAL
    const webhookPayload = {
      text: activity.file_path,
      empresaId: activity.id_de_empresa,
      cif: activity.cif || null,
      fileHash: activity.file_hash,
      uploadId: activity.upload_id,
      fileName: activity.documento_nombre,
      isCompressedFile: false,
    };

    console.log('🔄 [RETRY] Payload construido:', {
      uploadId: activity.upload_id,
      fileName: webhookPayload.fileName,
      filePath: webhookPayload.text,
      empresaId: webhookPayload.empresaId
    });

    // 4️⃣ Actualizar el registro existente para resetear el estado
    await conn.query(
      `UPDATE erp49.actividad 
       SET 
         status = 'Reintentando',
         step = 'Iniciando reintento',
         progress = 0,
         mensaje = 'Reenviando documento al agente',
         error_detalle = NULL,
         retry_count = retry_count + 1,
         updated_at = NOW(),
         completed_at = NULL
       WHERE id = ?`,
      [activityId]
    );

    // ✅ COMMIT ANTES de llamar al webhook
    await conn.commit();
    conn.release();

    console.log('✅ [RETRY] Registro actualizado en BD');

    // 5️⃣ 🔥 FIRE AND FORGET - NO ESPERAR RESPUESTA DE MICROSERVICE
    // Disparamos el webhook pero NO esperamos que termine
    fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(webhookPayload),
    }).then(response => {
      if (!response.ok) {
        console.error('❌ [RETRY] Webhook error (async):', response.status);
        // Opcionalmente actualizar estado a fallido en background
        // Pero Microservice debería manejar esto con su propio callback
      } else {
        console.log('✅ [RETRY] Webhook enviado correctamente');
      }
    }).catch(err => {
      console.error('❌ [RETRY] Webhook fetch error (async):', err);
    });

    // 6️⃣ RESPONDER INMEDIATAMENTE al cliente
    console.log('✅ [RETRY] Respondiendo inmediatamente al cliente:', {
      uploadId: activity.upload_id,
      activityId
    });

    return NextResponse.json({
      success: true,
      message: 'Reintento iniciado correctamente',
      uploadId: activity.upload_id,
      activityId,
    });

  } catch (error: any) {
    await conn.rollback();
    conn.release();
    console.error('❌ [RETRY] Error:', error);
    return NextResponse.json(
      {
        error: 'Error al reintentar',
        details: error instanceof Error ? error.message : 'Error desconocido'
      },
      { status: 500 }
    );
  }
}