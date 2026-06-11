import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import connection, { dbName } from '@/lib/db';
import { RowDataPacket } from 'mysql2';
import { fireWebhook, fireBatchWebhook } from '@/services/webhook-service';

// ==========================================
// POST: Recibir callback de n8n / microservicio
// ==========================================
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { uploadId, parentUploadId, status, step, progress, message } = body;
    // documentId puede venir directamente del body (n8n lo envía en HTTP Request3)
    const bodyDocumentId = body.documentId || body.documento_id || null;

    // Normalizar entrada de IDs (soportar camelCase y snake_case del agente)
    const effectiveUploadId = uploadId || body.upload_id;
    const effectiveParentId = parentUploadId || body.parent_upload_id;

    console.log(`📡 [POST-Progress] Callback: ${effectiveUploadId} - Status: ${status} - documentId: ${bodyDocumentId}`);

    if (!effectiveUploadId) {
      return NextResponse.json({ error: 'uploadId requerido' }, { status: 400 });
    }

    // 🔥 MANEJO ESPECIAL PARA ERRORES (AUTORETRY BACKEND)
    // Soportar "failed" (n8n), "Fallido", "Error", etc.
    const normalizedStatus = status?.toLowerCase();
    const isFailure = normalizedStatus === 'failed' || normalizedStatus === 'fallido' || normalizedStatus === 'error';
    // n8n envía "completed" (minúscula), el frontend puede enviar "Completado"
    const isCompleted = normalizedStatus === 'completed' || normalizedStatus === 'completado';

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

    // ─────────────────────────────────────────────────────────────────────────────
    // 🔔 WEBHOOKS TRIGGER: Completado — se dispara en background, sin bloquear la respuesta
    // Usamos una función centralizada para manejar Lotes vs Documentos únicos
    // ─────────────────────────────────────────────────────────────────────────────
    if (isCompleted) {
      // 🔥 BACKGROUND: no bloqueamos la respuesta HTTP — usamos after() de Next.js
      after(async () => {
        await dispatchCompletionWebhook(effectiveUploadId);
      });
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
      `UPDATE ${dbName}.actividad 
       SET status = 'Fallido', 
           step = 'Error en procesamiento',
           mensaje = ?,
           updated_at = NOW()
       WHERE upload_id = ?`,
      [errorMessage || 'Error en archivo hijo', parentUploadId]
    );
    console.log(`✅ [Parent Update] Padre ${parentUploadId} marcado como Fallido`);
  } catch (error) {
    console.error('❌ [Parent Update] Error al marcar padre como fallido:', error);
  }
}

