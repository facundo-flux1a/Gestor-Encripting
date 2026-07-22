import { NextRequest, NextResponse } from 'next/server';
import connection, { dbName } from '@/lib/db';
import { RowDataPacket } from 'mysql2';

function isFinishedStatus(status: unknown): boolean {
  const s = String(status || '').toLowerCase();
  return (
    s === 'completado' ||
    s === 'completed' ||
    s === 'fallido' ||
    s === 'failed' ||
    s === 'permanent-fail' ||
    s === 'error'
  );
}

function isCompletedOk(status: unknown): boolean {
  const s = String(status || '').toLowerCase();
  return s === 'completado' || s === 'completed';
}

function isFailed(status: unknown): boolean {
  const s = String(status || '').toLowerCase();
  return s === 'fallido' || s === 'failed' || s === 'permanent-fail' || s === 'error';
}

/**
 * Progreso de un lote: cuenta hijos si el PDF se partió; si no, los padres.
 * El % es listos/total (no AVG de progress, que rebota en paginate).
 */
export async function GET(request: NextRequest) {
  try {
    const batchId = request.nextUrl.searchParams.get('batchId')?.trim();
    if (!batchId) {
      return NextResponse.json({ error: 'batchId requerido' }, { status: 400 });
    }

    const [parents] = await connection.query<RowDataPacket[]>(
      `SELECT upload_id, status, progress, documento_nombre
       FROM ${dbName}.actividad
       WHERE batch_id = ? AND parent_upload_id IS NULL`,
      [batchId]
    );

    if (parents.length === 0) {
      return NextResponse.json({
        batchId,
        total: 0,
        finished: 0,
        completed: 0,
        failed: 0,
        active: 0,
        avgProgress: 0,
        percent: 0,
        done: false,
      });
    }

    const parentIds = parents.map((p) => p.upload_id);
    const [children] = await connection.query<RowDataPacket[]>(
      `SELECT upload_id, parent_upload_id, status, progress, documento_nombre
       FROM ${dbName}.actividad
       WHERE parent_upload_id IN (?)`,
      [parentIds]
    );

    // Si hay hijos (multi-PDF), la unidad de progreso son los hijos; si no, los padres.
    const units = children.length > 0 ? children : parents;
    const total = units.length;
    const finished = units.filter((u) => isFinishedStatus(u.status)).length;
    const completed = units.filter((u) => isCompletedOk(u.status)).length;
    const failed = units.filter((u) => isFailed(u.status)).length;
    const active = Math.max(0, total - finished);

    // % monótono por unidades terminadas; si aún no hay finished, usa mínimo del progress medio (floor)
    let percent = 0;
    if (total > 0 && finished >= total) {
      percent = 100;
    } else if (total > 0) {
      const byCount = Math.round((finished / total) * 100);
      const avgProg = Math.round(
        units.reduce((a, u) => a + (Number(u.progress) || 0), 0) / total
      );
      // Nunca bajar conceptualmente en el servidor: usamos max(count, avg*0.5) acotado
      percent = Math.min(99, Math.max(byCount, Math.min(avgProg, 90)));
    }

    return NextResponse.json(
      {
        batchId,
        total,
        finished,
        completed,
        failed,
        active,
        avgProgress: percent,
        percent,
        done: total > 0 && finished >= total,
        split: children.length > 0,
      },
      { headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' } }
    );
  } catch (error) {
    console.error('❌ [GET batch-progress]', error);
    return NextResponse.json({ error: 'Error al consultar lote' }, { status: 500 });
  }
}
