import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/services/api-key-service';
import db from '@/lib/db';
import type { RowDataPacket } from 'mysql2';
import { prisma } from '@/lib/prisma';


export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/quarters
 *
 * Autenticación (header obligatorio):
 *   X-Api-Key: muvail_xxxxx
 *
 * Query params (todos opcionales):
 *   año        (number)  — filtra por año fiscal
 *   trimestre  (1|2|3|4) — filtra por trimestre específico
 *   cerrado    (true|false) — filtra por estado de cierre
 *
 * Respuesta 200:
 * {
 *   "empresa": "Nombre Empresa S.L.",
 *   "empresa_id": 64,
 *   "trimestres": [
 *     {
 *       "id": 24,
 *       "año": 2025,
 *       "trimestre": 4,
 *       "cerrado": true,
 *       "fecha_cierre": "2026-01-12T20:22:58.000Z",
 *       "total_documentos": 3,
 *       "total_ingresos": "706.04",
 *       "total_gastos": "706.04",
 *       "iva_repercutido": "-43.52",
 *       "iva_soportado": "-43.52",
 *       "resultado_iva": 0,        // iva_repercutido - iva_soportado
 *       "fecha_creacion": "...",
 *       "fecha_actualizacion": "..."
 *     }
 *   ]
 * }
 */
export async function GET(request: NextRequest) {
  try {
    // 1. Autenticación
    const rawKey = request.headers.get('x-api-key') || '';
    if (!rawKey) {
      return NextResponse.json({ error: 'Header X-Api-Key requerido.' }, { status: 401 });
    }

    const authResult = await validateApiKey(rawKey);
    if (!authResult.valid || !authResult.empresa_id) {
      return NextResponse.json({ error: 'API Key inválida o revocada.' }, { status: 401 });
    }

    const empresaId = authResult.empresa_id;

    // 2. Filtros opcionales desde query params
    const { searchParams } = request.nextUrl;
    const año = searchParams.get('año') ? Number(searchParams.get('año')) : null;
    const trimestre = searchParams.get('trimestre') ? Number(searchParams.get('trimestre')) : null;
    const cerradoParam = searchParams.get('cerrado');
    const cerrado: boolean | null = cerradoParam === 'true' ? true : cerradoParam === 'false' ? false : null;

    if (trimestre !== null && (trimestre < 1 || trimestre > 4)) {
      return NextResponse.json({ error: '"trimestre" debe ser 1, 2, 3 o 4.' }, { status: 400 });
    }

    // 3. Query
    let query = `
      SELECT
        t.id,
        t.año,
        t.num_trimestre   AS trimestre,
        t.cerrado,
        t.fecha_cierre,
        t.total_documentos,
        t.total_ingresos,
        t.total_gastos,
        t.iva_repercutido,
        t.iva_soportado,
        t.fecha_creacion,
        t.fecha_actualizacion
      FROM trimestres t
      WHERE t.id_de_empresa = ?
    `;
    const params: any[] = [empresaId];

    if (año !== null) {
      query += ` AND t.año = ?`;
      params.push(año);
    }
    if (trimestre !== null) {
      query += ` AND t.num_trimestre = ?`;
      params.push(trimestre);
    }
    if (cerrado !== null) {
      query += ` AND t.cerrado = ?`;
      params.push(cerrado ? 1 : 0);
    }

    query += ` ORDER BY t.año DESC, t.num_trimestre DESC`;

    const [rows] = await db.query<RowDataPacket[]>(query, params);

    if (rows.length === 0) {
      return NextResponse.json(
        { error: 'No se encontraron trimestres con los filtros indicados.' },
        { status: 404 }
      );
    }

    // 4. Formatear respuesta
    const trimestres = rows.map((r: any) => {
      const ivaRep = Number(r.iva_repercutido) || 0;
      const ivaSop = Number(r.iva_soportado) || 0;
      return {
        id: r.id,
        año: r.año,
        trimestre: r.trimestre,
        label: `${r.trimestre}T ${r.año}`,
        cerrado: Boolean(r.cerrado),
        fecha_cierre: r.fecha_cierre || null,
        total_documentos: r.total_documentos || 0,
        total_ingresos: Number(r.total_ingresos) || 0,
        total_gastos: Number(r.total_gastos) || 0,
        iva_repercutido: ivaRep,
        iva_soportado: ivaSop,
        resultado_iva: parseFloat((ivaRep - ivaSop).toFixed(2)),
        fecha_creacion: r.fecha_creacion,
        fecha_actualizacion: r.fecha_actualizacion,
      };
    });

    // ✅ Hidratar nombre de empresa con Prisma (desencripta automáticamente)
    const empresaData = await prisma.empresas.findUnique({
      where: { id: BigInt(empresaId) },
      select: { nombre_de_empresa: true, CIF: true }
    });

    return NextResponse.json({
      empresa: empresaData?.nombre_de_empresa || '',
      empresa_cif: empresaData?.CIF || '',
      empresa_id: empresaId,
      trimestres,
    });

  } catch (error) {
    console.error('❌ [api/v1/quarters] Error:', error);
    return NextResponse.json({ error: 'Error interno al obtener los trimestres.' }, { status: 500 });
  }
}
