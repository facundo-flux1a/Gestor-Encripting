/**
 * src/lib/api-v1-helpers.ts
 *
 * Funciones auxiliares para estandarizar las respuestas de /api/v1/documents
 * y /api/v1/documents/full según las especificaciones de integración contable.
 */

export interface FormattedEntity {
  nombre: string | null;
  cif: string | null;
  direccion: string | null;
  codigo_postal: string | null;
  poblacion: string | null;
  provincia: string | null;
  telefono: string | null;
  email: string | null;
  iban: string | null;
}

/**
 * Formatea y normaliza una entidad (proveedor/emisor o cliente/receptor),
 * garantizando que los campos faltantes sean `null` (no cadenas vacías ni 0)
 * y extrayendo CP, población, provincia e IBAN si están en dirección o datos_extra.
 */
export function formatEntityData(ent: any): FormattedEntity {
  if (!ent) {
    return {
      nombre: null,
      cif: null,
      direccion: null,
      codigo_postal: null,
      poblacion: null,
      provincia: null,
      telefono: null,
      email: null,
      iban: null
    };
  }

  let datosExtra: any = {};
  if (typeof ent.datos_extra === 'string') {
    try { datosExtra = JSON.parse(ent.datos_extra); } catch { datosExtra = {}; }
  } else if (typeof ent.datos_extra === 'object' && ent.datos_extra !== null) {
    datosExtra = ent.datos_extra;
  }

  const rawDir = ent.direccion?.trim() || null;
  
  let cp: string | null = datosExtra.codigo_postal || datosExtra.cp || null;
  let poblacion: string | null = datosExtra.poblacion || datosExtra.ciudad || datosExtra.municipio || null;
  let provincia: string | null = datosExtra.provincia || null;

  // Si no vienen en datos_extra, intentar extraer CP y Población del string de dirección española
  if (!cp && rawDir) {
    const cpMatch = rawDir.match(/\b(0[1-9]|[1-4][0-9]|5[0-2])\d{3}\b/);
    if (cpMatch) {
      cp = cpMatch[0];
      if (!poblacion) {
        const afterCp = rawDir.slice(rawDir.indexOf(cp) + cp.length).replace(/^[\s,.-]+/, '').trim();
        if (afterCp) {
          poblacion = afterCp.split(/[,;\n]/)[0].trim() || null;
        }
      }
    }
  }

  const iban = datosExtra.iban || datosExtra.cuenta_bancaria || datosExtra.cuenta || null;

  return {
    nombre: ent.nombre?.trim() || null,
    cif: ent.identificador_fiscal?.trim() || null,
    direccion: rawDir,
    codigo_postal: cp ? String(cp).trim() : null,
    poblacion: poblacion ? String(poblacion).trim() : null,
    provincia: provincia ? String(provincia).trim() : null,
    telefono: ent.telefono?.trim() || datosExtra.telefono?.trim() || null,
    email: ent.email?.trim() || datosExtra.email?.trim() || null,
    iban: iban ? String(iban).trim() : null,
  };
}

/**
 * Normaliza y genera la URL pública del archivo PDF sin duplicar prefijos de MinIO.
 */
export function buildFileUrl(rutaArchivo: string | null | undefined): string | null {
  if (!rutaArchivo || typeof rutaArchivo !== 'string') return null;
  const trimmed = rutaArchivo.trim();
  if (!trimmed) return null;

  // Si ya es una URL absoluta, devolverla directamente
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }

  const MINIO_ENDPOINT = (process.env.MINIO_PUBLIC_ENDPOINT || process.env.MINIO_ENDPOINT || 'https://minio.allbase.com.ar').replace(/\/$/, '');
  const MINIO_BUCKET_NAME = process.env.MINIO_BUCKET_NAME || 'flux1a';
  const cleanPath = trimmed.replace(/^\//, '');

  return `${MINIO_ENDPOINT}/${MINIO_BUCKET_NAME}/${cleanPath}`;
}

export interface FormattedLine {
  codigo_proveedor: string | null;
  codigo_barras: string | null;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  descuento_porcentaje: number;
  precio_neto: number;
  importe_total: number;
  iva_porcentaje: number | null;
  iva_incluido: boolean;
}

/**
 * Formatea una línea de detalle con códigos, importes y tipo de IVA.
 */
