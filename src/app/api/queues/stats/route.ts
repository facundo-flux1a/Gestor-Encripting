import { NextResponse } from 'next/server';
import { getSession } from '@/services/auth-service';
import { getSelectedCompanies } from '@/lib/upstash';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getSession();
    if (!session || !session.userId) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    // 1. Obtener las empresas seleccionadas por el usuario actual
    const empresaIds = await getSelectedCompanies(session.userId);
    
    // Si no tiene empresas activas, devolvemos contadores en 0
    if (!empresaIds || empresaIds.length === 0) {
      return NextResponse.json({
         total: { active: 0, waiting: 0, delayed: 0, failed: 0, completed: 0 }
      });
    }

    // 2. Consultar la tabla de actividad agrupando por estado, solo para esas empresas
    const counts = await prisma.actividad.groupBy({
      by: ['status'],
      where: {
        id_de_empresa: { in: empresaIds.map(id => BigInt(id)) }
      },
      _count: {
        _all: true
      }
    });

    // 3. Mapear los estados de MySQL a los contadores que espera el frontend (estilo BullMQ)
    let waiting = 0;
    let active = 0;
    let failed = 0;
    let completed = 0;
    let delayed = 0;

    for (const group of counts) {
      const status = (group.status || '').toLowerCase();
      const count = group._count._all;

      if (status === 'pending' || status === 'uploaded') {
        waiting += count;
      } else if (status === 'processing') {
        active += count;
      } else if (status === 'completed') {
        completed += count;
      } else if (status === 'failed') {
        failed += count;
      } else if (status === 'paused') {
        delayed += count;
      }
    }

    // El frontend espera esta estructura
    const stats = {
      total: {
        waiting,
        active,
        delayed,
        failed,
        completed
      }
    };

    return NextResponse.json(stats);
  } catch (error: any) {
    console.error('[QueueStatsAPI] Error fetching queue stats:', error);
    return NextResponse.json({ error: 'Error fetching queue stats' }, { status: 500 });
  }
}
