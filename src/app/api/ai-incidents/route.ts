import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/user-service';
import pool, { dbName } from '@/lib/db';
import { RowDataPacket } from 'mysql2';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/ai-incidents
 * Lista todas las incidencias detectadas por IA con filtros
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    
    if (!user) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 401 }
      );
    }

    // Obtener parámetros de filtros
    const searchParams = request.nextUrl.searchParams;
    const empresaIds = searchParams.getAll('empresaIds').map(Number);
    const severidad = searchParams.get('severidad');
    const provider = searchParams.get('provider');
    const tipo = searchParams.get('tipo');

    // ✅ Si no hay empresas seleccionadas, devolver vacío
    if (empresaIds.length === 0) {
      console.log('ℹ️ [AI-INCIDENTS] No hay empresas seleccionadas');
      return NextResponse.json([]);
    }

    // Obtener empresas del usuario para validar permisos
    const [empresasRows] = await pool.query<RowDataPacket[]>(
      `SELECT id FROM ${dbName}.empresas WHERE JSON_CONTAINS(id_de_usuario, CAST(? AS JSON))`,
      [user.id]
    );

    const userEmpresaIds = empresasRows.map(e => e.id);

    if (userEmpresaIds.length === 0) {
      return NextResponse.json([]);
    }

    // Filtrar solo las empresas que pertenecen al usuario
    const filteredEmpresaIds = empresaIds.filter(id => userEmpresaIds.includes(id));

    if (filteredEmpresaIds.length === 0) {
      console.log('⚠️ [AI-INCIDENTS] Las empresas seleccionadas no pertenecen al usuario');
      return NextResponse.json([]);
    }

    // Construir query con filtros (sin JOIN a empresas — nombre_de_empresa está encriptado)
    let query = `
      SELECT 
        ai.id,
        ai.documento_id,
        ai.tipo,
        ai.descripcion,
        ai.severidad,
        ai.provider,
        ai.model,
        ai.analisis_id,
        ai.fecha_creacion as created_at,
        d.numero_documento,
        d.tipo_documento,
        d.fecha_emision,
        d.importe_total,
        d.id_de_empresa
      FROM ${dbName}.ai_incidencias_documento ai
      INNER JOIN ${dbName}.documentos d ON ai.documento_id = d.id
      WHERE d.id_de_empresa IN (?)
    `;

    const params: any[] = [filteredEmpresaIds];

    // Aplicar filtros
    if (severidad) {
      query += ` AND ai.severidad = ?`;
      params.push(severidad);
    }

    if (provider) {
      query += ` AND ai.provider = ?`;
      params.push(provider);
    }

    if (tipo) {
      query += ` AND ai.tipo = ?`;
      params.push(tipo);
    }

    query += ` ORDER BY ai.fecha_creacion DESC`;

    const [rows] = await pool.query<RowDataPacket[]>(query, params);

    // ✅ Hidratar nombres de empresa con Prisma (desencripta automáticamente)
    const uniqueEmpIds = [...new Set(rows.map((r: any) => BigInt(r.id_de_empresa)).filter(Boolean))];
    const empresasData = uniqueEmpIds.length > 0
      ? await prisma.empresas.findMany({
          where: { id: { in: uniqueEmpIds } },
          select: { id: true, nombre_de_empresa: true }
        })
      : [];
    const empMap = new Map(empresasData.map(e => [Number(e.id), e.nombre_de_empresa || '']));

    const result = rows.map((r: any) => ({ ...r, empresa_nombre: empMap.get(r.id_de_empresa) || '' }));

    console.log(`✅ [AI-INCIDENTS] ${rows.length} incidencias encontradas para empresas: ${filteredEmpresaIds.join(', ')}`);

    return NextResponse.json(result);

  } catch (error: any) {
    console.error('❌ Error en /api/ai-incidents:', error);
    return NextResponse.json(
      { 
        error: 'Error al obtener incidencias',
        details: error.message 
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/ai-incidents
 * Elimina una incidencia de IA
 */
export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    
    if (!user) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 401 }
      );
    }

    const { incidentId } = await request.json();

    if (!incidentId) {
      return NextResponse.json(
        { error: 'incidentId es requerido' },
        { status: 400 }
      );
    }

    // Verificar que la incidencia pertenece a un documento del usuario
    const [checkRows] = await pool.query<RowDataPacket[]>(
      `SELECT ai.id 
       FROM ${dbName}.ai_incidencias_documento ai
       INNER JOIN ${dbName}.documentos d ON ai.documento_id = d.id
       INNER JOIN ${dbName}.empresas e ON d.id_de_empresa = e.id
       WHERE ai.id = ? AND JSON_CONTAINS(e.id_de_usuario, CAST(? AS JSON))`,
      [incidentId, user.id]
    );

    if (checkRows.length === 0) {
      return NextResponse.json(
        { error: 'Incidencia no encontrada o sin permisos' },
        { status: 404 }
      );
    }

    // Eliminar incidencia
    await pool.query(
      `DELETE FROM ${dbName}.ai_incidencias_documento WHERE id = ?`,
      [incidentId]
    );

    console.log(`✅ Incidencia ${incidentId} eliminada`);

    return NextResponse.json({ 
      success: true,
      message: 'Incidencia eliminada correctamente' 
    });

  } catch (error: any) {
    console.error('❌ Error en DELETE /api/ai-incidents:', error);
    return NextResponse.json(
      { 
        error: 'Error al eliminar incidencia',
        details: error.message 
      },
      { status: 500 }
    );
  }
}