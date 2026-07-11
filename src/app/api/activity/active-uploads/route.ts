import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/services/auth-service';

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

    if (empresaIds.length === 0) {
      return NextResponse.json({ activeUploads: [] });
    }

    // Traer SOLO los registros padre (parent_upload_id IS NULL) activos
    const parentUploads = await prisma.actividad.findMany({
      where: {
        id_de_empresa: { in: empresaIds.map(id => BigInt(id)) },
        parent_upload_id: null,
        status: { notIn: ['completed', 'failed', 'Completado', 'Fallido'] }
      },
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
      orderBy: { updated_at: 'desc' }
    });

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
            updated_at: true,
          },
          orderBy: { updated_at: 'desc' },
          take: 50, // cap por performance
        });

        const totalChildren = children.length;
        const completedChildren = children.filter(c => c.status === 'completed' || c.status === 'Completado').length;
        const failedChildren = children.filter(c => c.status === 'failed' || c.status === 'Fallido').length;
        const waitingChildren = children.filter(c =>
          c.step?.toLowerCase().includes('cuota') ||
          c.mensaje?.toLowerCase().includes('pausado') ||
          c.step?.toLowerCase().includes('esperando')
        ).length;

        return {
          uploadId: parent.upload_id,
          nombre: parent.documento_nombre,
          status: parent.status,
          step: parent.step,
          progress: parent.progress,
          mensaje: parent.mensaje,
          updatedAt: parent.updated_at,
          createdAt: parent.created_at,
          // Resumen de hijos para lotes multi-documento
          childrenSummary: totalChildren > 0 ? {
            total: totalChildren,
            completed: completedChildren,
            failed: failedChildren,
            waiting: waitingChildren,
            processing: totalChildren - completedChildren - failedChildren,
            // Los 3 hijos más recientes activos para mostrar en la UI
            recentActive: children
              .filter(c => c.status !== 'completed' && c.status !== 'Completado')
              .slice(0, 3)
              .map(c => ({
                uploadId: c.upload_id,
                nombre: c.documento_nombre,
                status: c.status,
                step: c.step,
                progress: c.progress,
                mensaje: c.mensaje,
              })),
          } : null,
        };
      })
    );

    return NextResponse.json({ activeUploads: uploadsWithChildren });
  } catch (error: any) {
    console.error('❌ Error fetching active uploads:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
