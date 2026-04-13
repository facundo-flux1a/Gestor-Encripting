import { NextRequest, NextResponse } from 'next/server';
import connection from '@/lib/db';
import { getSession } from '@/services/auth-service';

export const dynamic = 'force-dynamic';

// PATCH - Marcar actividad como leída
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    console.log('👁️ [API-ACTIVITY-MARK-READ] Iniciando...');

    const session = await getSession();

    if (!session) {
      console.warn('⚠️ [API-ACTIVITY-MARK-READ] No hay usuario autenticado');
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const activityId = parseInt(params.id, 10);

    if (isNaN(activityId)) {
      return NextResponse.json({ error: 'ID de actividad inválido' }, { status: 400 });
    }

    console.log('📝 [API-ACTIVITY-MARK-READ] Marcando actividad como leída:', activityId);

    // Obtener información de la actividad a marcar
    const [activities] = await connection.query(
      `SELECT a.id, a.parent_upload_id
       FROM erp49.actividad a
       INNER JOIN erp49.empresas e ON a.id_de_empresa = e.id
       WHERE a.id = ? AND JSON_CONTAINS(e.id_de_usuario, CAST(? AS JSON))`,
      [activityId, session.userId]
    );

    const activitiesArray = activities as any[];

    if (activitiesArray.length === 0) {
      return NextResponse.json({ error: 'Actividad no encontrada' }, { status: 404 });
    }

    const activity = activitiesArray[0];
    const parentUploadId = activity.parent_upload_id;

    // Marcar la actividad como leída
    const [result] = await connection.query(
      `UPDATE erp49.actividad a
       INNER JOIN erp49.empresas e ON a.id_de_empresa = e.id
       SET a.is_new = 0
       WHERE a.id = ? AND JSON_CONTAINS(e.id_de_usuario, CAST(? AS JSON)) AND a.is_new = 1`,
      [activityId, session.userId]
    );

    const updateResult = result as any;
    console.log('✅ [API-ACTIVITY-MARK-READ] Actividad marcada:', { affectedRows: updateResult.affectedRows });

    let parentUpdated = false;

    // Si la actividad es hija de un ZIP, verificar si todos los hermanos están leídos
    if (parentUploadId) {
      console.log('🔍 [API-ACTIVITY-MARK-READ] Verificando hermanos del ZIP:', parentUploadId);

      // Contar cuántos hermanos (hijos del mismo ZIP) siguen sin leer
      const [unreadSiblings] = await connection.query(
        `SELECT COUNT(*) as unread_count
         FROM erp49.actividad a
         INNER JOIN erp49.empresas e ON a.id_de_empresa = e.id
         WHERE a.parent_upload_id = ? AND JSON_CONTAINS(e.id_de_usuario, CAST(? AS JSON)) AND a.is_new = 1`,
        [parentUploadId, session.userId]
      );

      const unreadCount = (unreadSiblings as any[])[0].unread_count;
      console.log('📊 [API-ACTIVITY-MARK-READ] Hermanos sin leer:', unreadCount);

      // Si ya no hay hermanos sin leer, marcar el ZIP padre como leído también
      if (unreadCount === 0) {
        console.log('✨ [API-ACTIVITY-MARK-READ] Todos los hermanos están leídos, marcando ZIP padre...');

        const [parentResult] = await connection.query(
          `UPDATE erp49.actividad a
           INNER JOIN erp49.empresas e ON a.id_de_empresa = e.id
           SET a.is_new = 0
           WHERE a.upload_id = ? AND JSON_CONTAINS(e.id_de_usuario, CAST(? AS JSON)) AND a.parent_upload_id IS NULL AND a.is_new = 1`,
          [parentUploadId, session.userId]
        );

        const parentUpdateResult = parentResult as any;
        parentUpdated = parentUpdateResult.affectedRows > 0;

        console.log('✅ [API-ACTIVITY-MARK-READ] ZIP padre actualizado:', {
          affectedRows: parentUpdateResult.affectedRows
        });
      }
    }

    return NextResponse.json({
      success: true,
      updated: updateResult.affectedRows > 0,
      parentUpdated
    });

  } catch (error) {
    console.error('❌ [API-ACTIVITY-MARK-READ] Error:', error);
    return NextResponse.json(
      { error: 'Error al marcar actividad como leída' },
      { status: 500 }
    );
  }
}