import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/services/api-key-service';
import db from '@/lib/db';
import type { RowDataPacket } from 'mysql2';

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
        d.fecha_emision,
        ent.nombre as proveedor_nombre,
        ent.identificador_fiscal as proveedor_cif
      FROM lineas_documento l
      JOIN documentos d ON l.documento_id = d.id
      LEFT JOIN entidades_documento ent ON d.id = ent.documento_id AND ent.rol IN ('emisor', 'proveedor')
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

    if (proveedorParam) {
      query += ` AND (ent.nombre LIKE ? OR ent.identificador_fiscal LIKE ?)`;
      params.push(`%${proveedorParam}%`, `%${proveedorParam}%`);
    }

    query += ` ORDER BY d.fecha_emision DESC LIMIT 1000`; // Limit to avoid massive payloads if unchecked

    const [rows] = await db.query<RowDataPacket[]>(query, params);

    const formattedData = rows.map((r: any) => ({
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
        nombre: r.proveedor_nombre || 'Desconocido',
        cif: r.proveedor_cif || ''
      }
    }));

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
