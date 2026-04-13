import { NextRequest, NextResponse } from 'next/server';
import connection from '@/lib/db';
import { getSession } from '@/services/auth-service';

export const dynamic = 'force-dynamic';

// PATCH - Marcar TODAS las actividades como leídas
export async function PATCH(request: NextRequest) {
  try {
    console.log('👁️ [API-ACTIVITY-MARK-ALL-READ] Iniciando...');

    const session = await getSession();

    if (!session) {
      console.warn('⚠️ [API-ACTIVITY-MARK-ALL-READ] No hay usuario autenticado');
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    console.log('📝 [API-ACTIVITY-MARK-ALL-READ] Marcando todas las actividades como leídas para usuario:', session.userId);

    // Marcar todas las actividades del usuario como leídas
    const [result] = await connection.query(
      `UPDATE erp49.actividad a
       INNER JOIN erp49.empresas e ON a.id_de_empresa = e.id
       SET a.is_new = 0
       WHERE JSON_CONTAINS(e.id_de_usuario, CAST(? AS JSON)) AND a.is_new = 1`,
      [session.userId]
    );

    const updateResult = result as any;
    console.log('✅ [API-ACTIVITY-MARK-ALL-READ] Resultado:', { affectedRows: updateResult.affectedRows });

    return NextResponse.json({
      success: true,
      updated: updateResult.affectedRows
    });

  } catch (error) {
    console.error('❌ [API-ACTIVITY-MARK-ALL-READ] Error:', error);
    return NextResponse.json(
      { error: 'Error al marcar actividades como leídas' },
      { status: 500 }
    );
  }
}