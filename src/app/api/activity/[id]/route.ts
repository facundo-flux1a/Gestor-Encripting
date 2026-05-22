import { NextResponse } from 'next/server';
import connection, { dbName } from '@/lib/db';
import { getSession } from '@/services/auth-service';
import { revalidatePath } from 'next/cache';

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const conn = await connection.getConnection();

  try {
    await conn.beginTransaction();

    const session = await getSession();

    if (!session) {
      await conn.rollback();
      conn.release();
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const activityId = params.id;

    // 1️⃣ Obtener actividad padre Y su upload_id
    const [checkRows] = await conn.query(
      `SELECT a.id, a.upload_id, a.documento_id, a.documento_nombre, a.parent_upload_id
       FROM ${dbName}.actividad a
       INNER JOIN ${dbName}.empresas e ON a.id_de_empresa = e.id
       WHERE a.id = ? AND JSON_CONTAINS(e.id_de_usuario, CAST(? AS JSON))`,
      [activityId, session.userId]
    );

    if ((checkRows as any[]).length === 0) {
      await conn.rollback();
      conn.release();
      return NextResponse.json({ error: 'Actividad no encontrada' }, { status: 404 });
    }

    const activity = (checkRows as any[])[0];
    const uploadId = activity.upload_id;
    const documentoId = activity.documento_id;

    console.log('🗑️ [DELETE Activity] Eliminando:', {
      activityId,
      uploadId,
      documentoId,
      nombre: activity.documento_nombre,
      parentUploadId: activity.parent_upload_id
    });

    // 2️⃣ Buscar actividades hijas (que tengan este upload_id como parent_upload_id)
    const [childActivities] = await conn.query(
      `SELECT id, documento_id, upload_id, documento_nombre
       FROM ${dbName}.actividad 
       WHERE parent_upload_id = ?`,
      [uploadId]
    );

    const childActivitiesArray = childActivities as any[];
    const childDocumentIds = childActivitiesArray
      .map(a => a.documento_id)
      .filter(id => id !== null && id !== undefined);

    console.log('👶 [DELETE Activity] Actividades hijas encontradas:', childActivitiesArray.length);

    if (childActivitiesArray.length > 0) {
      console.log('📄 [DELETE Activity] Documentos hijos:', childActivitiesArray.map(a => ({
        id: a.id,
        nombre: a.documento_nombre,
        documentoId: a.documento_id
      })));
    }

    // 3️⃣ Eliminar TODOS los documentos (padre + hijos) en la tabla documentos
    const allDocumentIds = [documentoId, ...childDocumentIds].filter(id => id !== null && id !== undefined);

    if (allDocumentIds.length > 0) {
      console.log('🗑️ [DELETE Activity] Eliminando documentos de la tabla "documentos":', allDocumentIds);

      const placeholders = allDocumentIds.map(() => '?').join(',');

      // ✅ Las tablas relacionadas se eliminarán en cascada si tienes ON DELETE CASCADE
      await conn.query(
        `DELETE FROM ${dbName}.documentos WHERE id IN (${placeholders})`,
        allDocumentIds
      );

      console.log('✅ [DELETE Activity] Documentos eliminados correctamente');
    }

    // 4️⃣ Eliminar actividad padre
    await conn.query(
      `DELETE FROM ${dbName}.actividad WHERE id = ?`,
      [activityId]
    );
    console.log('✅ [DELETE Activity] Actividad padre eliminada');

    // 5️⃣ Eliminar TODAS las actividades hijas
    if (childActivitiesArray.length > 0) {
      const childIds = childActivitiesArray.map(a => a.id);
      const placeholders = childIds.map(() => '?').join(',');

      await conn.query(
        `DELETE FROM ${dbName}.actividad WHERE id IN (${placeholders})`,
        childIds
      );

      console.log('✅ [DELETE Activity] Actividades hijas eliminadas:', childIds.length);
    }

    await conn.commit();
    conn.release();

    // 6️⃣ Revalidar rutas para refrescar la UI
    revalidatePath('/documents');
    revalidatePath('/dashboard');
    revalidatePath('/activity');

    return NextResponse.json({
      success: true,
      message: 'Actividad y documentos relacionados eliminados correctamente',
      deleted: {
        activities: 1 + childActivitiesArray.length,
        documents: allDocumentIds.length
      }
    });

  } catch (error: any) {
    await conn.rollback();
    conn.release();
    console.error('❌ Error al eliminar actividad:', error);
    return NextResponse.json(
      { error: 'Error al eliminar la actividad' },
      { status: 500 }
    );
  }
}