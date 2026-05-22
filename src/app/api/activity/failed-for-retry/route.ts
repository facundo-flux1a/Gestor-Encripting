import { NextRequest, NextResponse } from 'next/server';
import connection, { dbName } from '@/lib/db';
import { getSession } from '@/services/auth-service';

export const dynamic = 'force-dynamic';

/**
 * GET /api/activity/failed-for-retry
 * 
 * Devuelve actividades fallidas que aún tienen reintentos automáticos disponibles.
 * Usado exclusivamente por el RetryMonitor del frontend.
 * 
 * Condiciones:
 * - Status 'Fallido' o 'Error'
 * - retry_count < 3
 * - Actualizadas en los últimos 30 minutos (no rescatar cosas viejas)
 * - Con al menos 15 segundos desde la última actualización (dar tiempo a n8n)
 * - Pertenecen al usuario autenticado
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const [rows] = await connection.query(
      `SELECT 
        a.id,
        a.documento_nombre,
        a.retry_count,
        a.upload_id,
        a.status,
        a.updated_at
      FROM ${dbName}.actividad a
      INNER JOIN ${dbName}.empresas e ON a.id_de_empresa = e.id
      WHERE a.status IN ('Fallido', 'Error', 'failed')
        AND (a.retry_count IS NULL OR a.retry_count < 3)
        AND a.updated_at > NOW() - INTERVAL 30 MINUTE
        AND a.updated_at < NOW() - INTERVAL 15 SECOND
        AND JSON_CONTAINS(e.id_de_usuario, CAST(? AS JSON))
      ORDER BY a.updated_at DESC
      LIMIT 10`,
      [session.userId]
    ) as any;

    console.log(`🛡️ [API-FailedForRetry] Encontradas ${rows.length} actividades fallidas para usuario ${session.userId}`);

    return NextResponse.json({
      activities: rows.map((r: any) => ({
        id: r.id,
        documento_nombre: r.documento_nombre,
        retry_count: r.retry_count || 0,
        upload_id: r.upload_id,
        status: r.status
      }))
    });

  } catch (error) {
    console.error('❌ [API-FailedForRetry] Error:', error);
    return NextResponse.json(
      { error: 'Error al obtener actividades fallidas' },
      { status: 500 }
    );
  }
}
