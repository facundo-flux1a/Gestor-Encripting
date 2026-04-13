import { NextResponse } from 'next/server';
import connection from '@/lib/db';
import { getSession } from '@/services/auth-service';
import { revalidatePath } from 'next/cache';

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

    console.log('🗑️ [DELETE ALL] Iniciando eliminación de actividades para usuario:', session.userId);

    // 1️⃣ Contar actividades antes de eliminar
    const [countResult] = await conn.query(
      `SELECT COUNT(*) as total
       FROM erp49.actividad a
       INNER JOIN erp49.empresas e ON a.id_de_empresa = e.id
       WHERE JSON_CONTAINS(e.id_de_usuario, CAST(? AS JSON))`,
      [session.userId]
    );

    const totalActivities = (countResult as any[])[0]?.total || 0;

    if (totalActivities === 0) {
      await conn.rollback();
      conn.release();
      return NextResponse.json({
        success: true,
        message: 'No hay actividades para eliminar',
        deleted: { activities: 0 }
      });
    }

    console.log('📊 [DELETE ALL] Actividades a eliminar:', totalActivities);

    // 2️⃣ Eliminar SOLO las actividades (NO los documentos)
    await conn.query(
      `DELETE a FROM erp49.actividad a
       INNER JOIN erp49.empresas e ON a.id_de_empresa = e.id
       WHERE JSON_CONTAINS(e.id_de_usuario, CAST(? AS JSON))`,
      [session.userId]
    );

    console.log('✅ [DELETE ALL] Actividades eliminadas:', totalActivities);

    await conn.commit();
    conn.release();

    // 3️⃣ Revalidar rutas
    revalidatePath('/documents');
    revalidatePath('/dashboard');
    revalidatePath('/activity');

    return NextResponse.json({
      success: true,
      message: 'Todas las actividades fueron eliminadas correctamente',
      deleted: {
        activities: totalActivities
      }
    });

  } catch (error: any) {
    await conn.rollback();
    conn.release();
    console.error('❌ [DELETE ALL] Error:', error);
    return NextResponse.json(
      { error: 'Error al eliminar las actividades' },
      { status: 500 }
    );
  }
}