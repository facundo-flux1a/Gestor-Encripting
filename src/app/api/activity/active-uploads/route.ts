import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/services/auth-service';
import { reconcileStaleActividad } from '@/services/actividad-reconcile';

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const searchParams = req.nextUrl.searchParams;
    const empresaIdParam = searchParams.get('empresaId');

    let empresaIds: number[] = [];
    if (empresaIdParam) {
      empresaIds = empresaIdParam.split(',').map(id => parseInt(id, 10)).filter(id => !isNaN(id));
    }

    // Sin empresaId: todas las empresas del usuario (para rehidratar chip tras refresh)
    if (empresaIds.length === 0) {
      const empresas = await prisma.empresas.findMany({
        where: { id_de_usuario: { array_contains: session.userId } },
        select: { id: true },
      });
      empresaIds = empresas.map((e: { id: bigint | number }) => Number(e.id));
    }

    if (empresaIds.length === 0) {
      return NextResponse.json({ activeUploads: [] });
    }

    const empresaBigs = empresaIds.map((id) => BigInt(id));

    // Cerrar fantasmas/huérfanos antes de listar (contrato: no mentir "en proceso")
    await reconcileStaleActividad({ empresaIds }).catch((e) => {
      console.warn('[active-uploads] reconcile falló:', e);
    });

    // Traer SOLO los registros padre (parent_upload_id IS NULL) activos
    const parentUploads = await prisma.actividad.findMany({
      where: {
        id_de_empresa: { in: empresaBigs },
        parent_upload_id: null,
        OR: [
          { status: { notIn: ['completed', 'failed', 'Completado', 'Fallido', 'permanent-fail'] } },
          { is_new: true }
        ]
      },
      select: {
        upload_id: true,
        batch_id: true,
        documento_id: true,
        documento_nombre: true,
        status: true,
        step: true,
        progress: true,
        mensaje: true,
        is_new: true,
        webhook_payload: true,
        created_at: true,
        updated_at: true,
      },
      orderBy: { updated_at: 'desc' }
    });

    // Calcular ETA
    let totalPendingChildren = 0;

    // Para cada padre, buscar sus hijos y agregar estadísticas
    const uploadsWithChildren = await Promise.all(
      parentUploads.map(async (parent) => {
        const children = await prisma.actividad.findMany({
          where: { parent_upload_id: parent.upload_id },
          select: {
            upload_id: true,
            documento_nombre: true,
            status: true,
            step: true,
            progress: true,
            mensaje: true,
            created_at: true,
            updated_at: true,
          },
          // Quitamos el orderBy de Prisma porque lo vamos a ordenar en memoria con más inteligencia
        });

        const isWaitingCapacity = (c: { status?: string | null; step?: string | null; mensaje?: string | null }) => {
          const st = (c.status || '').toLowerCase();
          if (st === 'waiting_capacity') return true;
          const step = (c.step || '').toLowerCase();
          const msg = (c.mensaje || '').toLowerCase();
          return (
            step.includes('cuota') ||
            step.includes('cupo') ||
            step.includes('esperando') ||
            msg.includes('pausado') ||
            msg.includes('capacidad')
          );
        };

        const totalChildren = children.length;
        const completedChildren = children.filter(c => c.status === 'completed' || c.status === 'Completado').length;
        const failedChildren = children.filter(c => c.status === 'failed' || c.status === 'Fallido').length;
        const waitingChildren = children.filter(isWaitingCapacity).length;
        const processingChildren = totalChildren - completedChildren - failedChildren;
        totalPendingChildren += processingChildren;

        return {
          uploadId: parent.upload_id,
          batchId: parent.batch_id,
          documentId: parent.documento_id ? Number(parent.documento_id) : null,
          nombre: parent.documento_nombre,
          status: parent.status,
          step: parent.step,
          progress: parent.progress,
          mensaje: parent.mensaje,
          isNew: parent.is_new,
          updatedAt: parent.updated_at,
          createdAt: parent.created_at,
          // Resumen de hijos para lotes multi-documento
          childrenSummary: totalChildren > 0 ? {
            total: totalChildren,
            completed: completedChildren,
            failed: failedChildren,
            waiting: waitingChildren,
            processing: processingChildren,
            // Todos los hijos para mostrar en la UI
            recentActive: children
              .sort((a, b) => {
                // Primero: los pausados van al fondo
                const aPaused = isWaitingCapacity(a);
                const bPaused = isWaitingCapacity(b);
                
                if (aPaused && !bPaused) return 1;
                if (!aPaused && bPaused) return -1;
                
                // Segundo: por fecha de actualización (los más recientes arriba)
                return b.updated_at.getTime() - a.updated_at.getTime();
              })
              .map(c => ({
                uploadId: c.upload_id,
                nombre: c.documento_nombre,
                status: c.status,
                step: c.step,
                progress: c.progress,
                mensaje: c.mensaje,
                createdAt: c.created_at,
                updatedAt: c.updated_at,
              })),
            // Exponemos el resumen guardado si el padre ya terminó
            webhookPayload: parent.webhook_payload,
          } : { webhookPayload: parent.webhook_payload }, // Para cuando no hay hijos, igual pasamos el payload
        };
      })
    );

    // ETA en segundos (25s promedio por documento, contando rate limits y delays)
    // También sumamos los padres que no tienen hijos aún (están siendo divididos por pdftools, asumiendo 1 lote = 1 hijo virtual para no dejar en 0)
    let etaSeconds = 0;
    if (uploadsWithChildren.length > 0) {
      const activeParentsWithoutChildren = uploadsWithChildren.filter(u => !u.childrenSummary).length;
      etaSeconds = (totalPendingChildren + activeParentsWithoutChildren) * 25;
    }

    return NextResponse.json({ activeUploads: uploadsWithChildren, etaSeconds });
  } catch (error: any) {
    console.error('❌ Error fetching active uploads:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
