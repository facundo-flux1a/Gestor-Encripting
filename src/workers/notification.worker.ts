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
        const duplicateFiles: { filename: string, reason: string }[] = [];
        const rejectedFiles: { filename: string, reason: string }[] = [];

        // Agregar los rechazados tempranos (duplicados, formato no permitido, etc.)
        if (earlyRejectedFiles && earlyRejectedFiles.length > 0) {
            for (const file of earlyRejectedFiles) {
                const isDup = /duplica|ya fue subido|previamente/i.test(file.reason);
                if (isDup) {
                    duplicateFiles.push(file);
                } else {
                    rejectedFiles.push(file);
                }
            }
        }

        // Consultar el estado final de todos los uploadIds en la tabla actividad
        if (uploadIds && uploadIds.length > 0) {
            // Hacemos una consulta para traer el último estado de cada uploadId
            const placeholders = uploadIds.map(() => '?').join(',');
            const query = `
                SELECT upload_id, documento_nombre, status, step, mensaje, progress 
                FROM ${dbName}.actividad 
                WHERE upload_id IN (${placeholders})
            `;
            const [rows] = await connection.query<any[]>(query, uploadIds);

            for (const uploadId of uploadIds) {
                // Como un uploadId de ZIP puede generar varios registros de actividad hijos,
                // buscamos todos los registros asociados.
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
                    const statusLower = (finalAct.status || '').toLowerCase();
                    const stepLower = (finalAct.step || '').toLowerCase();
                    const msgLower = (finalAct.mensaje || '').toLowerCase();

                    // 1. Duplicado (ignorado en DB writer o marcado como Duplicado)
                    const isDup = 
                        statusLower === 'duplicado' || 
                        stepLower.includes('duplicado') || 
                        msgLower.includes('ya procesado') || 
                        msgLower.includes('duplicado');

                    if (isDup) {
                        duplicateFiles.push({
                            filename,
                            reason: finalAct.mensaje || 'Documento ya registrado anteriormente en la empresa.'
                        });
                        continue;
                    }

                    // 2. Errores / Fallidos
                    const isFailed = 
                        statusLower === 'fallido' || 
                        statusLower === 'failed' || 
                        statusLower === 'error' || 
                        statusLower === 'rechazado';

                    if (isFailed) {
                        rejectedFiles.push({
                            filename,
                            reason: finalAct.mensaje || 'Error durante el procesamiento.'
                        });
                        continue;
                    }

                    // 3. En revisión manual
                    const isRevision = 
                        statusLower === 'en revisión' || 
                        statusLower === 'en revision' || 
                        stepLower.includes('revisión') || 
                        stepLower.includes('revision');

                    if (isRevision) {
                        acceptedFiles.push({
                            filename,
                            status: 'Requiere revisión manual (Incidencia detectada)'
                        });
                        continue;
                    }

                    // 4. Completado / Validado con éxito
                    const isCompleted = 
                        statusLower === 'completado' || 
                        statusLower === 'completed' || 
                        statusLower === 'finalizado' || 
                        statusLower === 'validado';

                    if (isCompleted) {
                        acceptedFiles.push({
                            filename,
                            status: 'Validado e integrado con éxito'
                        });
                        continue;
                    }

                    // 5. Demorado o en proceso
                    acceptedFiles.push({
                        filename,
                        status: `Procesamiento demorado (${finalAct.progress ?? 0}% - ${finalAct.mensaje || 'En cola'})`
                    });
                }
            }
        }

        // Construir HTML y Enviar Correo
        const dateStr = new Date().toLocaleDateString('es-ES');
        
        console.log(`[Notification Worker] 📧 Enviando resumen a ${emailFrom}: ${acceptedFiles.length} aceptados, ${duplicateFiles.length} duplicados, ${rejectedFiles.length} rechazados.`);
        
        const html = getIngestionSummaryEmailHtml(emailFrom, nombreEmpresa, dateStr, acceptedFiles, rejectedFiles, duplicateFiles);
        
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
