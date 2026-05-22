import { NextResponse } from 'next/server';
import connection, { dbName } from '@/lib/db';
import { getSession } from '@/services/auth-service';
import { ActivityService } from '@/services/activity-service';

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
        a.retry_count,
        a.created_at,
        a.updated_at,
        a.completed_at,
        a.is_new,
        a.\`dashboard-correo\`,
        e.nombre_de_empresa,
        e.CIF,
        d.tipo_documento,
        d.numero_documento,
        (SELECT nombre FROM ${dbName}.entidades_documento WHERE documento_id = d.id AND rol = 'emisor' LIMIT 1) as empresa_emisora,
        (SELECT nombre FROM ${dbName}.entidades_documento WHERE documento_id = d.id AND rol = 'cliente' LIMIT 1) as cliente
      FROM ${dbName}.actividad a
      INNER JOIN ${dbName}.empresas e ON a.id_de_empresa = e.id
      LEFT JOIN ${dbName}.documentos d ON a.documento_id = d.id
      WHERE JSON_CONTAINS(e.id_de_usuario, CAST(? AS JSON))
    `;

    const params: any[] = [session.userId];

    // Filtros
    if (empresaId) {
      const empresaIds = empresaId.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
      if (empresaIds.length > 0) {
        query += ` AND a.id_de_empresa IN (${empresaIds.map(() => '?').join(',')})`;
        params.push(...empresaIds);
      }
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
      FROM ${dbName}.actividad a
      INNER JOIN ${dbName}.empresas e ON a.id_de_empresa = e.id
      LEFT JOIN ${dbName}.documentos d ON a.documento_id = d.id
      WHERE JSON_CONTAINS(e.id_de_usuario, CAST(? AS JSON))
    `;

    const countParams: any[] = [session.userId];

    if (empresaId) {
      const empresaIds = empresaId.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
      if (empresaIds.length > 0) {
        countQuery += ` AND a.id_de_empresa IN (${empresaIds.map(() => '?').join(',')})`;
        countParams.push(...empresaIds);
      }
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

    // 🔥 PROACTIVE RESCUE: Ahora gestionado por <RetryMonitor /> en el frontend.
    // Se desactiva aquí para evitar reintentos duplicados.
    // Ver: src/components/upload/retry-monitor.tsx

    // 🔥 FORMATEO DINÁMICO: Inyectar mensaje de agotado si retry_count >= 3
    const formattedRows = (rows as any[]).map(a => {
      if ((a.status?.toLowerCase() === 'fallido' || a.status?.toLowerCase() === 'error') && (a.retry_count || 0) >= 3) {
        const disclaimer = '⚠️ (Se agotaron los 3 reintentos automáticos)';
        const currentDetail = a.error_detalle || 'Error';
        return {
          ...a,
          mensaje: '⚠️ Reintentos automáticos agotados (3/3)',
          error_detalle: currentDetail.includes(disclaimer) ? currentDetail : `${currentDetail}\n\n${disclaimer}`
        };
      }
      
      // ✅ ÉXITO TRAS REINTENTO: Indicar que se logró tras varios intentos
      if (a.status?.toLowerCase() === 'completado' && (a.retry_count || 0) > 0) {
        return {
          ...a,
          mensaje: `✅ Completado tras ${(a.retry_count || 0)} reintentos automáticos`
        };
      }

      return a;
    });

    return NextResponse.json({
      success: true,
      actividades: formattedRows,
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
       FROM ${dbName}.actividad a
       INNER JOIN ${dbName}.empresas e ON a.id_de_empresa = e.id
       WHERE a.id = ? AND JSON_CONTAINS(e.id_de_usuario, CAST(? AS JSON))`,
      [activityId, session.userId]
    );

    if ((checkRows as any[]).length === 0) {
      return NextResponse.json({ error: 'Actividad no encontrada' }, { status: 404 });
    }

    await connection.query(
      `DELETE FROM ${dbName}.actividad WHERE id = ?`,
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