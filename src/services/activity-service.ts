import connection from '@/lib/db';
import { RowDataPacket } from 'mysql2';

export interface RetryResult {
  success: boolean;
  message: string;
  uploadId?: string;
  activityId: number;
  retryCount: number;
  details?: string;
}

const WEBHOOK_URL = process.env.MICROSERVICE_WEBHOOK_URL || 'https://agent.flux1a.com.ar/webhook/bbdefd63-f86a-4590-a52a-37a891accbf333';

export class ActivityService {
  /**
   * Realiza un reintento de una actividad fallida.
   * Centraliza la lógica para uso manual y automático.
   */
  static async retryActivity(activityId: number, isManual: boolean = false): Promise<RetryResult> {
    const conn = await connection.getConnection();

    try {
      console.log(`🔍 [Service] Iniciando reintento para actividad ${activityId}...`);
      await conn.beginTransaction();

      // 1. Obtener la actividad y sus datos técnicos
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT 
          id,
          upload_id,
          id_de_empresa,
          file_path,
          file_hash,
          cif,
          documento_nombre,
          retry_count,
          error_detalle
        FROM erp49.actividad 
        WHERE id = ?`,
        [activityId]
      );

      if (!rows || rows.length === 0) {
        throw new Error('Actividad no encontrada');
      }

      const activity = rows[0];
      const currentRetries = activity.retry_count || 0;

      // 🔥 VALIDACIÓN DE LÍMITE: Si ya tiene 3 reintentos, abortar y actualizar mensaje
      if (!isManual && currentRetries >= 3) {
        console.warn(`⚠️ [Service] Actividad ${activityId} ya alcanzó el límite de 3 reintentos. Abortando.`);
        
        const finalError = activity.error_detalle || 'Error desconocido';
        const disclaimer = "\n\n⚠️ (Se agotaron los 3 reintentos automáticos)";

        await conn.query(
          `UPDATE erp49.actividad 
           SET 
             status = 'Fallido',
             mensaje = '⚠️ Reintentos automáticos agotados (3/3). Intenta nuevamente de forma manual.',
             error_detalle = ?,
             updated_at = NOW()
           WHERE id = ?`,
          [finalError.includes(disclaimer) ? finalError : finalError + disclaimer, activityId]
        );

        await conn.commit();
        conn.release();

        return {
          success: false,
          message: 'Máximo de reintentos alcanzado',
          activityId,
          retryCount: currentRetries
        };
      }

      // Si es manual, NO tocamos el contador (se mantiene igual).
      // Si es automático, sumamos 1.
      const nextRetryCount = isManual ? currentRetries : currentRetries + 1;

      // 2. Validar que tengamos los datos mínimos necesarios
      if (!activity.file_path || !activity.file_hash || !activity.id_de_empresa) {
        throw new Error('Datos insuficientes para reintentar. Faltan: file_path, file_hash o id_de_empresa.');
      }

      // 3. Construir el payload para el webhook
      const webhookPayload = {
        text: activity.file_path,
        empresaId: activity.id_de_empresa,
        cif: activity.cif || null,
        fileHash: activity.file_hash,
        uploadId: activity.upload_id,
        fileName: activity.documento_nombre || 'Archivo sin nombre',
        isCompressedFile: false,
        retryCount: nextRetryCount
      };

      console.log(`📦 [Service] Payload para webhook (${activityId}):`, JSON.stringify(webhookPayload));

      // 4. Preparar mensaje de error con disclaimer si es el último intento
      let errorDetalle = activity.error_detalle;
      if (nextRetryCount >= 3) {
        const disclaimer = '(Se agotaron los 3 reintentos automáticos)';
        if (errorDetalle && !errorDetalle.includes(disclaimer)) {
          errorDetalle = `${errorDetalle} ${disclaimer}`.substring(0, 500);
        } else if (!errorDetalle) {
          errorDetalle = disclaimer;
        }
      }

      // 5. Actualizar el registro existente
      await conn.query(
        `UPDATE erp49.actividad 
         SET 
           status = 'Reintentando',
           step = 'Iniciando reintento',
           progress = 0,
           mensaje = ?,
           error_detalle = ?,
           retry_count = ?,
           updated_at = NOW(),
           completed_at = NULL
         WHERE id = ?`,
        [isManual ? 'Reenviando documento al agente (Manual)...' : `Reenviando documento al agente (Intento ${nextRetryCount}/3)...`, errorDetalle, nextRetryCount, activityId]
      );

      await conn.commit();
      conn.release();

      console.log(`🔄 [Service] Reintentando actividad ${activityId} (Intento ${nextRetryCount}/3)...`);

      // 6. 🔥 LLAMAR AL WEBHOOK
      try {
        const response = await fetch(WEBHOOK_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(webhookPayload),
        });

        if (!response.ok) {
          console.error(`❌ [Service] Webhook error (Activity ${activityId}):`, response.status);
          return {
            success: false,
            message: `El servicio de procesamiento rechazó el reintento (${response.status})`,
            retryCount: nextRetryCount,
            activityId
          };
        }
        console.log(`✅ [Service] Webhook enviado con éxito para actividad ${activityId}`);
      } catch (webhookErr) {
        console.error(`❌ [Service] Webhook fetch error:`, webhookErr);
        return {
          success: false,
          message: 'No se pudo conectar con el servicio de procesamiento',
          retryCount: nextRetryCount,
          activityId
        };
      }

      return {
        success: true,
        message: 'Reintento iniciado correctamente',
        uploadId: activity.upload_id,
        activityId,
        retryCount: nextRetryCount
      };

    } catch (error: any) {
      if (conn) {
        try { await conn.rollback(); } catch (e) {}
        conn.release();
      }
      console.error('❌ [Service] Error fatal en retryActivity:', error);
      throw error;
    }
  }
}
