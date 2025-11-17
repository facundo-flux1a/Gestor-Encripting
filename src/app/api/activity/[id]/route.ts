import { NextResponse } from 'next/server';
import connection from '@/lib/db';
import { getSession } from '@/services/auth-service';

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const activityId = params.id;

    // Verificar que la actividad pertenece al usuario
    const [checkRows] = await connection.query(
      `SELECT a.id 
       FROM erp49.actividad a
       INNER JOIN erp49.empresas e ON a.id_de_empresa = e.id
       INNER JOIN erp49.usuarios u ON e.id_de_usuario = u.id
       WHERE a.id = ? AND u.id = ?`,
      [activityId, session.userId]
    );

    if ((checkRows as any[]).length === 0) {
      return NextResponse.json({ error: 'Actividad no encontrada' }, { status: 404 });
    }

    // Eliminar actividad
    await connection.query(
      'DELETE FROM erp49.actividad WHERE id = ?',
      [activityId]
    );

    return NextResponse.json({
      success: true,
      message: 'Actividad eliminada correctamente',
    });

  } catch (error: any) {
    console.error('❌ Error al eliminar actividad:', error);
    return NextResponse.json(
      { error: 'Error al eliminar la actividad' },
      { status: 500 }
    );
  }
}