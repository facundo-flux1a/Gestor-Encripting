import { NextRequest, NextResponse } from 'next/server';
import connection, { dbName } from '@/lib/db';
import { ActivityService } from '@/services/activity-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// ==========================================
// POST: Recibir callbacks del flujo
// ==========================================
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { uploadId, parentUploadId, status, step, progress, message } = body;

    // Normalizar entrada de IDs (soportar camelCase y snake_case del agente)
    const effectiveUploadId = uploadId || body.upload_id;
    const effectiveParentId = parentUploadId || body.parent_upload_id;

    console.log(`📡 [POST-Progress] Callback: ${effectiveUploadId} - Status: ${status}`);

    if (!effectiveUploadId) {
      return NextResponse.json({ error: 'uploadId requerido' }, { status: 400 });
    }

    // 🔥 MANEJO ESPECIAL PARA ERRORES (AUTORETRY BACKEND)
    // Soportar "failed" (n8n), "Fallido", "Error", etc.
    const normalizedStatus = status?.toLowerCase();
    const isFailure = normalizedStatus === 'failed' || normalizedStatus === 'fallido' || normalizedStatus === 'error';

    if (isFailure) {
      console.error(`❌ [POST] Falla detectada ("${status}") en UploadID: ${effectiveUploadId}`);

      // 1. Obtener actividad
      let [actRows] = await connection.query(
        `SELECT id, retry_count, mensaje, error_detalle, documento_nombre FROM ${dbName}.actividad WHERE upload_id = ? OR parent_upload_id = ? OR id = ?`,
        [effectiveUploadId, effectiveUploadId, body.activityId || -1]
      ) as any;

      // Fallback por nombre si no hay ID (para emails o reintentos con IDs nuevos)
      if (actRows.length === 0 && (body.fileName || body.documento_nombre)) {
        const fname = body.fileName || body.documento_nombre;
        console.log(`🔍 [POST-Progress] Fallback: Buscando por nombre "${fname}"`);
        [actRows] = await connection.query(
          `SELECT id, retry_count, mensaje, error_detalle, documento_nombre FROM ${dbName}.actividad WHERE documento_nombre = ? AND updated_at > NOW() - INTERVAL 2 HOUR LIMIT 1`,
          [fname]
        ) as any;
      }

      const activity = actRows[0];
      const currentRetries = activity?.retry_count || 0;
      const fileName = activity?.documento_nombre || 'Archivo';

      // 2. Determinar el mensaje final
      let finalMensaje = message || 'Error al procesar';
      let finalDetalle = activity?.error_detalle || step || 'Error desconocido';

      if (currentRetries >= 3) {
        finalMensaje = '⚠️ Reintentos automáticos agotados (3/3). Intenta nuevamente de forma manual.';
        if (!finalDetalle.includes('agotaron')) {
          finalDetalle = `${finalDetalle}\n\n⚠️ (Se agotaron los 3 reintentos automáticos)`;
        }
      }

      // 3. Actualizar el registro (Usando el ID real para asegurar el match)
      const filterField = activity?.id ? 'id = ?' : 'upload_id = ?';
      const filterValue = activity?.id || effectiveUploadId;

      await connection.query(
        `UPDATE ${dbName}.actividad 
         SET status = 'Fallido', step = ?, progress = 0, mensaje = ?, error_detalle = ?, updated_at = NOW()
         WHERE ${filterField}`,
        [step || 'Error', finalMensaje, finalDetalle, filterValue]
      );

      // 4. 🔥 AUTORETRY: Ahora gestionado por <RetryMonitor /> en el frontend.
      // Se desactiva aquí para evitar reintentos duplicados.
      // Ver: src/components/upload/retry-monitor.tsx

      // 4b. SI TIENE PARENT, TAMBIÉN MARCAR AL PADRE
      if (effectiveParentId) {
        await markParentAsFailed(effectiveParentId, message);
      }

      // 5. Responder éxito (el frontend verá el estado 'failed' y mostrará el toast)
      return NextResponse.json({
        success: true,
        message: currentRetries < 3 ? 'Falla registrada' : 'Reintentos agotados',
        activityId: activity?.id || null,
        retryCount: currentRetries
      });
    }

    // 🔥 ACTUALIZACIÓN NORMAL
    await connection.query(
      `UPDATE ${dbName}.actividad 
       SET status = ?, step = ?, progress = ?, mensaje = ?, updated_at = NOW()
       WHERE upload_id = ? OR parent_upload_id = ?`,
      [status, step, progress, message, effectiveUploadId, effectiveUploadId]
    );

    console.log(`✅ [POST-Progress] Actualizado: ${effectiveUploadId} - ${step} (${progress}%)`);

    // 🔥 SI TIENE PARENT, ACTUALIZAR EL PROGRESO DEL PADRE
    if (effectiveParentId) {
      await updateParentProgress(effectiveParentId);
    }

    return NextResponse.json({
      success: true,
      uploadId: effectiveUploadId,
      stored: true
    });

  } catch (error) {
    console.error('❌ [POST] Error:', error);
    return NextResponse.json(
      { error: 'Error al procesar callback' },
      { status: 500 }
    );
  }
}

// 🆕 FUNCIÓN PARA MARCAR AL PADRE COMO FALLIDO
async function markParentAsFailed(parentUploadId: string, errorMessage?: string) {
  try {
    await connection.query(
      `UPDATE actividad 
       SET status = 'Fallido', 
           step = 'Error en procesamiento', 
           progress = 0, 
           mensaje = ?, 
           updated_at = NOW()
       WHERE upload_id = ?`,
      [errorMessage || 'Uno o más archivos fallaron en el procesamiento', parentUploadId]
    );

    console.log(`❌ [Parent Update] Padre marcado como fallido: ${parentUploadId}`);
  } catch (error) {
    console.error('❌ [Parent Update] Error al marcar padre como fallido:', error);
  }
}