export function formatDocumentLine(line: any, docImpuestos: any[] = []): FormattedLine {
  let datosExtra: any = {};
  if (typeof line.datos_extra === 'string') {
    try { datosExtra = JSON.parse(line.datos_extra); } catch { datosExtra = {}; }
  } else if (typeof line.datos_extra === 'object' && line.datos_extra !== null) {
    datosExtra = line.datos_extra;
  }

  // Deducir iva_porcentaje si viene en datos_extra o si el documento tiene un único tipo de IVA
  let ivaPct: number | null = null;
  if (datosExtra.iva_porcentaje !== undefined && datosExtra.iva_porcentaje !== null) {
    ivaPct = Number(datosExtra.iva_porcentaje);
  } else if (docImpuestos.length > 0) {
    const ivaTaxes = docImpuestos.filter((t: any) => !/retencion|reten|irpf|recargo/i.test(t.tipo_impuesto || ''));
    if (ivaTaxes.length === 1) {
      ivaPct = Number(ivaTaxes[0].porcentaje) || 0;
    }
  }

  let rawCodigo = line.codigo?.trim() || datosExtra.codigo_articulo?.trim() || datosExtra.codigo_proveedor?.trim() || null;
  // Si el código es 'SUPLIDO' o un valor genérico/no comercial, devolver null
  if (rawCodigo && (rawCodigo.toUpperCase() === 'SUPLIDO' || rawCodigo.toUpperCase() === 'NULL' || rawCodigo.toUpperCase() === 'UNDEFINED' || rawCodigo === '0')) {
    rawCodigo = null;
  }
  const codigo = rawCodigo;
  const codigoBarras = datosExtra.codigo_barras?.trim() || datosExtra.ean?.trim() || null;

  const cantidad = Number(line.cantidad) || 0;
  const precioUnitario = Number(line.precio_unitario) || 0;
  const descuentoPct = Number(line.descuento_porcentaje) || 0;
  const precioNeto = Number(line.precio_neto) || precioUnitario;
  const importeLinea = Number(line.importe_linea) || 0;

  return {
    codigo_proveedor: codigo,
    codigo_barras: codigoBarras,
    descripcion: line.descripcion || '',
    cantidad,
    precio_unitario: precioUnitario,
    descuento_porcentaje: descuentoPct,
    precio_neto: precioNeto,
    importe_total: importeLinea, // Base imponible de la línea
    iva_porcentaje: ivaPct,
    iva_incluido: false
  };
}

/**
 * Parsea fechas flexibles para filtros como modificados_desde:
 * - ISO 8601: "2026-08-24T12:00:00Z", "2026-08-24"
 * - DD/MM/AAAA o DD-MM-AAAA: "24/08/2026", "24/08/2026 14:30"
 * - DD/MM/AA o DD-MM-AA: "24/08/26" (se asume siglo 2000 -> 2026)
 * Si no incluye hora explícita, se asume el inicio del día (00:00:00.000Z).
 */
export function parseFlexibleDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const clean = dateStr.trim();
  if (!clean) return null;

  // 1. Caso DD/MM/AAAA o DD/MM/AA (con / o -)
  const dmyMatch = clean.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10) - 1; // 0-indexed en JS
    let year = parseInt(dmyMatch[3], 10);
    if (year < 100) {
      year += 2000;
    }
    const hours = dmyMatch[4] !== undefined ? parseInt(dmyMatch[4], 10) : 0;
    const minutes = dmyMatch[5] !== undefined ? parseInt(dmyMatch[5], 10) : 0;
    const seconds = dmyMatch[6] !== undefined ? parseInt(dmyMatch[6], 10) : 0;

    const parsed = new Date(Date.UTC(year, month, day, hours, minutes, seconds));
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  // 2. Caso YYYY-MM-DD sin hora (asumir 00:00:00 UTC)
  const ymdMatch = clean.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10) - 1;
    const day = parseInt(ymdMatch[3], 10);
    const parsed = new Date(Date.UTC(year, month, day, 0, 0, 0));
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  // 3. Fallback a Date estándar (ISO 8601 con hora, timestamp, etc.)
  const parsed = new Date(clean);
  return isNaN(parsed.getTime()) ? null : parsed;
}
