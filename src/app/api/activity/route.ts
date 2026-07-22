import { NextResponse } from 'next/server';
import { dbName, queryWithRetry } from '@/lib/db';
import { getSession } from '@/services/auth-service';
import { ActivityService } from '@/services/activity-service';
import { prisma } from '@/lib/prisma';

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

    // Empresas del user vía Prisma (evita pool mysql2 crudo que hace ETIMEDOUT)
    const allEmpresas = await prisma.empresas.findMany({
      select: { id: true, nombre_de_empresa: true, CIF: true, id_de_usuario: true },
    });
    const empresasPrisma = allEmpresas.filter((row) => {
      const ids: number[] = Array.isArray(row.id_de_usuario) ? (row.id_de_usuario as any[]) : [];
      return ids.includes(session.userId);
    });
    
    const empresaMap: Record<number, { nombre: string, cif: string }> = {};
    empresasPrisma.forEach(e => {
       empresaMap[Number(e.id)] = { nombre: e.nombre_de_empresa || '', cif: e.CIF || '' };
    });

    let matchedEmpresaIds: number[] = [];
    if (search) {
       const searchLower = search.toLowerCase();
       matchedEmpresaIds = empresasPrisma
         .filter(e => (e.nombre_de_empresa?.toLowerCase().includes(searchLower)) || (e.CIF?.toLowerCase().includes(searchLower)))
         .map(e => Number(e.id));
    }

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
        d.tipo_documento,
        d.numero_documento
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
      let searchCond = `(
        a.documento_nombre LIKE ? OR
        d.tipo_documento LIKE ? OR
        d.numero_documento LIKE ?`;
      const searchParam = `%${search}%`;
      const p = [searchParam, searchParam, searchParam];
      
      if (matchedEmpresaIds.length > 0) {
         searchCond += ` OR a.id_de_empresa IN (${matchedEmpresaIds.map(()=>'?').join(',')})`;
         p.push(...matchedEmpresaIds);
      }
      searchCond += `)`;
      query += ` AND ${searchCond}`;
      params.push(...p);
    }

    query += ` ORDER BY a.created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const [rows] = await queryWithRetry(query, params);

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
      let searchCond = `(
        a.documento_nombre LIKE ? OR
        d.tipo_documento LIKE ? OR
        d.numero_documento LIKE ?`;
      const searchParam = `%${search}%`;
      const p = [searchParam, searchParam, searchParam];
      
      if (matchedEmpresaIds.length > 0) {
         searchCond += ` OR a.id_de_empresa IN (${matchedEmpresaIds.map(()=>'?').join(',')})`;
         p.push(...matchedEmpresaIds);
      }
      searchCond += `)`;
      countQuery += ` AND ${searchCond}`;
      countParams.push(...p);
    }

    const [countRows] = await queryWithRetry(countQuery, countParams);
    const total = (countRows as any[])[0].total;

    // 🔥 PROACTIVE RESCUE: Ahora gestionado por <RetryMonitor /> en el frontend.
    // Se desactiva aquí para evitar reintentos duplicados.
    // Ver: src/components/upload/retry-monitor.tsx

    const docIds = Array.from(new Set((rows as any[]).map(r => r.documento_id).filter(id => id != null)));
    let entidadesByDoc: Record<number, { emisor?: string, cliente?: string }> = {};
    if (docIds.length > 0) {
       const entidades = await prisma.entidades_documento.findMany({
          where: { documento_id: { in: docIds as number[] }, rol: { in: ['emisor', 'cliente'] } },
          select: { documento_id: true, rol: true, nombre: true }
       });
       entidades.forEach(ent => {
          if (!entidadesByDoc[Number(ent.documento_id)]) entidadesByDoc[Number(ent.documento_id)] = {};
          if (ent.rol === 'emisor') entidadesByDoc[Number(ent.documento_id)].emisor = ent.nombre || '';
          if (ent.rol === 'cliente') entidadesByDoc[Number(ent.documento_id)].cliente = ent.nombre || '';
       });
    }

    const formattedRows = (rows as any[]).map(a => {
      let finalA = {
        ...a,
        nombre_de_empresa: empresaMap[a.id_de_empresa]?.nombre || '',
        CIF: empresaMap[a.id_de_empresa]?.cif || '',
        empresa_emisora: entidadesByDoc[a.documento_id]?.emisor || null,
        cliente: entidadesByDoc[a.documento_id]?.cliente || null
      };

      if ((finalA.status?.toLowerCase() === 'fallido' || finalA.status?.toLowerCase() === 'error') && (finalA.retry_count || 0) >= 3) {
        const disclaimer = '⚠️ (Se agotaron los 3 reintentos automáticos)';
        const currentDetail = finalA.error_detalle || 'Error';
        finalA.mensaje = '⚠️ Reintentos automáticos agotados (3/3)';
        finalA.error_detalle = currentDetail.includes(disclaimer) ? currentDetail : `${currentDetail}\n\n${disclaimer}`;
      }
      
      if (finalA.status?.toLowerCase() === 'completado' && (finalA.retry_count || 0) > 0) {
        finalA.mensaje = `✅ Completado tras ${(finalA.retry_count || 0)} reintentos automáticos`;
      }

      return finalA;
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

    const [checkRows] = await queryWithRetry(
      `SELECT a.id 
       FROM ${dbName}.actividad a
       INNER JOIN ${dbName}.empresas e ON a.id_de_empresa = e.id
       WHERE a.id = ? AND JSON_CONTAINS(e.id_de_usuario, CAST(? AS JSON))`,
      [activityId, session.userId]
    );

    if ((checkRows as any[]).length === 0) {
      return NextResponse.json({ error: 'Actividad no encontrada' }, { status: 404 });
    }

    await queryWithRetry(
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