// 🔥 FUNCIÓN PARA CALCULAR Y ACTUALIZAR EL PROGRESO DEL PADRE
async function updateParentProgress(parentUploadId: string) {
  try {
    // Obtener todos los hijos
    const [children] = await connection.query(
      `SELECT status, progress FROM actividad WHERE parent_upload_id = ?`,
      [parentUploadId]
    ) as any;

    if (children.length === 0) return;

    // Calcular progreso promedio
    const totalProgress = children.reduce((sum: number, child: any) => sum + (child.progress || 0), 0);
    const averageProgress = Math.round(totalProgress / children.length);

    // Determinar estado del padre
    const allCompleted = children.every((child: any) => child.status === 'Completado');
    const anyFailed = children.some((child: any) => child.status === 'Fallido');

    let parentStatus = 'procesando';
    let parentStep = 'Procesando archivos...';
    let parentMessage = `${children.length} archivos en proceso`;

    if (allCompleted) {
      parentStatus = 'Completado';
      parentStep = 'Completado';
      parentMessage = `✅ ${children.length} archivos procesados exitosamente`;
    } else if (anyFailed) {
      // 🔥 SI ALGÚN HIJO FALLÓ, MARCAR AL PADRE COMO FALLIDO
      parentStatus = 'Fallido';
      parentStep = 'Error en procesamiento';
      const failedCount = children.filter((child: any) => child.status === 'Fallido').length;
      parentMessage = `❌ ${failedCount} de ${children.length} archivos fallaron`;
    }

    // Actualizar el padre
    await connection.query(
      `UPDATE actividad 
       SET status = ?, step = ?, progress = ?, mensaje = ?, updated_at = NOW()
       WHERE upload_id = ?`,
      [parentStatus, parentStep, averageProgress, parentMessage, parentUploadId]
    );

    console.log(`✅ [Parent Update] ${parentUploadId} - ${parentStatus} ${averageProgress}% (${children.length} hijos)`);
  } catch (error) {
    console.error('❌ [Parent Update] Error:', error);
  }
}

// ==========================================
// GET: Retornar estado actual + archivos hijos
// ==========================================
export async function GET(request: NextRequest) {
  const uploadId = request.nextUrl.searchParams.get('uploadId');

  if (!uploadId) {
    return NextResponse.json({ error: 'uploadId requerido' }, { status: 400 });
  }

  try {
    console.log('🔍 [GET] Solicitando estado de:', uploadId);

    // Obtener el registro principal
    const [rows] = await connection.query(
      `SELECT * FROM actividad WHERE upload_id = ? LIMIT 1`,
      [uploadId]
    ) as any;

    if (rows.length === 0) {
      return NextResponse.json(
        {
          status: 'waiting',
          step: 'Iniciando',
          progress: 0,
          message: 'Esperando procesamiento...',
          timestamp: Date.now()
        },
        {
          status: 200,
          headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
        }
      );
    }

    const mainRecord = rows[0];

    // 🔥 SI ES UN PADRE (archivo comprimido), obtener sus hijos
    let children = [];
    if (mainRecord.parent_upload_id === null) {
      const [childRows] = await connection.query(
        `SELECT * FROM actividad WHERE parent_upload_id = ? ORDER BY created_at ASC`,
        [uploadId]
      ) as any;
      children = childRows;
    }

    // 🆕 VERIFICAR SI EL DOCUMENTO TIENE INCIDENCIAS
    let hasIncidents = false;
    console.log(`🔍 [GET] mainRecord:`, {
      status: mainRecord.status,
      documento_id: mainRecord.documento_id,
      upload_id: mainRecord.upload_id
    });

    if (mainRecord.status === 'Completado' && mainRecord.documento_id) {
      const [incidentRows] = await connection.query(
        `SELECT COUNT(*) as count FROM incidencias_documento 
         WHERE documento_id = ?`,
        [mainRecord.documento_id]
      ) as any;
      hasIncidents = incidentRows[0]?.count > 0;
      console.log(`🔍 [GET] Documento ID ${mainRecord.documento_id} tiene incidencias:`, hasIncidents, `(${incidentRows[0]?.count} incidencias)`);
    } else {
      console.log(`⚠️ [GET] No se puede verificar incidencias - Status: ${mainRecord.status}, documento_id: ${mainRecord.documento_id}`);
    }

    const response = {
      id: mainRecord.id, // 🆕 Necesario para reintentos
      status: mainRecord.status,
      step: mainRecord.step,
      progress: mainRecord.progress,
      message: mainRecord.mensaje,
      retryCount: mainRecord.retry_count || 0, // 🆕
      timestamp: Date.now(),
      isCompressed: children.length > 0,
      hasIncidents, 
      children: children.map((child: any) => ({
        id: child.id, // 🆕
        uploadId: child.upload_id,
        fileName: child.documento_nombre,
        status: child.status,
        step: child.step,
        progress: child.progress,
        message: child.mensaje,
        retryCount: child.retry_count || 0 // 🆕
      }))
    };

    console.log(`✅ [GET] Retornando: ${uploadId} - ${mainRecord.step} (${mainRecord.progress}%)${children.length > 0 ? ` + ${children.length} hijos` : ''}`);

    return NextResponse.json(response, {
      headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
    });

  } catch (error) {
    console.error('❌ [GET] Error:', error);
    return NextResponse.json(
      { error: 'Error al obtener progreso' },
      { status: 500 }
    );
  }
}