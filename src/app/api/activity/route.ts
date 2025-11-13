import { NextResponse } from 'next/server';
import connection from '@/lib/db';
import { getSession } from '@/services/auth-service';

export async function GET(request: Request) {
  try {
    const session = await getSession();
    
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const empresaId = searchParams.get('empresaId');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    // 🔒 SEGURIDAD: Solo traer actividades de empresas del usuario actual
    let query = `
      SELECT 
        a.id,
        a.upload_id,
        a.id_de_empresa,
        a.documento_id,
        a.documento_nombre,
        a.documento_tipo,
        a.status,
        a.step,
        a.progress,
        a.mensaje,
        a.error_detalle,
        a.created_at,
        a.updated_at,
        a.completed_at,
        e.nombre_de_empresa,
        e.CIF
      FROM erp49.actividad a
      INNER JOIN erp49.empresas e ON a.id_de_empresa = e.id
      INNER JOIN erp49.usuarios u ON e.id_de_usuario = u.id
      WHERE u.id = ?
    `;

    const params: any[] = [session.userId];

    // Filtrar por empresa específica (opcional)
    if (empresaId) {
      query += ` AND a.id_de_empresa = ?`;
      params.push(empresaId);
    }

    query += ` ORDER BY a.created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const [rows] = await connection.query(query, params);

    // Contar total para paginación
    let countQuery = `
      SELECT COUNT(*) as total
      FROM erp49.actividad a
      INNER JOIN erp49.empresas e ON a.id_de_empresa = e.id
      INNER JOIN erp49.usuarios u ON e.id_de_usuario = u.id
      WHERE u.id = ?
    `;
    
    const countParams: any[] = [session.userId];
    
    if (empresaId) {
      countQuery += ` AND a.id_de_empresa = ?`;
      countParams.push(empresaId);
    }

    const [countRows] = await connection.query(countQuery, countParams);
    const total = (countRows as any[])[0].total;

    return NextResponse.json({
      success: true,
      actividades: rows,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    });

  } catch (error: any) {
    console.error('❌ Error al obtener actividad:', error);
    return NextResponse.json(
      { error: 'Error al cargar el historial de actividad' },
      { status: 500 }
    );
  }
}