import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/services/auth-service';
import connection, { dbName } from '@/lib/db';
import { decrypt } from '@/lib/encryption';

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const url = new URL(req.url);
    const onlyUnread = url.searchParams.get('unread') === 'true';
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '30'), 100);

    const [rows] = await connection.query<any[]>(
      `SELECT id, empresa_id, tipo, titulo, mensaje, leida, created_at, metadata
       FROM ${dbName}.notificaciones
       WHERE user_id = ?
       ${onlyUnread ? 'AND leida = 0' : ''}
       ORDER BY created_at DESC
       LIMIT ?`,
      [session.userId, limit]
    );

    const [countRow] = await connection.query<any[]>(
      `SELECT COUNT(*) as total FROM ${dbName}.notificaciones
       WHERE user_id = ? AND leida = 0`,
      [session.userId]
    );

    return NextResponse.json({
      notifications: rows.map(n => {
        let titulo  = n.titulo;
        let mensaje = n.mensaje;
        try { titulo  = decrypt(n.titulo); } catch { /* si no esta cifrado, usar crudo */ }
        try { if (n.mensaje) mensaje = decrypt(n.mensaje); } catch { /* idem */ }
        return { ...n, titulo, mensaje };
      }),
      unreadCount: countRow[0]?.total ?? 0,
    });

  } catch (error: any) {
    console.error('[notifications] GET error:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await req.json();
    const ids: number[] | undefined = body.ids;
    const markAll: boolean = body.all === true;

    if (markAll) {
      await connection.query(
        `UPDATE ${dbName}.notificaciones SET leida = 1
         WHERE user_id = ? AND leida = 0`,
        [session.userId]
      );
    } else if (ids && ids.length > 0) {
      const placeholders = ids.map(() => '?').join(', ');
      await connection.query(
        `UPDATE ${dbName}.notificaciones SET leida = 1
         WHERE id IN (${placeholders}) AND user_id = ?`,
        [...ids, session.userId]
      );
    }

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('[notifications] PATCH error:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
