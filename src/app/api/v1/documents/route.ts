import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/services/api-key-service';
import db from '@/lib/db';
import type { RowDataPacket } from 'mysql2';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/documents
 *
 * Autenticación (header obligatorio):
 *   X-Api-Key: flux_xxxxx
 *
 * Query Parameters (opcionales):
 *   ?trimestre=3
 *   &año=2025
 *   &proveedor=García
 *   &cliente=Pérez
 *   &tipo=recibidas (emitidas | recibidas | todas)
 *
 * Respuesta: JSON con la lista de documentos, impuestos, líneas y URL de archivo.
 */
export async function GET(request: NextRequest) {
  try {
    // 1. Extraer API Key del header
    const rawKey = request.headers.get('x-api-key') || '';

    if (!rawKey) {
      return NextResponse.json(
        { error: 'Header X-Api-Key requerido.' },
        { status: 401 }
      );
    }

    // 2. Validar la clave
    const authResult = await validateApiKey(rawKey);
    if (!authResult.valid || !authResult.empresa_id) {
      return NextResponse.json(
        { error: 'API Key inválida o revocada.' },
        { status: 401 }
      );
    }

    const empresaId = authResult.empresa_id;

    // 3. Leer filtros de la URL
    const searchParams = request.nextUrl.searchParams;
    const trimestreParam = searchParams.get('trimestre');
    const añoParam = searchParams.get('año');
    const proveedorParam = searchParams.get('proveedor');
    const clienteParam = searchParams.get('cliente');
    const tipoParam = searchParams.get('tipo') || 'todas';

    const trimestre = trimestreParam ? Number(trimestreParam) : null;
    const año = añoParam ? Number(añoParam) : null;
    const proveedor = proveedorParam?.trim() || null;
    const cliente = clienteParam?.trim() || null;
    const tipo = tipoParam.toLowerCase() as 'emitidas' | 'recibidas' | 'todas';

    // Validaciones básicas
    if (trimestre !== null && (trimestre < 1 || trimestre > 4)) {
      return NextResponse.json({ error: '"trimestre" debe ser 1, 2, 3 o 4.' }, { status: 400 });
    }
    if (!['emitidas', 'recibidas', 'todas'].includes(tipo)) {
      return NextResponse.json(
        { error: '"tipo" debe ser "emitidas", "recibidas" o "todas".' },
        { status: 400 }
      );
    }

    // 4. Construir query de documentos principal
    let query = `
      SELECT
        d.id AS doc_id,
        d.tipo_documento,
        d.numero_documento,
        d.fecha_emision,
        d.fecha_vencimiento,
        d.importe_total,
        d.importe_sin_impuestos,
        d.moneda,
        d.observaciones,
        d.año_trimestre,
        d.num_trimestre,
        d.trimestre_cerrado,
        e.nombre_de_empresa,
        e.CIF AS empresa_cif,
        MAX(a.ruta_archivo) AS ruta_archivo,
        GROUP_CONCAT(
          DISTINCT CONCAT(
            ent.rol, '||',
            COALESCE(ent.nombre, ''), '||',
            COALESCE(ent.identificador_fiscal, '')
          ) SEPARATOR ';;'
        ) AS entidades_raw
      FROM documentos d
      LEFT JOIN empresas e ON d.id_de_empresa = e.id
      LEFT JOIN entidades_documento ent ON d.id = ent.documento_id
      LEFT JOIN archivos_documento a ON d.id = a.documento_id
      WHERE d.id_de_empresa = ?
        AND (
          (LOWER(d.tipo_documento) LIKE '%factura%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
          OR (LOWER(d.tipo_documento) LIKE '%abono%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
          OR (LOWER(d.tipo_documento) LIKE '%nota%cr%dito%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
        )
        AND d.id NOT IN (
          SELECT documento_id FROM incidencias_documento WHERE validado = 0
        )
        AND d.id NOT IN (
          SELECT documento_id FROM health_check_status WHERE verified = 0
        )
    `;
    const params: any[] = [empresaId];

    if (trimestre !== null) {
      query += ` AND d.num_trimestre = ?`;
      params.push(trimestre);
    }

    if (año) {
      query += ` AND d.año_trimestre = ?`;
      params.push(Number(año));
    }

    if (proveedor) {
      query += ` AND d.id IN (
        SELECT ent2.documento_id FROM entidades_documento ent2
        WHERE ent2.rol IN ('emisor','proveedor')
          AND (ent2.nombre LIKE ? OR ent2.identificador_fiscal LIKE ?)
      )`;
      const term = `%${proveedor}%`;
      params.push(term, term);
    }

    if (cliente) {
      query += ` AND d.id IN (
        SELECT ent3.documento_id FROM entidades_documento ent3
        WHERE ent3.rol IN ('receptor','cliente')
          AND (ent3.nombre LIKE ? OR ent3.identificador_fiscal LIKE ?)
      )`;
      const term = `%${cliente}%`;
      params.push(term, term);
    }

    query += ` GROUP BY d.id ORDER BY d.fecha_emision DESC`;

    const [documentos] = await db.query<RowDataPacket[]>(query, params);

    if (documentos.length === 0) {
      return NextResponse.json({ data: [] }, { status: 200 });
    }

    const docIds = documentos.map((d: any) => d.doc_id);

    // 5. Cargar impuestos de todos los documentos en una sola query
    const [ivaRows] = await db.query<RowDataPacket[]>(
      `SELECT documento_id, tipo_impuesto, porcentaje, base_imponible, cuota
       FROM impuestos_documento WHERE documento_id IN (?)`,
      [docIds]
    );

    const ivaByDoc: Record<number, any[]> = {};
    ivaRows.forEach((r: any) => {
      if (!ivaByDoc[r.documento_id]) ivaByDoc[r.documento_id] = [];
      ivaByDoc[r.documento_id].push(r);
    });

    // 6. Cargar líneas de todos los documentos en una sola query
    const [lineasRows] = await db.query<RowDataPacket[]>(
      `SELECT documento_id, descripcion, cantidad, precio_unitario, importe_linea
       FROM lineas_documento WHERE documento_id IN (?)`,
      [docIds]
    );

    const lineasByDoc: Record<number, any[]> = {};
    lineasRows.forEach((r: any) => {
      if (!lineasByDoc[r.documento_id]) lineasByDoc[r.documento_id] = [];
      lineasByDoc[r.documento_id].push({
        descripcion: r.descripcion,
        cantidad: Number(r.cantidad) || 0,
        precio_unitario: Number(r.precio_unitario) || 0,
        importe_total: Number(r.importe_linea) || 0,
      });
    });

    // 7. Enriquecer documentos
    const empresaCif = documentos[0]?.empresa_cif?.trim().toLowerCase() || '';
    const MINIO_ENDPOINT = (process.env.MINIO_PUBLIC_ENDPOINT || process.env.MINIO_ENDPOINT || 'https://minio.allbase.com.ar').replace(/\/$/, '');
    const MINIO_BUCKET_NAME = process.env.MINIO_BUCKET_NAME || 'flux1a';

    let enriched = documentos.map((doc: any) => {
      const entidades: Record<string, { nombre: string; cif: string }> = {};
      if (doc.entidades_raw) {
        doc.entidades_raw.split(';;').forEach((e: string) => {
          const [rol, nombre, cif] = e.split('||');
          if (rol) entidades[rol] = { nombre: nombre || '', cif: cif || '' };
        });
      }

      const emisorCif = (entidades.emisor?.cif || entidades.proveedor?.cif || '').trim().toLowerCase();
      const isIssued = !!(empresaCif && emisorCif && emisorCif === empresaCif);

      let publicUrl = null;
      if (doc.ruta_archivo) {
        publicUrl = `${MINIO_ENDPOINT}/${MINIO_BUCKET_NAME}/${doc.ruta_archivo}`;
      }

      return {
        id: doc.doc_id,
        tipo_documento: doc.tipo_documento,
        numero_documento: doc.numero_documento,
        fecha_emision: doc.fecha_emision,
        fecha_vencimiento: doc.fecha_vencimiento,
        importe_total: Number(doc.importe_total) || 0,
        importe_sin_impuestos: Number(doc.importe_sin_impuestos) || 0,
        moneda: doc.moneda,
        observaciones: doc.observaciones,
        trimestre: doc.num_trimestre,
        año: doc.año_trimestre,
        entidades: entidades,
        is_issued: isIssued, // Factura emitida por la empresa
        url_archivo: publicUrl,
        impuestos: ivaByDoc[doc.doc_id] || [],
        lineas_detalle: lineasByDoc[doc.doc_id] || [],
      };
    });

    // 8. Filtrar por tipo si se especifica
    if (tipo !== 'todas') {
      enriched = enriched.filter((doc) =>
        tipo === 'emitidas' ? doc.is_issued : !doc.is_issued
      );
    }

    return NextResponse.json(
      {
        total: enriched.length,
        data: enriched
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('❌ [GET /api/v1/documents] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Error interno del servidor.' },
      { status: 500 }
    );
  }
}
