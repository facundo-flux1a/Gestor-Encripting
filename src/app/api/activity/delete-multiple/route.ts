import { NextResponse } from 'next/server';
import connection from '@/lib/db';
import { getSession } from '@/services/auth-service';
import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic';

// DELETE - Eliminar múltiples actividades
export async function DELETE(request: Request) {
    const conn = await connection.getConnection();

    try {
        await conn.beginTransaction();

        const session = await getSession();

        if (!session) {
            await conn.rollback();
            conn.release();
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const { activityIds } = await request.json();

        if (!Array.isArray(activityIds) || activityIds.length === 0) {
            await conn.rollback();
            conn.release();
            return NextResponse.json(
                { error: 'Se requiere un array de IDs de actividad' },
                { status: 400 }
            );
        }

        console.log('🗑️ [DELETE MULTIPLE] Iniciando eliminación de actividades:', activityIds);

        // Verificar que todas las actividades pertenecen al usuario
        const placeholders = activityIds.map(() => '?').join(',');
        const [countResult] = await conn.query(
            `SELECT COUNT(*) as total
       FROM erp49.actividad a
       INNER JOIN erp49.empresas e ON a.id_de_empresa = e.id
       INNER JOIN erp49.usuarios u ON e.id_de_usuario = u.id
       WHERE a.id IN (${placeholders}) AND u.id = ?`,
            [...activityIds, session.userId]
        );

        const totalFound = (countResult as any[])[0]?.total || 0;

        if (totalFound === 0) {
            await conn.rollback();
            conn.release();
            return NextResponse.json({
                success: true,
                message: 'No se encontraron actividades para eliminar',
                deleted: 0
            });
        }

        console.log('📊 [DELETE MULTIPLE] Actividades encontradas:', totalFound);

        // Eliminar las actividades
        await conn.query(
            `DELETE a FROM erp49.actividad a
       INNER JOIN erp49.empresas e ON a.id_de_empresa = e.id
       INNER JOIN erp49.usuarios u ON e.id_de_usuario = u.id
       WHERE a.id IN (${placeholders}) AND u.id = ?`,
            [...activityIds, session.userId]
        );

        console.log('✅ [DELETE MULTIPLE] Actividades eliminadas:', totalFound);

        await conn.commit();
        conn.release();

        // Revalidar rutas
        revalidatePath('/documents');
        revalidatePath('/dashboard');
        revalidatePath('/activity');

        return NextResponse.json({
            success: true,
            message: `${totalFound} actividades eliminadas correctamente`,
            deleted: totalFound
        });

    } catch (error: any) {
        await conn.rollback();
        conn.release();
        console.error('❌ [DELETE MULTIPLE] Error:', error);
        return NextResponse.json(
            { error: 'Error al eliminar las actividades' },
            { status: 500 }
        );
    }
}
