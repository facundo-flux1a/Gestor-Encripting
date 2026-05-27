import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/services/api-key-service';
import { fireWebhook } from '@/services/webhook-service';
import db from '@/lib/db';
import type { RowDataPacket, OkPacket } from 'mysql2';

export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/incidents
//
// Lista las incidencias abiertas (o todas) de los documentos pertenecientes
// a la empresa vinculada al X-Api-Key.
//
// Query params opcionales:
//   estado=pendientes | validadas | todas   (default: pendientes)
//   documento_id=<number>                   (filtrar por documento específico)
// ─────────────────────────────────────────────────────────────────────────────
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

    const estado = searchParams.get('estado') || 'pendientes';
    const documentoIdParam = searchParams.get('documento_id');
    const documentoId = documentoIdParam ? Number(documentoIdParam) : null;

    // Construir filtro de estado
    let estadoFilter = '';
    if (estado === 'pendientes') estadoFilter = 'AND i.validado = 0';
    else if (estado === 'validadas') estadoFilter = 'AND i.validado = 1';
    // 'todas' → sin filtro adicional

    // Filtro opcional por documento_id
    const docFilter = documentoId ? 'AND d.id = ?' : '';
    const params: any[] = [empresaId];
    if (documentoId) params.push(documentoId);

    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT
         i.id                        AS incidencia_id,
         i.documento_id,
         i.descripcion               AS descripcion_incidencia,
         i.validado,
         i.validado_por,
         i.fecha_validacion,
         i.observaciones_validacion,
         d.tipo_documento,
         d.numero_documento,
         d.fecha_emision,
         d.importe_total,
         d.importe_sin_impuestos,
         d.moneda,
         -- Datos del emisor / proveedor para que el ERP pueda identificar la factura
         (SELECT nombre FROM entidades_documento
          WHERE documento_id = d.id AND rol IN ('emisor', 'proveedor')
          ORDER BY id LIMIT 1)       AS entidad_nombre,
         (SELECT identificador_fiscal FROM entidades_documento
          WHERE documento_id = d.id AND rol IN ('emisor', 'proveedor')
          ORDER BY id LIMIT 1)       AS entidad_cif,
         -- Estado del health check matemático del documento
         hcs.verified                AS verificado_matematicamente,
         hcs.motivo                  AS razon_descuadre
       FROM incidencias_documento i
       JOIN documentos d ON i.documento_id = d.id
       LEFT JOIN health_check_status hcs ON hcs.documento_id = d.id
       WHERE d.id_de_empresa = ?
         ${estadoFilter}
         ${docFilter}
       ORDER BY i.validado ASC, d.fecha_emision DESC`,
      params
    );

    return NextResponse.json(
      {
        total: rows.length,
        filtros: {
          estado,
          documento_id: documentoId || 'todos',
        },
        data: rows.map(r => ({
          incidencia_id: r.incidencia_id,
          documento_id: r.documento_id,
          estado: r.validado === 1 ? 'validada' : 'pendiente',
          descripcion_incidencia: r.descripcion_incidencia,
          validado_por: r.validado_por || null,
          fecha_validacion: r.fecha_validacion || null,
          observaciones_validacion: r.observaciones_validacion || null,
          documento: {
            tipo_documento: r.tipo_documento,
            numero_documento: r.numero_documento,
            fecha_emision: r.fecha_emision,
            importe_total: Number(r.importe_total) || 0,
            importe_sin_impuestos: Number(r.importe_sin_impuestos) || 0,
            moneda: r.moneda || 'EUR',
            entidad_nombre: r.entidad_nombre || null,
            entidad_cif: r.entidad_cif || null,
            verificado_matematicamente: !!r.verificado_matematicamente,
            razon_descuadre: r.razon_descuadre || null,
          },
        })),
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('❌ [GET /api/v1/incidents] Error:', error);
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/incidents
//
// Marca una incidencia como validada (resuelta manualmente desde el ERP).
//
// Body JSON:
//   {
//     "incidencia_id": 12,
//     "observaciones": "Aprobado. Diferencia aceptada por el cliente.",   // opcional
//     "validado_por": "erp_sync@empresa.com"                              // opcional
//   }
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
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

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Body JSON inválido.' }, { status: 400 });
    }

    const { incidencia_id: rawId, observaciones, validado_por } = body;
    const incidencia_id = typeof rawId === 'string' ? parseInt(rawId, 10) : rawId;

    if (!incidencia_id || typeof incidencia_id !== 'number' || isNaN(incidencia_id)) {
      return NextResponse.json(
        { error: 'El campo "incidencia_id" es obligatorio y debe ser un número.' },
        { status: 400 }
      );
    }

    // Verificar que la incidencia existe Y pertenece a la empresa del token (aislamiento)
    const [incRows] = await db.query<RowDataPacket[]>(
      `SELECT i.id, i.validado, d.id AS doc_id
       FROM incidencias_documento i
       JOIN documentos d ON i.documento_id = d.id
       WHERE i.id = ? AND d.id_de_empresa = ?`,
      [incidencia_id, empresaId]
    );

    if (incRows.length === 0) {
      return NextResponse.json(
        { error: `Incidencia #${incidencia_id} no encontrada o no pertenece a tu empresa.` },
        { status: 404 }
      );
    }

    if (incRows[0].validado === 1) {
      return NextResponse.json(
        { error: `La incidencia #${incidencia_id} ya estaba validada previamente.` },
        { status: 409 }
      );
    }

    // Marcar como validada
    await db.query<OkPacket>(
      `UPDATE incidencias_documento
       SET validado = 1,
           validado_por = ?,
           fecha_validacion = NOW(),
           observaciones_validacion = ?
       WHERE id = ?`,
      [
        validado_por || 'API_EXTERNA',
        observaciones || 'Validada manualmente vía API externa.',
        incidencia_id,
      ]
    );

    // ─────────────────────────────────────────────────────────────────────────────
    // 🔔 WEBHOOKS TRIGGER: Incidencia Resuelta
    // ─────────────────────────────────────────────────────────────────────────────
    try {
      // Validar si quedan más incidencias sin resolver para este documento
      const [remainingIncRows] = await db.query<RowDataPacket[]>(
        `SELECT COUNT(*) as count FROM incidencias_documento WHERE documento_id = ? AND validado = 0`,
        [incRows[0].doc_id]
      );
      
      const docId = incRows[0].doc_id;
      const quedanPendientes = remainingIncRows[0]?.count > 0;

      // Disparamos el webhook notificando la resolución
      await fireWebhook(empresaId, 'incidencia.resuelta_manualmente', {
        incidencia_id,
        documento_id: docId,
        observaciones,
        validado_por,
        quedan_incidencias_pendientes: quedanPendientes
      });

      // Si no quedan pendientes, el ERP probablemente quiera saber que el documento ya está limpio
      if (!quedanPendientes) {
        const [docRows] = await db.query<RowDataPacket[]>(
          `SELECT id, file_hash, tipo_documento, numero_documento, importe_total, url_archivo 
           FROM documentos WHERE id = ? LIMIT 1`,
          [docId]
        );
        if (docRows.length > 0) {
          await fireWebhook(empresaId, 'documento.listo_para_erp', docRows[0]);
        }
      }
    } catch (whErr) {
      console.error('❌ [POST /api/v1/incidents] Error disparando webhook:', whErr);
    }

    return NextResponse.json(
      {
        success: true,
        incidencia_id,
        documento_id: incRows[0].doc_id,
        estado: 'validada',
        validado_por: validado_por || 'API_EXTERNA',
        fecha_validacion: new Date().toISOString(),
        observaciones: observaciones || 'Validada manualmente vía API externa.',
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('❌ [POST /api/v1/incidents] Error:', error);
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 });
  }
}
