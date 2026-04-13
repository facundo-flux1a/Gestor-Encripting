import { NextRequest, NextResponse } from 'next/server';
import connection from '@/lib/db';
import { getSession } from '@/services/auth-service';

export const dynamic = 'force-dynamic';

// PATCH - Marcar múltiples actividades como leídas
export async function PATCH(request: NextRequest) {
    try {
        console.log('👁️ [API-ACTIVITY-MARK-MULTIPLE-READ] Iniciando...');

        const session = await getSession();

        if (!session) {
            console.warn('⚠️ [API-ACTIVITY-MARK-MULTIPLE-READ] No hay usuario autenticado');
            return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
        }

        const { activityIds } = await request.json();

        if (!Array.isArray(activityIds) || activityIds.length === 0) {
            return NextResponse.json(
                { error: 'Se requiere un array de IDs de actividad' },
                { status: 400 }
            );
        }

        console.log('📝 [API-ACTIVITY-MARK-MULTIPLE-READ] Marcando actividades:', activityIds);

        let totalUpdated = 0;
        const parentUploadsToCheck = new Set<string>();

        // Procesar cada actividad
        for (const activityId of activityIds) {
            // Obtener información de la actividad
            const [activities] = await connection.query(
                `SELECT a.id, a.parent_upload_id
         FROM erp49.actividad a
         INNER JOIN erp49.empresas e ON a.id_de_empresa = e.id
         WHERE a.id = ? AND JSON_CONTAINS(e.id_de_usuario, CAST(? AS JSON))`,
                [activityId, session.userId]
            );

            const activitiesArray = activities as any[];

            if (activitiesArray.length === 0) {
                console.warn(`⚠️ Actividad ${activityId} no encontrada o no pertenece al usuario`);
                continue;
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
            if (updateResult.affectedRows > 0) {
                totalUpdated++;
            }

            // Si tiene parent_upload_id, guardarlo para verificar después
            if (parentUploadId) {
                parentUploadsToCheck.add(parentUploadId);
            }
        }

        // Verificar y marcar ZIPs padres si todos sus hijos están leídos
        let parentsUpdated = 0;
        for (const parentUploadId of parentUploadsToCheck) {
            console.log('🔍 [API-ACTIVITY-MARK-MULTIPLE-READ] Verificando hermanos del ZIP:', parentUploadId);

            // Contar cuántos hermanos siguen sin leer
            const [unreadSiblings] = await connection.query(
                `SELECT COUNT(*) as unread_count
         FROM erp49.actividad a
         INNER JOIN erp49.empresas e ON a.id_de_empresa = e.id
         WHERE a.parent_upload_id = ? AND JSON_CONTAINS(e.id_de_usuario, CAST(? AS JSON)) AND a.is_new = 1`,
                [parentUploadId, session.userId]
            );

            const unreadCount = (unreadSiblings as any[])[0].unread_count;
            console.log('📊 [API-ACTIVITY-MARK-MULTIPLE-READ] Hermanos sin leer:', unreadCount);

            // Si ya no hay hermanos sin leer, marcar el ZIP padre
            if (unreadCount === 0) {
                console.log('✨ [API-ACTIVITY-MARK-MULTIPLE-READ] Todos los hermanos están leídos, marcando ZIP padre...');

                const [parentResult] = await connection.query(
                    `UPDATE erp49.actividad a
           INNER JOIN erp49.empresas e ON a.id_de_empresa = e.id
           SET a.is_new = 0
           WHERE a.upload_id = ? AND JSON_CONTAINS(e.id_de_usuario, CAST(? AS JSON)) AND a.parent_upload_id IS NULL AND a.is_new = 1`,
                    [parentUploadId, session.userId]
                );

                const parentUpdateResult = parentResult as any;
                if (parentUpdateResult.affectedRows > 0) {
                    parentsUpdated++;
                }
            }
        }

        console.log('✅ [API-ACTIVITY-MARK-MULTIPLE-READ] Completado:', {
            totalUpdated,
            parentsUpdated,
            requested: activityIds.length
        });

        return NextResponse.json({
            success: true,
            updated: totalUpdated,
            parentsUpdated,
            message: `${totalUpdated} actividades marcadas como vistas`
        });

    } catch (error) {
        console.error('❌ [API-ACTIVITY-MARK-MULTIPLE-READ] Error:', error);
        return NextResponse.json(
            { error: 'Error al marcar actividades como leídas' },
            { status: 500 }
        );
    }
}
