import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/services/api-key-service';
import db from '@/lib/db';
import type { RowDataPacket } from 'mysql2';
import { prisma } from '@/lib/prisma';
import { hashField, normalizeEntityName } from '@/lib/encryption';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/products
 * 
 * Devuelve un listado detallado del histórico de productos y servicios adquiridos.
 */
export async function GET(request: NextRequest) {
  try {
    const rawKey = request.headers.get('x-api-key') || '';

    if (!rawKey) {
      return NextResponse.json({ error: 'Header X-Api-Key requerido.' }, { status: 401 });
    }

    const authResult = await validateApiKey(rawKey);
    if (!authResult.valid || !authResult.empresa_id) {
      return NextResponse.json({ error: 'API Key inválida o revocada.' }, { status: 401 });
    }

    const empresaId = authResult.empresa_id;

    const searchParams = request.nextUrl.searchParams;
    const trimestreParam = searchParams.get('trimestre');
    const añoParam = searchParams.get('año');
    const productoParam = searchParams.get('producto');
    const proveedorParam = searchParams.get('proveedor');

    let query = `
      SELECT 
        l.id as linea_id,
        l.descripcion as producto,
        l.cantidad,
        l.precio_unitario,
        l.importe_linea,
        d.id as documento_id,
        d.numero_documento,
        d.fecha_emision
      FROM lineas_documento l
      JOIN documentos d ON l.documento_id = d.id
      WHERE d.id_de_empresa = ?
    `;

    const params: any[] = [empresaId];

    if (trimestreParam) {
      query += ` AND d.num_trimestre = ?`;
      params.push(Number(trimestreParam));
    }

    if (añoParam) {
      query += ` AND d.año_trimestre = ?`;
      params.push(Number(añoParam));
    }

    if (productoParam) {
      query += ` AND l.descripcion LIKE ?`;
      params.push(`%${productoParam}%`);
    }



    query += ` ORDER BY d.fecha_emision DESC LIMIT 1000`; // Limit to avoid massive payloads if unchecked

    const [rows] = await db.query<RowDataPacket[]>(query, params);

    const docIds = Array.from(new Set(rows.map((r: any) => r.documento_id)));
    let entidadesByDoc: Record<number, any> = {};
    if (docIds.length > 0) {
      const entidadesPrisma = await prisma.entidades_documento.findMany({
        where: { documento_id: { in: docIds as number[] }, rol: { in: ['emisor', 'proveedor'] } },
        select: { documento_id: true, nombre: true, identificador_fiscal: true }
      });
      entidadesPrisma.forEach(e => entidadesByDoc[Number(e.documento_id)] = e);
    }

    let formattedData = rows.map((r: any) => ({
      id: r.linea_id,
      producto_servicio: r.producto,
      cantidad: Number(r.cantidad) || 0,
      precio_unitario: Number(r.precio_unitario) || 0,
      importe_total: Number(r.importe_linea) || 0,
      documento_origen: {
        id: r.documento_id,
        numero: r.numero_documento,
        fecha: r.fecha_emision
      },
      proveedor: {
        nombre: entidadesByDoc[r.documento_id]?.nombre || 'Desconocido',
        cif: entidadesByDoc[r.documento_id]?.identificador_fiscal || ''
      }
    }));

    if (proveedorParam) {
      const term = proveedorParam.toLowerCase();
      formattedData = formattedData.filter((item: any) => {
        return (item.proveedor.nombre?.toLowerCase().includes(term) || item.proveedor.cif?.toLowerCase().includes(term));
      });
    }

    return NextResponse.json(
      {
        total_resultados: formattedData.length,
        data: formattedData
      },
      { status: 200 }
    );

  } catch (error: any) {
    console.error('❌ [GET /api/v1/products] Error:', error);
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 });
  }
}
