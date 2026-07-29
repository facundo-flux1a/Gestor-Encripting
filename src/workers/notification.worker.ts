import { Worker, Job } from 'bullmq';
import { redis } from '@/lib/redis';
import connection, { dbName } from '@/lib/db';
import { NOTIFICATION_QUEUE_NAME, NotificationJobData } from '@/lib/queue';
import { sendEmail } from '@/services/email-service';
import { getIngestionSummaryEmailHtml } from '@/services/ingestion/email-templates';

/**
 * Worker encargado de enviar notificaciones diferidas (ej. Resumen de Ingesta tras 15 minutos).
 */
export function startNotificationWorker() {
  console.log(`\n👷‍♂️ [Notification Worker] Iniciando worker para la cola: ${NOTIFICATION_QUEUE_NAME}`);

  const worker = new Worker<NotificationJobData>(
    NOTIFICATION_QUEUE_NAME,
    async (job: Job<NotificationJobData>) => {
      const { parentUploadId, uploadIds, emailFrom, empresaId, nombreEmpresa, batchTimestamp, earlyRejectedFiles } = job.data;
      console.log(`\n🔔 [Notification Worker] Procesando resumen para batch ${parentUploadId} (Destino: ${emailFrom})`);

      try {
        const acceptedFiles: { filename: string, status: string }[] = [];
        const rejectedFiles: { filename: string, reason: string }[] = [];

        // Agregar los rechazados tempranos (duplicados, formato no permitido, etc.)
        if (earlyRejectedFiles && earlyRejectedFiles.length > 0) {
            rejectedFiles.push(...earlyRejectedFiles);
        }

        // Consultar el estado final de todos los uploadIds en la tabla actividad
        if (uploadIds && uploadIds.length > 0) {
            // Hacemos una consulta para traer el último estado de cada uploadId
            const placeholders = uploadIds.map(() => '?').join(',');
            const query = `
                SELECT upload_id, documento_nombre, status, mensaje, progress 
                FROM ${dbName}.actividad 
                WHERE upload_id IN (${placeholders})
            `;
            const [rows] = await connection.query<any[]>(query, uploadIds);

            for (const uploadId of uploadIds) {
                // Como un uploadId de ZIP puede generar varios registros de actividad hijos,
                // buscamos todos los registros asociados.
                // Sin embargo, si uploadIds solo tiene el del padre, quizas haya que usar LIKE o buscar por padre.
                // En nuestro diseño actual, uploadIds tiene los IDs directos encolados por el webhook.
                const fileActivities = rows.filter(r => r.upload_id === uploadId || r.upload_id.startsWith(uploadId));
                
                if (fileActivities.length === 0) {
                    // Si por alguna razón no hay actividad, asumimos error
                    rejectedFiles.push({ filename: `Archivo no identificado (${uploadId})`, reason: 'El archivo desapareció del sistema de colas antes de procesarse' });
                    continue;
                }

                // Agrupamos por documento_nombre único (para soportar hijos de ZIP)
                const uniqueFiles = new Map<string, any>();
                for (const act of fileActivities) {
                    uniqueFiles.set(act.documento_nombre, act);
                }

                for (const [filename, finalAct] of uniqueFiles.entries()) {
                    if (finalAct.status === 'error' || finalAct.status === 'rechazado') {
                        rejectedFiles.push({ filename, reason: finalAct.mensaje || 'Error desconocido durante el procesamiento' });
                    } else if (finalAct.status === 'En revisión') {
                        acceptedFiles.push({ filename, status: 'Requiere revisión manual (Incidencia detectada)' });
                    } else if (finalAct.status === 'Finalizado' || finalAct.status === 'Validado') {
                        acceptedFiles.push({ filename, status: 'Validado e integrado con éxito' });
                    } else {
                        // Si después de 15 minutos sigue en "iniciando" o "procesando", está atascado o es muy grande
                        acceptedFiles.push({ filename, status: `Procesamiento demorado (${finalAct.progress}% - ${finalAct.mensaje})` });
                    }
                }
            }
        }

        // Construir HTML y Enviar Correo
        const dateStr = new Date().toLocaleDateString('es-ES');
        
        console.log(`[Notification Worker] 📧 Enviando resumen a ${emailFrom}: ${acceptedFiles.length} aceptados, ${rejectedFiles.length} rechazados.`);
        
        const html = getIngestionSummaryEmailHtml(emailFrom, nombreEmpresa, dateStr, acceptedFiles, rejectedFiles);
        
        await sendEmail({
            to: emailFrom,
            subject: `📊 Resumen de Ingesta - Sistema Documental`,
            html
        });

        console.log(`[Notification Worker] ✅ Resumen enviado exitosamente para batch ${parentUploadId}`);

      } catch (error) {
        console.error(`❌ [Notification Worker] Error procesando notificación de batch ${parentUploadId}:`, error);
        throw error;
      }
    },
    {
      connection: redis,
      concurrency: 2, // No necesitamos alta concurrencia para enviar correos diferidos
    }
  );

  worker.on('failed', (job, err) => {
    console.error(`❌ [Notification Worker] Job ${job?.id} falló:`, err);
  });

  return worker;
}
