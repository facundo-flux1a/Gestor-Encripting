import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/services/auth-service';
import { createActivityBatch } from '@/services/upload-service';

export const dynamic = 'force-dynamic';

/**
 * Reserva uploadIds de un lote (sin crear actividad hasta que lleguen los bytes).
 * Ver docs/CONTRATO_UPLOAD_BATCH.md — actividad nace en POST /api/uploads/file.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await req.json();
    const empresaId = body.empresaId != null ? String(body.empresaId) : '';
    const files = Array.isArray(body.files) ? body.files : [];

    if (!empresaId) {
      return NextResponse.json({ error: 'empresaId requerido' }, { status: 400 });
    }
    if (files.length === 0) {
      return NextResponse.json({ error: 'files[] requerido' }, { status: 400 });
    }

    const result = await createActivityBatch(
      empresaId,
      files.map((f: { fileName?: string; name?: string; size?: number; mimeType?: string; type?: string }) => ({
        fileName: f.fileName || f.name || '',
        size: f.size,
        mimeType: f.mimeType || f.type,
      }))
    );

    // Si la empresa tiene habilitada la notificación de resumen de subida por email,
    // programamos la tarea en notificationQueue con 10 minutos de delay
    try {
      const { prisma } = await import('@/lib/prisma');
      const empresa = await prisma.empresas.findUnique({
        where: { id: BigInt(empresaId) },
        select: {
          nombre_de_empresa: true,
          notificar_resumen_subida: true,
          email_notificaciones: true,
          mail_de_carga: true,
        },
      });

      if (empresa?.notificar_resumen_subida) {
        const emailDestino =
          empresa.email_notificaciones?.trim() ||
          empresa.mail_de_carga?.trim() ||
          session.email?.trim();

        if (emailDestino) {
          const { notificationQueue, getNotificationSummaryDelayMs } = await import('@/lib/queue');
          const delayMs = getNotificationSummaryDelayMs(10);
          await notificationQueue.add(
            `notify-${result.batchId}`,
            {
              parentUploadId: result.batchId,
              uploadIds: result.items.map((it) => it.uploadId),
              emailFrom: emailDestino,
              empresaId: String(empresaId),
              nombreEmpresa: empresa.nombre_de_empresa || 'Su Empresa',
              batchTimestamp: Date.now(),
            },
            {
              jobId: `notify-${result.batchId}`,
              delay: delayMs,
              removeOnComplete: true,
            }
          );
          console.log(`📧 [API-UPLOADS-BATCH] Resumen de subida programado (${delayMs / 1000}s) para ${emailDestino} (batch ${result.batchId})`);
        }
      }
    } catch (notifErr) {
      console.warn('⚠️ [API-UPLOADS-BATCH] No se pudo encolar la notificación de resumen:', notifErr);
    }

    return NextResponse.json({
      success: true,
      batchId: result.batchId,
      items: result.items,
    });
  } catch (error) {
    console.error('❌ [API-UPLOADS-BATCH]', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error al crear lote',
      },
      { status: 500 }
    );
  }
}
