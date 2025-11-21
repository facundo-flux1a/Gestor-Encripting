import { NextRequest, NextResponse } from 'next/server';
import connection from '@/lib/db';
import { getSession } from '@/services/auth-service';

export const dynamic = 'force-dynamic';

// GET - Obtener conteo de actividades no leídas
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    
    if (!session) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    // Contar actividades no leídas separadas por tipo (success vs fallidas)
    const [rows] = await connection.query(
      `SELECT 
        SUM(CASE WHEN a.is_new = 1 AND LOWER(a.status) = 'completado' THEN 1 ELSE 0 END) as unread_success,
        SUM(CASE WHEN a.is_new = 1 AND LOWER(a.status) IN ('fallido', 'error', 'interrumpido') THEN 1 ELSE 0 END) as unread_failed,
        SUM(CASE WHEN a.is_new = 1 THEN 1 ELSE 0 END) as total_unread
       FROM erp49.actividad a
       INNER JOIN erp49.empresas e ON a.id_de_empresa = e.id
       INNER JOIN erp49.usuarios u ON e.id_de_usuario = u.id
       WHERE u.id = ?`,
      [session.userId]
    );

    const result = (rows as any[])[0];

    return NextResponse.json({ 
      success: true,
      unreadSuccess: Number(result.unread_success) || 0,
      unreadFailed: Number(result.unread_failed) || 0,
      totalUnread: Number(result.total_unread) || 0
    });

  } catch (error) {
    console.error('❌ [API-ACTIVITY-UNREAD-COUNT] Error:', error);
    return NextResponse.json(
      { error: 'Error al obtener conteo de actividades' },
      { status: 500 }
    );
  }
}