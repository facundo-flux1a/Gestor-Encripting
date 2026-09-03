import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/services/api-key-service';
import db from '@/lib/db';
import type { RowDataPacket } from 'mysql2';
import { prisma } from '@/lib/prisma';
import { extractRetencionFromImpuestos } from '@/lib/tax-helpers';
import { formatEntityData, buildFileUrl, formatDocumentLine, parseFlexibleDate } from '@/lib/api-v1-helpers';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/documents
 *
 * Autenticación (header obligatorio):
 *   X-Api-Key: flux_xxxxx
 *
 * Query Parameters (opcionales):
 *   ?desde_id=8627                  (paginación por cursor incremental)
 *   &modificados_desde=2026-08-24   (facturas modificadas desde fecha)
 *   &limit=100                      (límite de resultados, por defecto 500, max 1000)
 *   &trimestre=3
 *   &año=2026
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
    const desdeIdParam = searchParams.get('desde_id');
    const modificadosDesdeParam = searchParams.get('modificados_desde') || searchParams.get('modificado_desde');
    const limitParam = searchParams.get('limit');
    const trimestreParam = searchParams.get('trimestre');
    const añoParam = searchParams.get('año') ?? searchParams.get('ano');
    const proveedorParam = searchParams.get('proveedor');
    const clienteParam = searchParams.get('cliente');
    const tipoParam = searchParams.get('tipo') || 'todas';

    const desdeId = desdeIdParam ? Number(desdeIdParam) : null;
    const limit = Math.min(Math.max(limitParam ? Number(limitParam) : 500, 1), 1000);
    const trimestre = trimestreParam ? Number(trimestreParam) : null;
    const año = añoParam ? Number(añoParam) : null;
    const proveedor = proveedorParam?.trim() || null;
    const cliente = clienteParam?.trim() || null;
    const tipo = tipoParam.toLowerCase() as 'emitidas' | 'recibidas' | 'todas';

    // Validaciones básicas
    if (desdeId !== null && (isNaN(desdeId) || desdeId < 0)) {
      return NextResponse.json({ error: '"desde_id" debe ser un número entero positivo.' }, { status: 400 });
    }
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
        d.fecha_creacion
      FROM documentos d
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

    // Semáforo incremental: ?desde_id=
    if (desdeId !== null) {
      query += ` AND d.id > ?`;
      params.push(desdeId);
    }

    // Filtro por modificación: ?modificados_desde=
    if (modificadosDesdeParam) {
      const modDate = parseFlexibleDate(modificadosDesdeParam);
      if (modDate && !isNaN(modDate.getTime())) {
        query += ` AND (d.fecha_creacion >= ? OR d.id IN (SELECT documento_id FROM documentos_auditoria WHERE fecha_accion >= ?))`;
        params.push(modDate, modDate);
      }
    }

    if (trimestre !== null) {
      query += ` AND d.num_trimestre = ?`;
      params.push(trimestre);
    }

    if (año) {
      query += ` AND d.año_trimestre = ?`;
      params.push(Number(año));
    }

    // Ordenamiento por ID creciente para paginación por cursor fiable
    query += ` GROUP BY d.id ORDER BY d.id ASC LIMIT ?`;
    params.push(limit);

    const [documentos] = await db.query<RowDataPacket[]>(query, params);

    if (documentos.length === 0) {
      return NextResponse.json({ total: 0, data: [] }, { status: 200 });
    }

    const docIds = documentos.map((d: any) => d.doc_id);

    // 5. Cargar impuestos de todos los documentos
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

    // 6. Cargar líneas de todos los documentos
    const [lineasRows] = await db.query<RowDataPacket[]>(
      `SELECT id, documento_id, codigo, descripcion, cantidad, unidad, precio_unitario, descuento_porcentaje, precio_neto, importe_linea, datos_extra
       FROM lineas_documento WHERE documento_id IN (?)`,
      [docIds]
    );

    const lineasByDoc: Record<number, any[]> = {};
    lineasRows.forEach((r: any) => {
      if (!lineasByDoc[r.documento_id]) lineasByDoc[r.documento_id] = [];
      const docImpuestos = ivaByDoc[r.documento_id] || [];
      lineasByDoc[r.documento_id].push(formatDocumentLine(r, docImpuestos));
    });

    // 6.5 Cargar entidades completas usando Prisma para desencriptación transparente
    const entidadesPrisma = await prisma.entidades_documento.findMany({
      where: { documento_id: { in: docIds } },
      select: {
        documento_id: true,
        rol: true,
        nombre: true,
        identificador_fiscal: true,
        direccion: true,
        telefono: true,
        email: true,
        cuenta_contable: true,
        datos_extra: true
      }
    });

    const entidadesByDoc: Record<number, Record<string, any>> = {};
    entidadesPrisma.forEach((ent) => {
      const docId = Number(ent.documento_id);
      if (!entidadesByDoc[docId]) entidadesByDoc[docId] = {};
      if (ent.rol) {
        entidadesByDoc[docId][ent.rol] = formatEntityData(ent);
      }
    });

    // 6.6 Cargar archivos usando Prisma
    const archivosPrisma = await prisma.archivos_documento.findMany({
      where: { documento_id: { in: docIds } },
      select: { documento_id: true, ruta_archivo: true }
    });

    const archivoByDoc: Record<number, string> = {};
    archivosPrisma.forEach((archivo) => {
      if (archivo.ruta_archivo) {
        archivoByDoc[Number(archivo.documento_id)] = archivo.ruta_archivo;
      }
    });

    // 6.7 Cargar empresa para calcular clasificación emitida / recibida
    const empresa = await prisma.empresas.findUnique({
      where: { id: empresaId },
      select: { CIF: true }
    });
    const empresaCif = empresa?.CIF?.trim().toLowerCase() || '';

    // 7. Enriquecer documentos
    let enriched = documentos.map((doc: any) => {
      const entidades = entidadesByDoc[doc.doc_id] || {};

      const emisorCif = (entidades.emisor?.cif || entidades.proveedor?.cif || '').trim().toLowerCase();
      const isIssued = !!(empresaCif && emisorCif && emisorCif === empresaCif);

      const docRutaArchivo = archivoByDoc[doc.doc_id];
      const publicUrl = buildFileUrl(docRutaArchivo);

      const impuestos = ivaByDoc[doc.doc_id] || [];
      const retencion = extractRetencionFromImpuestos(impuestos);

      const fechaCreacionIso = doc.fecha_creacion ? new Date(doc.fecha_creacion).toISOString() : null;

      const baseImponible = doc.importe_sin_impuestos != null ? Number(doc.importe_sin_impuestos) : (Number(doc.importe_total) || 0);
      const totalConImpuestos = Number(doc.importe_total) || 0;

      return {
        id: doc.doc_id,
        tipo_documento: doc.tipo_documento,
        numero_documento: doc.numero_documento,
        fecha_emision: doc.fecha_emision,
        fecha_vencimiento: doc.fecha_vencimiento,
        actualizado_en: fechaCreacionIso,
        importe_total: baseImponible,
        importe_sin_impuestos: baseImponible,
        importe_con_impuestos: totalConImpuestos,
        moneda: doc.moneda,
        observaciones: doc.observaciones,
        trimestre: doc.num_trimestre,
        año: doc.año_trimestre,
        retencion,
        entidades: entidades,
        is_issued: isIssued,
        url_archivo: publicUrl,
        impuestos,
        lineas_detalle: lineasByDoc[doc.doc_id] || [],
      };
    });

    // 8. Filtrar por tipo si se especifica
    if (tipo !== 'todas') {
      enriched = enriched.filter((doc: any) =>
        tipo === 'emitidas' ? doc.is_issued : !doc.is_issued
      );
    }

    // 9. Filtrar en memoria por proveedor/cliente (partial match)
    if (proveedor) {
      const term = proveedor.toLowerCase();
      enriched = enriched.filter((doc: any) => {
        const emisor = doc.entidades.emisor || doc.entidades.proveedor;
        if (!emisor) return false;
        return (emisor.nombre?.toLowerCase().includes(term) || emisor.cif?.toLowerCase().includes(term));
      });
    }

    if (cliente) {
      const term = cliente.toLowerCase();
      enriched = enriched.filter((doc: any) => {
        const receptor = doc.entidades.receptor || doc.entidades.cliente;
        if (!receptor) return false;
        return (receptor.nombre?.toLowerCase().includes(term) || receptor.cif?.toLowerCase().includes(term));
      });
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

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/documents
//
// Ingesta de facturas emitidas desde programa de facturación (ej: Muvail Facturación).
// Almacena los datos TAL CUAL — sin OCR, sin recalcular, sin redondear.
//
// Body: { "documentos": [ { ...campos } ] }
//
// Idempotencia: CIF emisor + serie + número — si ya existe, actualiza.
// Archivo opcional: descarga url_archivo (síncrono, con auth si se provee) y lo sube a Minio.
// Genera registro en `actividad` con dashboard_correo='api' para la Cola de Subidas.
// ─────────────────────────────────────────────────────────────────────────────
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import crypto from 'crypto';
import { calcularTrimestreExtendido, resolverTrimestreContableImportacion, obtenerPrimerTrimestreAbiertoDelAnio } from '@/lib/trimestre-utils';
import { normalizeCIF } from '@/services/ingestion/normalize';
import { runHealthChecksForDocument } from '@/services/health-check-service';
import connection, { dbName } from '@/lib/db';

const MINIO_ENDPOINT_POST = process.env.MINIO_PUBLIC_ENDPOINT || process.env.MINIO_ENDPOINT || 'https://minio.allbase.com.ar';
const MINIO_BUCKET_POST   = process.env.MINIO_BUCKET_NAME || 'gestor-documental';

function sha256ForEntity(text: string | null | undefined): string | null {
  if (!text) return null;
  const clean = text.toLowerCase().replace(/[,.]/g, '').trim();
  return crypto.createHash('sha256').update(clean).digest('hex');
}

function buildRefExterna(cifEmisor: string, serie: string, numero: string): string {
  return `${(cifEmisor || '').toUpperCase()}::${(serie || '').toUpperCase()}::${numero}`;
}

async function downloadFileWithAuth(
  url: string,
  auth?: { tipo: string; token?: string; header_name?: string; header_value?: string }
): Promise<{ buffer: Buffer; contentType: string | null } | null> {
  try {
    const headers: Record<string, string> = {};
    if (auth) {
      if (auth.tipo === 'bearer' && auth.token) {
        headers['Authorization'] = `Bearer ${auth.token}`;
      } else if (auth.tipo === 'basic' && auth.token) {
        headers['Authorization'] = `Basic ${Buffer.from(auth.token).toString('base64')}`;
      } else if (auth.tipo === 'header' && auth.header_name && auth.header_value) {
        headers[auth.header_name] = auth.header_value;
      }
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(url, { headers, signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type');
    const buf = await res.arrayBuffer();
    return { buffer: Buffer.from(buf), contentType };
  } catch {
    return null;
  }
}

function detectFileTypeAndExtension(
  url: string,
  contentTypeHeader: string | null,
  buffer: Buffer
): { ext: string; contentType: string; tipoArchivo: string } {
  const ct = (contentTypeHeader || '').toLowerCase();

  // 1. Magic bytes check on buffer
  if (buffer.length >= 4) {
    if (buffer.slice(0, 4).toString('ascii') === '%PDF') {
      return { ext: 'pdf', contentType: 'application/pdf', tipoArchivo: 'pdf' };
    }
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
      return { ext: 'png', contentType: 'image/png', tipoArchivo: 'png' };
    }
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
      return { ext: 'jpg', contentType: 'image/jpeg', tipoArchivo: 'jpg' };
    }
    if (buffer.slice(0, 4).toString('ascii') === 'GIF8') {
      return { ext: 'gif', contentType: 'image/gif', tipoArchivo: 'gif' };
    }
    if (buffer.length >= 12 && buffer.slice(0, 4).toString('ascii') === 'RIFF' && buffer.slice(8, 12).toString('ascii') === 'WEBP') {
      return { ext: 'webp', contentType: 'image/webp', tipoArchivo: 'webp' };
    }
    if (buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04) {
      return { ext: 'xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', tipoArchivo: 'xlsx' };
    }
  }

  // 2. HTTP Content-Type header check
  if (ct.includes('application/pdf')) {
    return { ext: 'pdf', contentType: 'application/pdf', tipoArchivo: 'pdf' };
  }
  if (ct.includes('image/png')) {
    return { ext: 'png', contentType: 'image/png', tipoArchivo: 'png' };
  }
  if (ct.includes('image/jpeg') || ct.includes('image/jpg')) {
    return { ext: 'jpg', contentType: 'image/jpeg', tipoArchivo: 'jpg' };
  }
  if (ct.includes('image/webp')) {
    return { ext: 'webp', contentType: 'image/webp', tipoArchivo: 'webp' };
  }
  if (ct.includes('spreadsheet') || ct.includes('excel')) {
    return { ext: 'xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', tipoArchivo: 'xlsx' };
  }
  if (ct.includes('text/csv')) {
    return { ext: 'csv', contentType: 'text/csv', tipoArchivo: 'csv' };
  }

  // 3. Inspect URL pathname (ignore domain TLDs)
  try {
    const cleanUrl = url.split('?')[0];
    const pathname = new URL(cleanUrl).pathname;
    const urlExt = pathname.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '');
    const validExts = ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'xlsx', 'csv', 'doc', 'docx', 'txt'];
    if (urlExt && validExts.includes(urlExt)) {
      const normalizedExt = urlExt === 'jpeg' ? 'jpg' : urlExt;
      let mappedMime = 'application/octet-stream';
      if (normalizedExt === 'pdf') mappedMime = 'application/pdf';
      else if (normalizedExt === 'png') mappedMime = 'image/png';
      else if (normalizedExt === 'jpg') mappedMime = 'image/jpeg';
      else if (normalizedExt === 'webp') mappedMime = 'image/webp';
      else if (normalizedExt === 'xlsx') mappedMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      else if (normalizedExt === 'csv') mappedMime = 'text/csv';
      return { ext: normalizedExt, contentType: mappedMime, tipoArchivo: normalizedExt };
    }
  } catch {}

  // 4. Default fallback
  return { ext: 'pdf', contentType: 'application/pdf', tipoArchivo: 'pdf' };
}