// 🔥 FUNCIÓN PARA CALCULAR Y ACTUALIZAR EL PROGRESO DEL PADRE
async function updateParentProgress(parentUploadId: string) {
  try {
    // Obtener todos los hijos
    const [children] = await connection.query(
      `SELECT status, progress FROM ${dbName}.actividad WHERE parent_upload_id = ?`,
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
      `UPDATE ${dbName}.actividad 
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
// CENTRAL WEBHOOK DISPATCHER (Maneja Lotes y Documentos Únicos)
// ==========================================
async function dispatchCompletionWebhook(uploadId: string) {
  try {
    // 1. Obtener registro principal
    const [actRows] = await connection.query<RowDataPacket[]>(
      `SELECT id_de_empresa, documento_id, parent_upload_id FROM ${dbName}.actividad WHERE upload_id = ? LIMIT 1`,
      [uploadId]
    );
    const mainRecord = actRows[0];
    if (!mainRecord) return;

    // 2. Si es un hijo (tiene parent_upload_id), no disparamos webhook acá. Esperamos al padre.
    if (mainRecord.parent_upload_id) {
      console.log(`ℹ️ [Webhook-Dispatch] ${uploadId} es un hijo. Webhook se dispara desde el padre.`);
      return;
    }

    const empresaId = mainRecord.id_de_empresa;
    if (!empresaId) return;

    // 3. Buscar si tiene hijos en la base de datos (lote/ZIP/multi-pdf)
    const [childRows] = await connection.query<RowDataPacket[]>(
      `SELECT documento_id FROM ${dbName}.actividad WHERE parent_upload_id = ? AND documento_id IS NOT NULL`,
      [uploadId]
    );

    // 4. Dedup guard: usamos el upload_id_original como clave única en webhook_logs
    const [existingLogs] = await connection.query<RowDataPacket[]>(
      `SELECT id FROM ${dbName}.webhook_logs 
       WHERE evento IN ('documento.requiere_atencion', 'documento.listo_para_erp', 'documento.lote_procesado') 
       AND JSON_EXTRACT(payload, '$.data.upload_id_original') = ? LIMIT 1`,
      [uploadId]
    );

    if (existingLogs.length > 0) {
      console.log(`ℹ️ [Webhook-Dispatch] Ya se disparó webhook para ${uploadId}`);
      return;
    }

    if (childRows.length > 0) {
      // 🚀 CASO: LOTE (BATCH DE DOCUMENTOS)
      console.log(`🔔 [Webhook-Dispatch] Lote detectado (${childRows.length} documentos). Generando payload...`);
      
      const docIds = childRows.map(r => r.documento_id);
      const docsData = [];
      let totalIncidencias = 0;

      for (const docId of docIds) {
        const [dRows] = await connection.query<RowDataPacket[]>(
          `SELECT 
             d.id, d.file_hash, d.tipo_documento, d.numero_documento, d.importe_total,
             d.fecha_emision, d.fecha_vencimiento, d.importe_sin_impuestos, d.moneda,
             d.trimestre_cerrado, d.año_trimestre, d.num_trimestre,
             e.nombre_de_empresa as empresa_nombre, e.cif as empresa_cif
           FROM ${dbName}.documentos d
           LEFT JOIN ${dbName}.empresas e ON d.id_de_empresa = e.id
           WHERE d.id = ? LIMIT 1`,
          [docId]
        );
        const [aRows] = await connection.query<RowDataPacket[]>(
          `SELECT ruta_archivo FROM ${dbName}.archivos_documento WHERE documento_id = ? ORDER BY fecha_subida DESC LIMIT 1`,
          [docId]
        );
        const [iRows] = await connection.query<RowDataPacket[]>(
          `SELECT COUNT(*) as count FROM ${dbName}.incidencias_documento WHERE documento_id = ? AND validado = 0`,
          [docId]
        );
        const [hcRows] = await connection.query<RowDataPacket[]>(
          `SELECT verified FROM ${dbName}.health_check_status WHERE documento_id = ? LIMIT 1`,
          [docId]
        );

        if (dRows.length > 0) {
          const docIncidenciasCount = iRows[0]?.count || 0;
          const failedHC = hcRows.length > 0 && hcRows[0].verified === 0;
          const hasInc = docIncidenciasCount > 0 || failedHC;

          if (hasInc) totalIncidencias++;

          docsData.push({
            ...dRows[0],
            url_archivo: aRows[0]?.ruta_archivo ?? null,
            tiene_incidencias: hasInc,
            cantidad_incidencias: docIncidenciasCount,
            upload_id_original: uploadId
          });
        }
      }

      // El webhook individual que queremos disparar si no está agrupado
      // Sería "documento.listo_para_erp" si todo bien, o "requiere_atencion". 
      // Dado que el lote puede tener mezcla, dejaremos "documento.procesado" como evento singular base (aunque idealmente el usuario agrupará).
      // Para respetar el código viejo, si eligen agrupar (default nuevo), le mandamos todo a 'documento.lote_procesado'.
      
      // Construimos el array para enviarlo a fireBatchWebhook.
      // Acá usaremos el singular "documento.listo_para_erp" y el plural "documento.lote_procesado"
      await fireBatchWebhook(empresaId, 'documento.listo_para_erp', 'documento.lote_procesado', docsData);

    } else {
      // 🚀 CASO: DOCUMENTO ÚNICO
      let docId = mainRecord.documento_id;

      if (!docId) {
        // En caso de que el upload original tarde unos ms extra en guardar el doc
        console.log(`⏳ [Webhook-Dispatch] Sin documento_id, esperando 3s...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
        const [recheck] = await connection.query<RowDataPacket[]>(
          `SELECT documento_id FROM ${dbName}.actividad WHERE upload_id = ?`,
          [uploadId]
        );
        docId = recheck[0]?.documento_id;
      }

      if (!docId) {
        console.warn(`⚠️ [Webhook-Dispatch] Webhook cancelado: No se encontró documento_id para ${uploadId}`);
        return;
      }

      const [dRows] = await connection.query<RowDataPacket[]>(
        `SELECT 
           d.id, d.file_hash, d.tipo_documento, d.numero_documento, d.importe_total,
           d.fecha_emision, d.fecha_vencimiento, d.importe_sin_impuestos, d.moneda,
           d.trimestre_cerrado, d.año_trimestre, d.num_trimestre,
           e.nombre_de_empresa as empresa_nombre, e.cif as empresa_cif
         FROM ${dbName}.documentos d
         LEFT JOIN ${dbName}.empresas e ON d.id_de_empresa = e.id
         WHERE d.id = ? LIMIT 1`,
        [docId]
      );
      const [aRows] = await connection.query<RowDataPacket[]>(
        `SELECT ruta_archivo FROM ${dbName}.archivos_documento WHERE documento_id = ? ORDER BY fecha_subida DESC LIMIT 1`,
        [docId]
      );
      const [iRows] = await connection.query<RowDataPacket[]>(
        `SELECT COUNT(*) as count FROM ${dbName}.incidencias_documento WHERE documento_id = ? AND validado = 0`,
        [docId]
      );
      const [hcRows] = await connection.query<RowDataPacket[]>(
        `SELECT verified FROM ${dbName}.health_check_status WHERE documento_id = ? LIMIT 1`,
        [docId]
      );

      const failedHC = hcRows.length > 0 && hcRows[0].verified === 0;
      const hasIncidents = iRows[0]?.count > 0 || failedHC;

      if (dRows.length > 0) {
        const docData = { 
          ...dRows[0], 
          url_archivo: aRows[0]?.ruta_archivo ?? null,
          upload_id_original: uploadId
        };
        
        console.log(`🔔 [Webhook-Dispatch] Disparando webhook para doc ${docId} (Incidencias: ${hasIncidents})`);
        if (hasIncidents) {
          await fireBatchWebhook(empresaId, 'documento.requiere_atencion', 'documento.lote_requiere_atencion', [docData]);
        } else {
          await fireBatchWebhook(empresaId, 'documento.listo_para_erp', 'documento.lote_procesado', [docData]);
        }
      }
    }
  } catch (error) {
    console.error('❌ [Webhook-Dispatch] Error en dispatchCompletionWebhook:', error);
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
    // Obtener el registro principal
    const [rows] = await connection.query(
      `SELECT * FROM ${dbName}.actividad WHERE upload_id = ? LIMIT 1`,
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

    // 🔥 SI ES UN PADRE (archivo comprimido o lote pdf), obtener sus hijos
    let children = [];
    if (mainRecord.parent_upload_id === null) {
      const [childRows] = await connection.query(
        `SELECT * FROM ${dbName}.actividad WHERE parent_upload_id = ? ORDER BY created_at ASC`,
        [uploadId]
      ) as any;
      children = childRows;
    }

    // 🆕 VERIFICAR SI EL DOCUMENTO ÚNICO TIENE INCIDENCIAS (solo display UI)
    let hasIncidents = false;
    
    // 🔔 WEBHOOK TRIGGER desde GET: Asegura disparo en caso que POST haya fallado
    if (mainRecord.status === 'Completado') {
      if (mainRecord.documento_id && children.length === 0) {
        const [incidentRows] = await connection.query(
          `SELECT COUNT(*) as count FROM ${dbName}.incidencias_documento WHERE documento_id = ?`,
          [mainRecord.documento_id]
        ) as any;
        hasIncidents = incidentRows[0]?.count > 0;
      }
      
      // Disparamos el webhook usando la misma función central en background
      after(async () => {
        await dispatchCompletionWebhook(uploadId);
      });
    }

    const response = {
      id: mainRecord.id,
      status: mainRecord.status,
      step: mainRecord.step,
      progress: mainRecord.progress,
      message: mainRecord.mensaje,
      retryCount: mainRecord.retry_count || 0,
      timestamp: Date.now(),
      isCompressed: children.length > 0,
      hasIncidents,
      children: children.map((child: any) => ({
        id: child.id,
        uploadId: child.upload_id,
        fileName: child.documento_nombre,
        status: child.status,
        step: child.step,
        progress: child.progress,
        message: child.mensaje,
        retryCount: child.retry_count || 0
      }))
    };

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
