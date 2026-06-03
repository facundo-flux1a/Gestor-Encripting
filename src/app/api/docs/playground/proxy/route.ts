/**
 * POST /api/docs/playground/proxy
 *
 * Proxy seguro para el Playground de la documentación.
 * - Requiere sesión autenticada (cookie de usuario).
 * - El cliente solo envía el ID de la clave, nunca el valor raw.
 * - El servidor resuelve empresa_id → ejecuta la query → devuelve resultado.
 * - La clave raw nunca sale de la base de datos.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/user-service';
import db from '@/lib/db';
import type { RowDataPacket } from 'mysql2';
import { getDashboardAnalytics, getHealthCheckAnalytics } from '@/services/document-service';
import { checkRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

// Resolve empresa_id from api_keys table, verifying it belongs to the current user
async function resolveEmpresaId(keyId: number, userId: number): Promise<number | null> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT empresa_id FROM api_keys WHERE id = ? AND usuario_id = ? AND activa = 1 LIMIT 1`,
    [keyId, userId]
  );
  return rows[0]?.empresa_id ?? null;
}

export async function POST(request: NextRequest) {
  try {
    // 1. Require authenticated session
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
    }

    // 2. Parse body
    let body: any;
    try { body = await request.json(); } catch {
      return NextResponse.json({ error: 'Body JSON inválido.' }, { status: 400 });
    }

    const { keyId, path, queryParams = {} } = body as {
      keyId: number;
      path: string;
      queryParams: Record<string, string>;
    };

    if (!keyId || !path) {
      return NextResponse.json({ error: 'keyId y path son requeridos.' }, { status: 400 });
    }

    // ── RATE LIMITING (PLAYGROUND) ──
    // Límites de seguridad para evitar abusos (auto-clickers, bucles)
    // Producción: 20 peticiones cada 60 segundos
    const RATE_LIMIT = 20;
    const RATE_WINDOW_SEC = 60;
    
    const rateLimit = await checkRateLimit(user.id, RATE_LIMIT, RATE_WINDOW_SEC);
    if (!rateLimit.success) {
      const res = NextResponse.json(
        { 
          error: 'Rate limit exceeded',
          mensaje: 'Has excedido el límite de peticiones del Playground. Por favor, espera un momento.'
        }, 
        { status: 429 }
      );
      res.headers.set('X-RateLimit-Limit', RATE_LIMIT.toString());
      res.headers.set('X-RateLimit-Remaining', '0');
      return res;
    }
    // ────────────────────────────────

    // 3. Get empresa_id — validates key ownership without needing the raw key
    const empresaId = await resolveEmpresaId(keyId, user.id);
    if (!empresaId) {
      return NextResponse.json(
        { error: 'Clave no encontrada, inactiva o no pertenece a tu cuenta.' },
        { status: 403 }
      );
    }

    // 4. Route to the correct handler
    const normalizedPath = path.replace(/^\/api\/v1/, '').replace(/\/$/, '');
    let finalResponse: NextResponse | null = null;

    // ── GET /documents/full ────────────────────────────────────────────────
    if (normalizedPath === '/documents/full' || normalizedPath === '/documents') {
      const trimestre = queryParams.trimestre ? Number(queryParams.trimestre) : null;
      const año = queryParams.año ? Number(queryParams.año) : null;
      const proveedor = queryParams.proveedor?.trim() || null;
      const cliente = queryParams.cliente?.trim() || null;
      const tipo = (queryParams.tipo || 'todas').toLowerCase();
      const incluirIncidencias = queryParams.incluir_incidencias === 'true';
      const incluirSinVerificar = queryParams.incluir_sin_verificar === 'true';
      const incluirSinConfirmar = queryParams.incluir_sin_confirmar === 'true';

      let query = `
        SELECT d.*, e.nombre_de_empresa, e.CIF AS empresa_cif
        FROM documentos d
        LEFT JOIN empresas e ON d.id_de_empresa = e.id
        WHERE d.id_de_empresa = ?
      `;
      const params: any[] = [empresaId];

      if (incluirSinConfirmar) {
        query += ` AND (LOWER(d.tipo_documento) LIKE '%factura%' OR LOWER(d.tipo_documento) LIKE '%abono%' OR LOWER(d.tipo_documento) LIKE '%nota%cr%dito%')`;
      } else {
        query += ` AND (
          (LOWER(d.tipo_documento) LIKE '%factura%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
          OR (LOWER(d.tipo_documento) LIKE '%abono%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
          OR (LOWER(d.tipo_documento) LIKE '%nota%cr%dito%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
        )`;
      }

      if (!incluirIncidencias) {
        query += ` AND d.id NOT IN (SELECT documento_id FROM incidencias_documento WHERE validado = 0)`;
      }
      if (!incluirSinVerificar) {
        query += ` AND d.id NOT IN (SELECT documento_id FROM health_check_status WHERE verified = 0)`;
      }
      if (trimestre) { query += ` AND d.num_trimestre = ?`; params.push(trimestre); }
      if (año) { query += ` AND d.año_trimestre = ?`; params.push(año); }
      if (proveedor) {
        query += ` AND d.id IN (SELECT ent2.documento_id FROM entidades_documento ent2 WHERE ent2.rol IN ('emisor','proveedor') AND (ent2.nombre LIKE ? OR ent2.identificador_fiscal LIKE ?))`;
        params.push(`%${proveedor}%`, `%${proveedor}%`);
      }
      if (cliente) {
        query += ` AND d.id IN (SELECT ent3.documento_id FROM entidades_documento ent3 WHERE ent3.rol IN ('receptor','cliente') AND (ent3.nombre LIKE ? OR ent3.identificador_fiscal LIKE ?))`;
        params.push(`%${cliente}%`, `%${cliente}%`);
      }
      query += ` ORDER BY d.fecha_emision DESC`;

      const [documentos] = await db.query<RowDataPacket[]>(query, params);
      if (documentos.length === 0) {
        finalResponse = NextResponse.json({ total: 0, data: [] });
      } else {

      const docIds = documentos.map((d: any) => d.id);
      const [[entidadesRows], [lineasRows], [impuestosRows]] = await Promise.all([
        db.query<RowDataPacket[]>(`SELECT * FROM entidades_documento WHERE documento_id IN (?)`, [docIds]),
        db.query<RowDataPacket[]>(`SELECT * FROM lineas_documento WHERE documento_id IN (?)`, [docIds]),
        db.query<RowDataPacket[]>(`SELECT * FROM impuestos_documento WHERE documento_id IN (?)`, [docIds]),
      ]);

      const entByDoc: Record<number, Record<string, any>> = {};
      entidadesRows.forEach((r: any) => {
        if (!entByDoc[r.documento_id]) entByDoc[r.documento_id] = {};
        entByDoc[r.documento_id][r.rol] = r;
      });
      const linByDoc: Record<number, any[]> = {};
      lineasRows.forEach((r: any) => { if (!linByDoc[r.documento_id]) linByDoc[r.documento_id] = []; linByDoc[r.documento_id].push(r); });
      const impByDoc: Record<number, any[]> = {};
      impuestosRows.forEach((r: any) => { if (!impByDoc[r.documento_id]) impByDoc[r.documento_id] = []; impByDoc[r.documento_id].push(r); });

      let enriched = documentos.map((doc: any) => {
        const entities = entByDoc[doc.id] || {};
        const emisorCif = (entities.emisor?.identificador_fiscal || entities.proveedor?.identificador_fiscal || '').trim().toLowerCase();
        const empresaCif = doc.empresa_cif?.trim().toLowerCase() || '';
        return {
          id: doc.id,
          tipo_documento: doc.tipo_documento,
          numero_documento: doc.numero_documento,
          fecha_emision: doc.fecha_emision,
          importe_total: Number(doc.importe_total) || 0,
          importe_sin_impuestos: Number(doc.importe_sin_impuestos) || 0,
          moneda: doc.moneda,
          año: doc.año_trimestre,
          trimestre: doc.num_trimestre,
          is_issued: !!(empresaCif && emisorCif && emisorCif === empresaCif),
          entidades: entities,
          impuestos: impByDoc[doc.id] || [],
          lineas_detalle: linByDoc[doc.id] || [],
        };
      });

      if (tipo !== 'todas') {
        enriched = enriched.filter(d => tipo === 'emitidas' ? d.is_issued : !d.is_issued);
      }

      finalResponse = NextResponse.json({ total: enriched.length, data: enriched });
      } // end else
    }

    // ── GET /products ──────────────────────────────────────────────────────
    if (normalizedPath === '/products') {
      const params: any[] = [empresaId];
      let query = `
        SELECT l.id as linea_id, l.descripcion as producto, l.cantidad, l.precio_unitario, l.importe_linea,
               d.id as documento_id, d.numero_documento, d.fecha_emision,
               ent.nombre as proveedor_nombre, ent.identificador_fiscal as proveedor_cif
        FROM lineas_documento l
        JOIN documentos d ON l.documento_id = d.id
        LEFT JOIN entidades_documento ent ON d.id = ent.documento_id AND ent.rol IN ('emisor', 'proveedor')
        WHERE d.id_de_empresa = ?
      `;
      if (queryParams.trimestre) { query += ` AND d.num_trimestre = ?`; params.push(Number(queryParams.trimestre)); }
      if (queryParams.año) { query += ` AND d.año_trimestre = ?`; params.push(Number(queryParams.año)); }
      if (queryParams.producto) { query += ` AND l.descripcion LIKE ?`; params.push(`%${queryParams.producto}%`); }
      if (queryParams.proveedor) { query += ` AND (ent.nombre LIKE ? OR ent.identificador_fiscal LIKE ?)`; params.push(`%${queryParams.proveedor}%`, `%${queryParams.proveedor}%`); }
      query += ` ORDER BY d.fecha_emision DESC LIMIT 1000`;

      const [rows] = await db.query<RowDataPacket[]>(query, params);
      finalResponse = NextResponse.json({
        total_resultados: rows.length,
        data: rows.map((r: any) => ({
          id: r.linea_id,
          producto_servicio: r.producto,
          cantidad: Number(r.cantidad) || 0,
          precio_unitario: Number(r.precio_unitario) || 0,
          importe_total: Number(r.importe_linea) || 0,
          documento_origen: { id: r.documento_id, numero: r.numero_documento, fecha: r.fecha_emision },
          proveedor: { nombre: r.proveedor_nombre || 'Desconocido', cif: r.proveedor_cif || '' },
        }))
      });
    }

    // ── GET /analytics ─────────────────────────────────────────────────────
    if (normalizedPath === '/analytics') {
      const trimestre = queryParams.trimestre ? Number(queryParams.trimestre) : undefined;
      const año = queryParams.año ? Number(queryParams.año) : undefined;
      const [dashboardData, healthCheckData] = await Promise.all([
        getDashboardAnalytics([empresaId], año, trimestre),
        getHealthCheckAnalytics([empresaId]),
      ]);
      const logicChecks = healthCheckData.summary.logic_checks || 0;
      const totalIssues = healthCheckData.summary.mismatches + logicChecks;
      const healthScore = healthCheckData.summary.total > 0
        ? Math.round(((healthCheckData.summary.total - totalIssues) / healthCheckData.summary.total) * 100)
        : 100;
      finalResponse = NextResponse.json({
        filtros: { año: año || 'Todos', trimestre: trimestre || 'Todos' },
        metricas_financieras: {
          total_ingresos: dashboardData.kpis.totalIngresos,
          total_gastos: dashboardData.kpis.totalGastos,
          beneficio_neto: dashboardData.kpis.beneficio,
          iva_repercutido: dashboardData.kpis.ivaRepercutido,
          iva_soportado: dashboardData.kpis.ivaSoportado,
          resultado_iva_puro: dashboardData.kpis.resultadoIva,
          documentos_totales: dashboardData.kpis.totalDocs,
          evolucion_mensual: dashboardData.quarterlySummary,
          top_proveedores: dashboardData.topProviders,
        },
        health_check: {
          score_salud_porcentaje: healthScore,
          documentos_analizados: healthCheckData.summary.total,
          descuadres_matematicos: healthCheckData.summary.mismatches,
          alertas_logicas: logicChecks,
        }
      });
    }

    // ── GET /incidents ─────────────────────────────────────────────────────
    if (normalizedPath === '/incidents') {
      const estado = queryParams.estado || 'pendientes';
      let estadoFilter = '';
      if (estado === 'pendientes') estadoFilter = 'AND i.validado = 0';
      else if (estado === 'validadas') estadoFilter = 'AND i.validado = 1';

      const [rows] = await db.query<RowDataPacket[]>(
        `SELECT i.id AS incidencia_id, i.documento_id, i.descripcion AS descripcion_incidencia,
                i.validado, i.validado_por, i.fecha_validacion, i.observaciones_validacion,
                d.tipo_documento, d.numero_documento, d.fecha_emision, d.importe_total, d.moneda,
                (SELECT nombre FROM entidades_documento WHERE documento_id = d.id AND rol IN ('emisor','proveedor') ORDER BY id LIMIT 1) AS entidad_nombre,
                hcs.verified AS verificado_matematicamente, hcs.motivo AS razon_descuadre
         FROM incidencias_documento i
         JOIN documentos d ON i.documento_id = d.id
         LEFT JOIN health_check_status hcs ON hcs.documento_id = d.id
         WHERE d.id_de_empresa = ? ${estadoFilter}
         ORDER BY i.validado ASC, d.fecha_emision DESC`,
        [empresaId]
      );
      finalResponse = NextResponse.json({
        total: rows.length,
        filtros: { estado },
        data: rows.map((r: any) => ({
          incidencia_id: r.incidencia_id,
          documento_id: r.documento_id,
          estado: r.validado === 1 ? 'validada' : 'pendiente',
          descripcion_incidencia: r.descripcion_incidencia,
          documento: {
            tipo_documento: r.tipo_documento,
            numero_documento: r.numero_documento,
            fecha_emision: r.fecha_emision,
            importe_total: Number(r.importe_total) || 0,
            moneda: r.moneda || 'EUR',
            entidad_nombre: r.entidad_nombre || null,
            verificado_matematicamente: !!r.verificado_matematicamente,
            razon_descuadre: r.razon_descuadre || null,
          },
        }))
      });
    }

    // ── POST /incidents (MOCK — playground never mutates) ──────────────────
    if (normalizedPath === '/incidents/resolve') {
      finalResponse = NextResponse.json({
        playground_mock: true,
        mensaje: 'Esta es una simulación. En producción, esta llamada marcaría la incidencia como validada.',
        incidencia_id: body.incidencia_id || null,
        estado: 'validada',
        validado_por: body.validado_por || 'playground_user',
        fecha_validacion: new Date().toISOString(),
      });
    }

    if (!finalResponse) {
      finalResponse = NextResponse.json({ error: `Ruta "${path}" no soportada en el playground.` }, { status: 404 });
    }

    finalResponse.headers.set('X-RateLimit-Limit', RATE_LIMIT.toString());
    finalResponse.headers.set('X-RateLimit-Remaining', Math.max(0, rateLimit.remaining).toString());
    
    return finalResponse;

  } catch (error: any) {
    console.error('❌ [docs/playground/proxy] Error:', error);
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 });
  }
}
