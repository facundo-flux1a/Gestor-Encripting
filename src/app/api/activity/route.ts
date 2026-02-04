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

    // Nuevos filtros
    const status = searchParams.get('status');
    const tipoDocumento = searchParams.get('tipoDocumento');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const search = searchParams.get('search');

    // Query con LEFT JOIN - INCLUYE is_new y dashboard-correo
    let query = `
      SELECT 
        a.id,
        a.upload_id,
        a.parent_upload_id,
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
        a.is_new,
        a.\`dashboard-correo\`,
        e.nombre_de_empresa,
        e.CIF,
        d.tipo_documento,
        d.numero_documento,
        (SELECT nombre FROM erp49.entidades_documento WHERE documento_id = d.id AND rol = 'emisor' LIMIT 1) as empresa_emisora,
        (SELECT nombre FROM erp49.entidades_documento WHERE documento_id = d.id AND rol = 'cliente' LIMIT 1) as cliente
      FROM erp49.actividad a
      INNER JOIN erp49.empresas e ON a.id_de_empresa = e.id
      INNER JOIN erp49.usuarios u ON e.id_de_usuario = u.id
      LEFT JOIN erp49.documentos d ON a.documento_id = d.id
      WHERE u.id = ?
    `;

    const params: any[] = [session.userId];

    // Filtros
    if (empresaId) {
      query += ` AND a.id_de_empresa = ?`;
      params.push(empresaId);
    }

    if (status) {
      const statuses = status.split(',').map(s => s.trim()).filter(Boolean);
      if (statuses.length > 0) {
        const statusConditions = statuses.map(() => `LOWER(a.status) LIKE ?`).join(' OR ');
        query += ` AND (${statusConditions})`;
        statuses.forEach(s => params.push(`%${s.toLowerCase()}%`));
      }
    }

    if (tipoDocumento) {
      query += ` AND d.tipo_documento LIKE ?`;
      params.push(`%${tipoDocumento}%`);
    }

    if (dateFrom) {
      query += ` AND DATE(a.created_at) >= ?`;
      params.push(dateFrom);
    }

    if (dateTo) {
      query += ` AND DATE(a.created_at) <= ?`;
      params.push(dateTo);
    }

    if (search) {
      query += ` AND (
        a.documento_nombre LIKE ? OR
        e.nombre_de_empresa LIKE ? OR
        e.CIF LIKE ? OR
        d.tipo_documento LIKE ? OR
        d.numero_documento LIKE ?
      )`;
      const searchParam = `%${search}%`;
      params.push(searchParam, searchParam, searchParam, searchParam, searchParam);
    }

    query += ` ORDER BY a.created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const [rows] = await connection.query(query, params);

    // Contar total
    let countQuery = `
      SELECT COUNT(*) as total
      FROM erp49.actividad a
      INNER JOIN erp49.empresas e ON a.id_de_empresa = e.id
      INNER JOIN erp49.usuarios u ON e.id_de_usuario = u.id
      LEFT JOIN erp49.documentos d ON a.documento_id = d.id
      WHERE u.id = ?
    `;

    const countParams: any[] = [session.userId];

    if (empresaId) {
      countQuery += ` AND a.id_de_empresa = ?`;
      countParams.push(empresaId);
    }

    if (status) {
      const statuses = status.split(',').map(s => s.trim()).filter(Boolean);
      if (statuses.length > 0) {
        const statusConditions = statuses.map(() => `LOWER(a.status) LIKE ?`).join(' OR ');
        countQuery += ` AND (${statusConditions})`;
        statuses.forEach(s => countParams.push(`%${s.toLowerCase()}%`));
      }
    }

    if (tipoDocumento) {
      countQuery += ` AND d.tipo_documento LIKE ?`;
      countParams.push(`%${tipoDocumento}%`);
    }

    if (dateFrom) {
      countQuery += ` AND DATE(a.created_at) >= ?`;
      countParams.push(dateFrom);
    }

    if (dateTo) {
      countQuery += ` AND DATE(a.created_at) <= ?`;
      countParams.push(dateTo);
    }

    if (search) {
      countQuery += ` AND (
        a.documento_nombre LIKE ? OR
        e.nombre_de_empresa LIKE ? OR
        e.CIF LIKE ? OR
        d.tipo_documento LIKE ? OR
        d.numero_documento LIKE ?
      )`;
      const searchParam = `%${search}%`;
      countParams.push(searchParam, searchParam, searchParam, searchParam, searchParam);
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

export async function DELETE(request: Request) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const url = new URL(request.url);
    const pathSegments = url.pathname.split('/');
    const activityId = pathSegments[pathSegments.length - 1];

    if (!activityId || activityId === 'activity') {
      return NextResponse.json({ error: 'ID de actividad requerido' }, { status: 400 });
    }

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