export async function POST(request: NextRequest) {
  try {
    // 1. Auth — misma X-Api-Key que el GET
    const rawKey = request.headers.get('x-api-key') || '';
    if (!rawKey) {
      return NextResponse.json({ error: 'Header X-Api-Key requerido.' }, { status: 401 });
    }
    const authResult = await validateApiKey(rawKey);
    if (!authResult.valid || !authResult.empresa_id) {
      return NextResponse.json({ error: 'API Key inválida o revocada.' }, { status: 401 });
    }
    const empresaId = authResult.empresa_id;

    // 2. Parsear body
    let body: any;
    try { body = await request.json(); } catch {
      return NextResponse.json({ error: 'Body JSON inválido.' }, { status: 400 });
    }

    if (!body?.documentos || !Array.isArray(body.documentos) || body.documentos.length === 0) {
      return NextResponse.json({ error: 'El campo "documentos" es requerido y debe ser un array no vacío.' }, { status: 400 });
    }

    if (body.documentos.length > 50) {
      return NextResponse.json({ error: 'Máximo 50 documentos por llamada.' }, { status: 400 });
    }

    // Empresa CIF (para tipo_documento EMITIDA/RECIBIDA)
    const empresa = await prisma.empresas.findUnique({
      where: { id: empresaId },
      select: { CIF: true },
    });
    const empresaCif = normalizeCIF(empresa?.CIF ?? '') ?? '';

    // S3 client (lazy: solo si algún doc trae url_archivo)
    let s3Client: S3Client | null = null;
    const getS3 = () => {
      if (!s3Client) {
        s3Client = new S3Client({
          region: process.env.MINIO_REGION || 'us-east-1',
          endpoint: MINIO_ENDPOINT_POST,
          credentials: {
            accessKeyId: process.env.MINIO_ACCESS_KEY || '',
            secretAccessKey: process.env.MINIO_SECRET_KEY || '',
          },
          forcePathStyle: true,
        });
      }
      return s3Client;
    };

    const results: any[] = [];

    for (const doc of body.documentos) {
      const uploadId = `api_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

      // ── Validación mínima ──
      if (!doc.numero_documento) {
        results.push({ numero_documento: null, estado: 'error', error: 'numero_documento es requerido.' });
        continue;
      }

      if (doc.is_issued === undefined || doc.is_issued === null || typeof doc.is_issued !== 'boolean') {
        results.push({ numero_documento: String(doc.numero_documento ?? ''), estado: 'error', error: 'is_issued es requerido y debe ser un booleano (true = emitida, false = recibida).' });
        continue;
      }

      const cleanCif = (v: unknown) => normalizeCIF(v == null ? null : String(v)) ?? '';
      const cifEmisor = cleanCif(doc.entidades?.emisor?.cif);
      const serie     = (doc.serie || '').trim().toUpperCase();
      const numero    = String(doc.numero_documento).trim();
      const refExterna = buildRefExterna(cifEmisor, serie, numero);

      // ── Idempotencia: ¿ya existe? ──
      const [existingRows] = await connection.query<any[]>(
        `SELECT id FROM documentos
         WHERE id_de_empresa = ?
           AND JSON_UNQUOTE(JSON_EXTRACT(datos_extra, '$.ref_externa')) = ?
         LIMIT 1`,
        [empresaId, refExterna]
      );
      const existingId: bigint | null = existingRows?.[0]?.id ?? null;
      const isUpdate = existingId !== null;

      // ── Importes ──
      const baseSinImpuestos = Number(doc.importe_sin_impuestos) || 0;
      const totalConImpuestos = Number(doc.importe_total) || 0;

      // ── Fechas ──
      const fechaEmision     = parseFlexibleDate(doc.fecha_emision ? String(doc.fecha_emision) : '');
      const fechaVencimiento = doc.fecha_vencimiento
        ? parseFlexibleDate(String(doc.fecha_vencimiento))
        : null;

      if (!fechaEmision || isNaN(fechaEmision.getTime())) {
        results.push({ numero_documento: numero, estado: 'error', error: 'fecha_emision inválida o ausente.' });
        continue;
      }

      // ── Trimestre ──
      let trimestreData: { año: number; trimestre: number };
      try {
        trimestreData = await resolverTrimestreContableImportacion(fechaEmision, Number(empresaId));
      } catch {
        trimestreData = calcularTrimestreExtendido(fechaEmision);
      }

      // ── Tipo documento ──
      const isIssued: boolean = doc.is_issued; // obligatorio: validado arriba
      let tipoDocumento = isIssued ? 'FACTURA EMITIDA' : 'FACTURA RECIBIDA';
      if (doc.estado === 'anulada') tipoDocumento += ' (ANULADA)';

      // ── datos_extra ──
      const datosExtra: Record<string, any> = {
        ref_externa: refExterna,
        forma_pago: doc.forma_pago || '',
        cif: cifEmisor || cleanCif(doc.entidades?.cliente?.cif),
        canal_origen: 'api',
        ...(doc.descuento_global ? { descuento_global: Number(doc.descuento_global) } : {}),
        ...(doc.base_no_sujeta ? { base_no_sujeta: Number(doc.base_no_sujeta) } : {}),
        ...(doc.verifactu ? { verifactu: doc.verifactu } : {}),
        ...(doc.estado === 'anulada' ? { estado_factura: 'anulada' } : {}),
      };

      // ── Archivo opcional: descargar → Minio ──
      let rutaArchivoMinio: string | null = null;
      let archivoWarning: string | null = null;
      let detectedTipoArchivo: string = 'pdf';

      if (doc.url_archivo) {
        const downloadedFile = await downloadFileWithAuth(doc.url_archivo, doc.url_archivo_auth);
        if (downloadedFile && downloadedFile.buffer) {
          try {
            const detected = detectFileTypeAndExtension(doc.url_archivo, downloadedFile.contentType, downloadedFile.buffer);
            detectedTipoArchivo = detected.tipoArchivo;
            const fileName = `${numero.replace(/[^a-zA-Z0-9-]/g, '_')}_${Date.now()}.${detected.ext}`;
            const s3Key    = `archivos/${fileName}`;
            await getS3().send(new PutObjectCommand({
              Bucket: MINIO_BUCKET_POST,
              Key: s3Key,
              Body: downloadedFile.buffer,
              ContentType: detected.contentType,
              ACL: 'public-read',
            }));
            rutaArchivoMinio = `${MINIO_ENDPOINT_POST.replace(/\/$/, '')}/${MINIO_BUCKET_POST}/${s3Key}`;
          } catch (err: any) {
            archivoWarning = `Archivo descargado pero no se pudo subir a Minio: ${err.message}`;
          }
        } else {
          archivoWarning = 'No se pudo descargar url_archivo. El documento se guardó sin archivo.';
        }
      }

      // ── Registro en actividad (para Cola de Subidas) ──
      try {
        await connection.query(
          `INSERT INTO ${dbName}.actividad
             (upload_id, id_de_empresa, documento_nombre, documento_tipo, status, step, progress, mensaje, \`dashboard-correo\`)
           VALUES (?, ?, ?, ?, 'procesando', 'Guardando en BD', 10, 'Ingesta por API en proceso', 'api')`,
          [uploadId, empresaId, numero, 'api']
        );
      } catch (actErr: any) {
        console.warn('[POST /api/v1/documents] Error insertando actividad (ignorado):', actErr.message);
      }

      // ── Transacción Prisma ──
      let savedDocId: bigint | null = null;
      try {
        await prisma.$transaction(async (tx: any) => {
          // ── Documento principal ──
          if (isUpdate && existingId) {
            await tx.documentos.update({
              where: { id: existingId },
              data: {
                tipo_documento: tipoDocumento,
                numero_documento: numero,
                fecha_emision: fechaEmision,
                fecha_vencimiento: fechaVencimiento ?? undefined,
                importe_total: totalConImpuestos,
                importe_sin_impuestos: baseSinImpuestos,
                moneda: (doc.moneda || 'EUR').toUpperCase(),
                observaciones: doc.observaciones || undefined,
                año_trimestre: trimestreData.año,
                num_trimestre: trimestreData.trimestre,
                datos_extra: datosExtra,
              },
            });
            // Borrar relaciones para recrearlas
            await tx.entidades_documento.deleteMany({ where: { documento_id: existingId } });
            await tx.impuestos_documento.deleteMany({ where: { documento_id: existingId } });
            await tx.lineas_documento.deleteMany({ where: { documento_id: existingId } });
            if (rutaArchivoMinio) {
              await tx.archivos_documento.deleteMany({ where: { documento_id: existingId } });
            }
            savedDocId = existingId;
          } else {
            const created = await tx.documentos.create({
              data: {
                tipo_documento: tipoDocumento,
                numero_documento: numero,
                fecha_emision: fechaEmision,
                fecha_vencimiento: fechaVencimiento ?? undefined,
                importe_total: totalConImpuestos,
                importe_sin_impuestos: baseSinImpuestos,
                moneda: (doc.moneda || 'EUR').toUpperCase(),
                observaciones: doc.observaciones || undefined,
                id_de_empresa: BigInt(empresaId),
                is_new: 1,
                trimestre_cerrado: false,
                enviado_sii: false,
                año_trimestre: trimestreData.año,
                num_trimestre: trimestreData.trimestre,
                dashboard_correo: 'api',
                datos_extra: datosExtra,
              },
            });
            savedDocId = created.id;
          }

          // ── Archivo ──
          if (rutaArchivoMinio && savedDocId) {
            await tx.archivos_documento.create({
              data: {
                documento_id: savedDocId,
                nombre_archivo: numero,
                ruta_archivo: rutaArchivoMinio,
                tipo_archivo: detectedTipoArchivo,
                id_de_empresa: BigInt(empresaId),
              },
            });
          }

          // ── Entidades ──
          const entidadesRaw = doc.entidades || {};
          const emisorRaw   = entidadesRaw.emisor   || {};
          const clienteRaw  = entidadesRaw.cliente  || {};

          if (emisorRaw.nombre || emisorRaw.cif) {
            await tx.entidades_documento.create({
              data: {
                documento_id: savedDocId,
                id_de_empresa: BigInt(empresaId),
                rol: isIssued ? 'emisor' : 'proveedor',
                nombre: emisorRaw.nombre || null,
                identificador_fiscal: cleanCif(emisorRaw.cif) || null,
                direccion: emisorRaw.direccion || null,
                telefono: emisorRaw.telefono || null,
                email: emisorRaw.email || null,
                nombre_hash: sha256ForEntity(emisorRaw.nombre),
                identificador_fiscal_hash: sha256ForEntity(cleanCif(emisorRaw.cif)),
              },
            });
          }

          if (clienteRaw.nombre || clienteRaw.cif) {
            await tx.entidades_documento.create({
              data: {
                documento_id: savedDocId,
                id_de_empresa: BigInt(empresaId),
                rol: isIssued ? 'cliente' : 'receptor',
                nombre: clienteRaw.nombre || null,
                identificador_fiscal: cleanCif(clienteRaw.cif) || null,
                direccion: clienteRaw.direccion || null,
                telefono: clienteRaw.telefono || null,
                email: clienteRaw.email || null,
                nombre_hash: sha256ForEntity(clienteRaw.nombre),
                identificador_fiscal_hash: sha256ForEntity(cleanCif(clienteRaw.cif)),
              },
            });
          }

          // ── Impuestos ──
          const impuestos = Array.isArray(doc.impuestos) ? doc.impuestos : [];
          if (impuestos.length > 0) {
            await tx.impuestos_documento.createMany({
              data: impuestos.map((imp: any) => {
                const base  = Number(imp.base ?? imp.base_imponible) || 0;
                const cuota = Number(imp.cuota) || 0;
                return {
                  documento_id: savedDocId,
                  id_de_empresa: BigInt(empresaId),
                  tipo_impuesto: (imp.tipo_impuesto || 'IVA').toUpperCase(),
                  porcentaje: Number(imp.porcentaje) || 0,
                  base_imponible: base,
                  cuota: cuota,
                  total_con_impuesto: base + cuota,
                };
              }),
            });
          }

          // ── Líneas de detalle ──
          const lineas = Array.isArray(doc.lineas_detalle) ? doc.lineas_detalle : (Array.isArray(doc.lineas) ? doc.lineas : []);
          if (lineas.length > 0) {
            await tx.lineas_documento.createMany({
              data: lineas.map((ln: any) => ({
                documento_id: savedDocId,
                id_de_empresa: BigInt(empresaId),
                codigo: ln.codigo_proveedor || null,
                descripcion: ln.descripcion || 'Sin descripción',
                cantidad: Number(ln.cantidad) || 1,
                precio_unitario: Number(ln.precio_unitario) || 0,
                descuento_porcentaje: Number(ln.descuento_porcentaje) || 0,
                precio_neto: Number(ln.precio_neto ?? ln.precio_unitario) || 0,
                importe_linea: Number(ln.importe_total ?? ln.importe_linea) || 0,
              })),
            });
          }
        }, { maxWait: 8000, timeout: 15000 });

        // ── Actualizar actividad → Completado ──
        const finalStep = isUpdate ? 'Actualizado' : 'Guardado';
        const finalMensaje = isUpdate ? 'Documento actualizado por API correctamente.' : 'Documento ingresado por API correctamente.';
        await connection.query(
          `UPDATE ${dbName}.actividad
           SET status = 'Completado', step = ?, progress = 100,
               mensaje = ?,
               documento_id = ?, is_new = 1
           WHERE upload_id = ?`,
          [finalStep, finalMensaje, savedDocId ? Number(savedDocId) : null, uploadId]
        );

        // ── Health check (fire-and-forget) ──
        if (savedDocId) {
          runHealthChecksForDocument(Number(savedDocId)).catch(() => {});
        }

        results.push({
          numero_documento: numero,
          estado: isUpdate ? 'actualizado' : 'creado',
          id_interno: savedDocId ? Number(savedDocId) : null,
          ...(archivoWarning ? { advertencia_archivo: archivoWarning } : {}),
        });

      } catch (txErr: any) {
        console.error(`[POST /api/v1/documents] Error en transacción para ${numero}:`, txErr.message);
        // Marcar actividad como fallida
        await connection.query(
          `UPDATE ${dbName}.actividad SET status = 'Fallido', step = 'Error', progress = 0,
           mensaje = ? WHERE upload_id = ?`,
          [txErr.message?.slice(0, 255) || 'Error desconocido', uploadId]
        ).catch(() => {});

        results.push({
          numero_documento: numero,
          estado: 'error',
          error: txErr.message || 'Error interno al guardar el documento.',
        });
      }
    }

    const creados     = results.filter(r => r.estado === 'creado').length;
    const actualizados = results.filter(r => r.estado === 'actualizado').length;
    const fallidos    = results.filter(r => r.estado === 'error').length;

    return NextResponse.json({
      resumen: { total: results.length, creados, actualizados, fallidos },
      resultados: results,
    }, { status: fallidos === results.length ? 422 : 200 });

  } catch (error: any) {
    console.error('❌ [POST /api/v1/documents] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Error interno del servidor.' },
      { status: 500 }
    );
  }
}
