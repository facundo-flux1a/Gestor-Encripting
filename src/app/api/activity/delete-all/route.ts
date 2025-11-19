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

    console.log('🗑️ [DELETE ALL] Iniciando eliminación masiva para usuario:', session.userId);

    // 1️⃣ Obtener TODAS las actividades del usuario (con sus upload_ids)
    const [allActivities] = await conn.query(
      `SELECT a.id, a.upload_id, a.documento_id, a.parent_upload_id, a.documento_nombre
       FROM erp49.actividad a
       INNER JOIN erp49.empresas e ON a.id_de_empresa = e.id
       INNER JOIN erp49.usuarios u ON e.id_de_usuario = u.id
       WHERE u.id = ?`,
      [session.userId]
    );

    const activitiesArray = allActivities as any[];

    if (activitiesArray.length === 0) {
      await conn.rollback();
      conn.release();
      return NextResponse.json({
        success: true,
        message: 'No hay actividades para eliminar',
        deleted: { activities: 0, documents: 0 }
      });
    }

    console.log('📊 [DELETE ALL] Actividades encontradas:', activitiesArray.length);

    // 2️⃣ Recopilar todos los documento_id únicos
    const allDocumentIds = Array.from(
      new Set(
        activitiesArray
          .map(a => a.documento_id)
          .filter(id => id !== null && id !== undefined)
      )
    );

    console.log('📄 [DELETE ALL] Documentos únicos a eliminar:', allDocumentIds.length);

    // 3️⃣ Eliminar TODOS los documentos en la tabla documentos
    if (allDocumentIds.length > 0) {
      const placeholders = allDocumentIds.map(() => '?').join(',');
      
      await conn.query(
        `DELETE FROM erp49.documentos WHERE id IN (${placeholders})`,
        allDocumentIds
      );
      
      console.log('✅ [DELETE ALL] Documentos eliminados:', allDocumentIds.length);
    }

    // 4️⃣ Eliminar TODAS las actividades del usuario
    await conn.query(
      `DELETE a FROM erp49.actividad a
       INNER JOIN erp49.empresas e ON a.id_de_empresa = e.id
       INNER JOIN erp49.usuarios u ON e.id_de_usuario = u.id
       WHERE u.id = ?`,
      [session.userId]
    );

    console.log('✅ [DELETE ALL] Todas las actividades eliminadas:', activitiesArray.length);

    await conn.commit();
    conn.release();

    // 5️⃣ Revalidar rutas
    revalidatePath('/documents');
    revalidatePath('/dashboard');
    revalidatePath('/activity');

    return NextResponse.json({
      success: true,
      message: 'Todas las actividades y documentos relacionados fueron eliminados correctamente',
      deleted: {
        activities: activitiesArray.length,
        documents: allDocumentIds.length
      }
    });

  } catch (error: any) {
    await conn.rollback();
    conn.release();
    console.error('❌ [DELETE ALL] Error:', error);
    return NextResponse.json(
      { error: 'Error al eliminar todas las actividades' },
      { status: 500 }
    );
  }
}