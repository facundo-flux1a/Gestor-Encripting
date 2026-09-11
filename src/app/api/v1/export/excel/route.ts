import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/services/api-key-service';
import db from '@/lib/db';
import type { RowDataPacket } from 'mysql2';
import * as XLSX from 'xlsx';
import { prisma } from '@/lib/prisma';
import { hashField, normalizeEntityName } from '@/lib/encryption';

export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

// Excluye Retenciones, Recargos y aplazamientos — solo cuenta filas de IVA puro
const isRealIvaDetail = (detail: any): boolean => {
  const tipo = (detail.tipo_impuesto || '').toUpperCase();
  return (
    !tipo.includes('RECARGO') &&
    !tipo.includes('RETENCION') &&
    !tipo.includes('IRPF') &&
    !tipo.includes('APLAZO')
  );
};

const fmt = (n: number) =>
  new Intl.NumberFormat('es-ES', {
    style: 'decimal',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(n);

const applyNumberFormat = (sheet: XLSX.WorkSheet) => {
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:A1');
  for (let R = range.s.r; R <= range.e.r; ++R) {
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = sheet[addr];
      if (cell && cell.t === 'n') cell.z = '#,##0.00';
    }
  }
};

const adjustColumnWidths = (sheet: XLSX.WorkSheet) => {
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:A1');
  const colWidths: number[] = [];
  for (let C = range.s.c; C <= range.e.c; ++C) {
    let maxLen = 10;
    for (let R = range.s.r; R <= range.e.r; ++R) {
      const cell = sheet[XLSX.utils.encode_cell({ r: R, c: C })];
      if (cell?.v) {
        const len = cell.t === 'n' ? String(cell.v).length + 4 : String(cell.v).length;
        if (len > maxLen) maxLen = len;
      }
    }
    colWidths[C] = Math.min(maxLen + 2, 50);
  }
  sheet['!cols'] = colWidths.map(w => ({ wch: w }));
};

// ─────────────────────────────────────────────────────────────────────────────
// ENDPOINT PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/export/excel
 *
 * Autenticación (header obligatorio):
 *   X-Api-Key: flux_xxxxx
 *
 * Body JSON (todos los campos son opcionales excepto la API key en el header):
 * {
 *   "trimestre": 3,              // 1 | 2 | 3 | 4
 *   "año": 2025,                 // number
 *   "proveedor": "García",       // string — filtra por nombre o CIF del proveedor/emisor (LIKE)
 *   "cliente": "Pérez",          // string — filtra por nombre o CIF del cliente/receptor (LIKE)
 *   "tipo": "recibidas"          // "emitidas" | "recibidas" | "todas" (default: "todas")
 * }
 *
 * Respuesta: binario .xlsx con dos hojas: "Documentos" y "Resumen IVA"
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Extraer API Key del header
    const rawKey = request.headers.get('x-api-key') || '';

    if (!rawKey) {
      return NextResponse.json(
        { error: 'Header X-Api-Key requerido.' },
        { status: 401 }
      );
    }

    // 2. Validar la clave — empresa_id viene de la BD, no del request
    const authResult = await validateApiKey(rawKey);
    if (!authResult.valid || !authResult.empresa_id) {
      return NextResponse.json(
        { error: 'API Key inválida o revocada.' },
        { status: 401 }
      );
    }

    const empresaId = authResult.empresa_id; // Fuente de verdad: la BD

    // 3. Leer filtros de Query Params (URL) o del Body JSON (ambos opcionales)
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      // body vacío es válido
    }

    const searchParams = request.nextUrl.searchParams;

    const trimestreRaw = body.trimestre ?? searchParams.get('trimestre') ?? searchParams.get('num_trimestre');
    const añoRaw = body.año ?? body.anio ?? searchParams.get('año') ?? searchParams.get('anio');
    const proveedorRaw = body.proveedor ?? searchParams.get('proveedor');
    const clienteRaw = body.cliente ?? searchParams.get('cliente');
    const tipoRaw = body.tipo ?? searchParams.get('tipo');

    const trimestre: number | null = trimestreRaw ? Number(trimestreRaw) : null;
    const año: number | null = añoRaw ? Number(añoRaw) : null;
    const proveedor: string | null = proveedorRaw?.trim() || null;
    const cliente: string | null = clienteRaw?.trim() || null;
    const tipo: 'emitidas' | 'recibidas' | 'todas' = (tipoRaw as any) || 'todas';

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

    // 5. Construir query de documentos
    // Tabla real: entidades_documento (plana, con rol/nombre/identificador_fiscal directos)
    // PK de documentos: d.id (no id_documento)
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
        d.datos_extra
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

    if (trimestre !== null) {
      query += ` AND d.num_trimestre = ?`;
      params.push(trimestre);
    }

    if (año) {
      query += ` AND d.año_trimestre = ?`;
      params.push(Number(año));
    }



    query += ` GROUP BY d.id ORDER BY d.fecha_emision DESC`;

    const [documentos] = await db.query<RowDataPacket[]>(query, params);

    if (documentos.length === 0) {
      return NextResponse.json(
        { error: 'No se encontraron documentos con los filtros indicados.' },
        { status: 404 }
      );
    }

    // 6. Cargar impuestos de todos los documentos en una sola query
    const docIds = documentos.map((d: any) => d.doc_id);
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

    // 7. Cargar entidades de todos los documentos y empresa en paralelo con Prisma
    const [entidadesPrisma, empresaData] = await Promise.all([
      prisma.entidades_documento.findMany({
        where: { documento_id: { in: docIds } },
        select: { documento_id: true, rol: true, nombre: true, identificador_fiscal: true }
      }),
      prisma.empresas.findUnique({
        where: { id: empresaId },
        select: { CIF: true, nombre_de_empresa: true }
      })
    ]);

    const empresaCifGlobal = empresaData?.CIF?.trim().toLowerCase() || '';
    const empresaNombreGlobal = empresaData?.nombre_de_empresa || `Empresa_${empresaId}`;

    const entidadesByDoc: Record<number, Record<string, { nombre: string; cif: string }>> = {};
    entidadesPrisma.forEach((ent) => {
      if (!entidadesByDoc[ent.documento_id]) entidadesByDoc[ent.documento_id] = {};
      if (ent.rol) {
         entidadesByDoc[ent.documento_id][ent.rol] = {
           nombre: ent.nombre || '',
           cif: ent.identificador_fiscal || ''
         };
      }
    });

    const enriched = documentos.map((doc: any) => {
      const entidades = entidadesByDoc[doc.doc_id] || {};
      const emisorCif = (entidades.emisor?.cif || entidades.proveedor?.cif || '').trim().toLowerCase();
      const isIssued =
        doc.tipo_documento?.toLowerCase().includes('emitida') ||
        !!(empresaCifGlobal && emisorCif && emisorCif === empresaCifGlobal);
      const iva_details = ivaByDoc[doc.doc_id] || [];

      return { ...doc, entidades, isIssued, iva_details, nombre_de_empresa: empresaNombreGlobal };
    });

    // 8. Filtrar por tipo si se especifica
    let filtered = tipo === 'todas'
      ? enriched
      : enriched.filter((d: any) => tipo === 'emitidas' ? d.isIssued : !d.isIssued);

    if (proveedor) {
      const term = proveedor.toLowerCase();
      filtered = filtered.filter((doc: any) => {
        const emisor = doc.entidades.emisor || doc.entidades.proveedor;
        if (!emisor) return false;
        return (emisor.nombre?.toLowerCase().includes(term) || emisor.cif?.toLowerCase().includes(term));
      });
    }

    if (cliente) {
      const term = cliente.toLowerCase();
      filtered = filtered.filter((doc: any) => {
        const receptor = doc.entidades.receptor || doc.entidades.cliente;
        if (!receptor) return false;
        return (receptor.nombre?.toLowerCase().includes(term) || receptor.cif?.toLowerCase().includes(term));
      });
    }

    if (filtered.length === 0) {
      return NextResponse.json(
        { error: `No hay documentos del tipo "${tipo}" con los filtros indicados.` },
        { status: 404 }
      );
    }

    // 9. Obtener nombre de empresa para el nombre de archivo
    const empresaNombre = filtered[0]?.nombre_de_empresa || `Empresa_${empresaId}`;

    // ─────────────────────────────────────────────────────────────────────────
    // 10. GENERAR WORKBOOK
    // ─────────────────────────────────────────────────────────────────────────
    const workbook = XLSX.utils.book_new();

    // ── HOJA 1: DOCUMENTOS ──────────────────────────────────────────────────
    // ── Descubrimiento dinámico de tasas de IVA desde los datos reales ─────
    const _discoveredRates = new Set<number>([21, 15, 10, 4, 0]); // fallback tasas estándar
    filtered.forEach((doc: any) => {
      (doc.iva_details || []).forEach((i: any) => {
        if (isRealIvaDetail(i)) _discoveredRates.add(Math.round(Number(i.porcentaje)));
      });
    });
    const VAT_RATES = Array.from(_discoveredRates).sort((a, b) => b - a);

    const dataRows = filtered.map((doc: any) => {
      const row: Record<string, any> = {
        'Tipo': doc.tipo_documento || '',
        'Número': doc.numero_documento || '',
        'Fecha Emisión': doc.fecha_emision
          ? new Date(doc.fecha_emision).toLocaleDateString('es-ES')
          : '',
        'Fecha Vcto.': doc.fecha_vencimiento
          ? new Date(doc.fecha_vencimiento).toLocaleDateString('es-ES')
          : '',
        'Trimestre': doc.num_trimestre || '',
        'Año': doc.año_trimestre || '',
        'Empresa': doc.nombre_de_empresa || '',
        'Emisor / Proveedor': doc.entidades.emisor?.nombre || doc.entidades.proveedor?.nombre || '',
        'CIF Emisor': doc.entidades.emisor?.cif || doc.entidades.proveedor?.cif || '',
        'Receptor / Cliente': doc.entidades.receptor?.nombre || doc.entidades.cliente?.nombre || '',
        'CIF Receptor': doc.entidades.receptor?.cif || doc.entidades.cliente?.cif || '',
        'Moneda': doc.moneda || 'EUR',
        'Observaciones': doc.observaciones || '',
      };

      // Columnas Base XX% e IVA XX%
      VAT_RATES.forEach(rate => {
        const detail = (doc.iva_details || []).find(
          (i: any) => isRealIvaDetail(i) && Number(i.porcentaje) === rate
        );
        row[`Base ${rate}%`] = detail ? Number(detail.base_imponible) || 0 : 0;
        if (rate > 0) {
          row[`IVA ${rate}%`] = detail ? Number(detail.cuota) || 0 : 0;
        }
      });

      // Retenciones
      const retDetail = (doc.iva_details || []).find(
        (i: any) => {
          const t = (i.tipo_impuesto || '').toUpperCase();
          return t.includes('RETENCION') || t.includes('IRPF');
        }
      );
      row['Retención'] = retDetail ? Math.abs(Number(retDetail.cuota) || 0) : 0;

      // Recargo de Equivalencia
      const recargoDetail = (doc.iva_details || []).find(
        (i: any) => (i.tipo_impuesto || '').toUpperCase().includes('RECARGO')
      );
      row['Recargo de Equiv.'] = recargoDetail ? Math.abs(Number(recargoDetail.cuota) || 0) : 0;

      // Base No Sujeta / Suplidos
      let datosExtra: any = {};
      try {
        if (typeof doc.datos_extra === 'string') datosExtra = JSON.parse(doc.datos_extra);
        else if (doc.datos_extra && typeof doc.datos_extra === 'object') datosExtra = doc.datos_extra;
      } catch { datosExtra = {}; }
      const baseNoSujeta = Number(datosExtra?.base_no_sujeta || datosExtra?.BASE_NO_SUJETA || 0);
      row['Base No Sujeta'] = baseNoSujeta;

      // Totales finales
      row['Base Imponible'] = Number(doc.importe_sin_impuestos) || 0;
      row['Total Factura'] = Number(doc.importe_total) || 0;

      return row;
    });

    // Fila de totales
    // Columnas numéricas dinámicas (una por tasa descubierta)
    const numCols = [
      ...VAT_RATES.flatMap(r => r > 0 ? [`Base ${r}%`, `IVA ${r}%`] : [`Base ${r}%`]),
      'Base No Sujeta', 'Retención', 'Recargo de Equiv.', 'Base Imponible', 'Total Factura'
    ];
    const totalsRow: Record<string, any> = { 'Tipo': 'TOTALES' };
    numCols.forEach(col => {
      totalsRow[col] = filtered.reduce((sum: number, doc: any) => {
        // Re-calculate same as above for totals
        if (col === 'Base No Sujeta') {
          let de: any = {};
          try {
            if (typeof doc.datos_extra === 'string') de = JSON.parse(doc.datos_extra);
            else if (doc.datos_extra && typeof doc.datos_extra === 'object') de = doc.datos_extra;
          } catch { de = {}; }
          return sum + Number(de?.base_no_sujeta || de?.BASE_NO_SUJETA || 0);
        }
        if (col === 'Base Imponible') return sum + (Number(doc.importe_sin_impuestos) || 0);
        if (col === 'Total Factura') return sum + (Number(doc.importe_total) || 0);
        if (col === 'Retención') {
          const r = (doc.iva_details || []).find((i: any) => {
            const t = (i.tipo_impuesto || '').toUpperCase();
            return t.includes('RETENCION') || t.includes('IRPF');
          });
          return sum + (r ? Math.abs(Number(r.cuota) || 0) : 0);
        }
        if (col === 'Recargo de Equiv.') {
          const r = (doc.iva_details || []).find((i: any) =>
            (i.tipo_impuesto || '').toUpperCase().includes('RECARGO')
          );
          return sum + (r ? Math.abs(Number(r.cuota) || 0) : 0);
        }
        const rateMatch = col.match(/\d+/);
        if (!rateMatch) return sum;
        const rate = Number(rateMatch[0]);
        const d = (doc.iva_details || []).find(
          (i: any) => isRealIvaDetail(i) && Number(i.porcentaje) === rate
        );
        if (!d) return sum;
        return sum + (col.startsWith('Base')
          ? (Number(d.base_imponible) || 0)
          : (Number(d.cuota) || 0));
      }, 0);
    });
    dataRows.push(totalsRow);

    const dataSheet = XLSX.utils.json_to_sheet(dataRows);
    applyNumberFormat(dataSheet);
    adjustColumnWidths(dataSheet);
    XLSX.utils.book_append_sheet(workbook, dataSheet, 'Documentos');

    // ── HOJA 2: RESUMEN IVA ─────────────────────────────────────────────────
    const summaryRows: (string | number)[][] = [];
    const qHeaders = [''];
    const activeQuarters = trimestre ? [trimestre] : [1, 2, 3, 4];
    activeQuarters.forEach(q => qHeaders.push(`${q}T`));
    qHeaders.push('Total');

    const buildSummarySection = (title: string, docs: any[]) => {
      summaryRows.push([title]);
      summaryRows.push(qHeaders);

      const accumulators: Record<string, Record<number | string, number>> = {
        retenciones: { 1: 0, 2: 0, 3: 0, 4: 0, total: 0 },
        recargos: { 1: 0, 2: 0, 3: 0, 4: 0, total: 0 },
        base_no_sujeta: { 1: 0, 2: 0, 3: 0, 4: 0, total: 0 },
        descuento_global: { 1: 0, 2: 0, 3: 0, 4: 0, total: 0 },
      };
      VAT_RATES.forEach(r => {
        accumulators[`base_${r}`] = { 1: 0, 2: 0, 3: 0, 4: 0, total: 0 };
        if (r > 0) accumulators[`iva_${r}`] = { 1: 0, 2: 0, 3: 0, 4: 0, total: 0 };
      });
      const totalFacturado = { 1: 0, 2: 0, 3: 0, 4: 0, total: 0 };

      docs.forEach((doc: any) => {
        const q: number = doc.num_trimestre || 0;
        const totalDoc = Math.abs(Number(doc.importe_total) || 0);
        if (q >= 1 && q <= 4) totalFacturado[q] += totalDoc;
        totalFacturado.total += totalDoc;

        // Acumular Base no sujeta a IVA
        let de: any = {};
        try {
          if (typeof doc.datos_extra === 'string') de = JSON.parse(doc.datos_extra);
          else if (doc.datos_extra && typeof doc.datos_extra === 'object') de = doc.datos_extra;
        } catch { de = {}; }
        const bns = Math.abs(Number(de?.base_no_sujeta || de?.BASE_NO_SUJETA || doc?.base_no_sujeta || 0));
        if (q >= 1 && q <= 4) accumulators.base_no_sujeta[q] += bns;
        accumulators.base_no_sujeta.total += bns;

        // Acumular Descuento Global
        const desc = Math.abs(Number(de?.descuento_global || de?.DESCUENTO_GLOBAL || doc?.descuento_global || 0));
        if (desc > 0) {
          if (q >= 1 && q <= 4) accumulators.descuento_global[q] += desc;
          accumulators.descuento_global.total += desc;
        }

        (doc.iva_details || []).forEach((detail: any) => {
          const tipo = (detail.tipo_impuesto || '').toUpperCase();
          const cuota = Math.abs(Number(detail.cuota) || 0);

          if (tipo.includes('RETENCION') || tipo.includes('IRPF')) {
            if (q >= 1 && q <= 4) accumulators.retenciones[q] += cuota;
            accumulators.retenciones.total += cuota;
            return;
          }

          if (tipo.includes('RECARGO')) {
            if (q >= 1 && q <= 4) accumulators.recargos[q] += cuota;
            accumulators.recargos.total += cuota;
            return;
          }

          const rate = Number(detail.porcentaje);
          if (!isRealIvaDetail(detail)) return;

          const base = Math.abs(Number(detail.base_imponible) || 0);
          const bKey = `base_${rate}`;
          const iKey = `iva_${rate}`;
          if (accumulators[bKey]) {
            if (q >= 1 && q <= 4) accumulators[bKey][q] += base;
            accumulators[bKey].total += base;
          }
          if (accumulators[iKey]) {
            if (q >= 1 && q <= 4) accumulators[iKey][q] += cuota;
            accumulators[iKey].total += cuota;
          }
        });
      });

      const buildRow = (label: string, acc: Record<number | string, number>) => {
        const row: (string | number)[] = [label];
        activeQuarters.forEach(q => row.push(acc[q] || 0));
        row.push(acc.total || 0);
        return row;
      };

      // Bases
      VAT_RATES.forEach(r => {
        const key = `base_${r}`;
        const hasData = activeQuarters.some(q => accumulators[key]?.[q] !== 0) ||
          accumulators[key]?.total !== 0;
        if (hasData) summaryRows.push(buildRow(`Base ${r}%`, accumulators[key]));
      });

      const hasBns = activeQuarters.some(q => accumulators.base_no_sujeta?.[q] !== 0) ||
        accumulators.base_no_sujeta?.total !== 0;
      if (hasBns) summaryRows.push(buildRow('Base no sujeta a IVA', accumulators.base_no_sujeta));

      summaryRows.push([]);

      // IVA
      VAT_RATES.filter(r => r > 0).forEach(r => {
        const key = `iva_${r}`;
        const hasData = activeQuarters.some(q => accumulators[key]?.[q] !== 0) ||
          accumulators[key]?.total !== 0;
        if (hasData) summaryRows.push(buildRow(`IVA ${r}%`, accumulators[key]));
      });
      summaryRows.push([]);

      // Totales bases e IVA
      const totalBasesRow: (string | number)[] = ['Total Bases'];
      activeQuarters.forEach(q => {
        const vatSum = VAT_RATES.reduce((s, r) => s + (accumulators[`base_${r}`]?.[q] || 0), 0);
        totalBasesRow.push(vatSum + (accumulators.base_no_sujeta?.[q] || 0));
      });
      const totalVatSum = VAT_RATES.reduce((s, r) => s + (accumulators[`base_${r}`]?.total || 0), 0);
      totalBasesRow.push(totalVatSum + (accumulators.base_no_sujeta?.total || 0));
      summaryRows.push(totalBasesRow);

      const totalIvaRow: (string | number)[] = ['Total IVA'];
      activeQuarters.forEach(q => {
        totalIvaRow.push(VAT_RATES.filter(r => r > 0).reduce((s, r) => s + (accumulators[`iva_${r}`]?.[q] || 0), 0));
      });
      totalIvaRow.push(VAT_RATES.filter(r => r > 0).reduce((s, r) => s + (accumulators[`iva_${r}`]?.total || 0), 0));
      summaryRows.push(totalIvaRow);
      summaryRows.push([]);

      // Total facturado, retenciones, recargos y descuentos
      summaryRows.push(buildRow('Total Gral. Facturado', totalFacturado));
      summaryRows.push(buildRow('Total Retenciones', accumulators.retenciones));
      summaryRows.push(buildRow('Total Recargos de Equiv.', accumulators.recargos));
      const hasDescuento = activeQuarters.some(q => accumulators.descuento_global?.[q] !== 0) ||
        accumulators.descuento_global?.total !== 0;
      if (hasDescuento) summaryRows.push(buildRow('(-) Descuento Global', accumulators.descuento_global));
      summaryRows.push([]);
    };

    // Secciones según tipo filtrado
    if (tipo === 'todas' || tipo === 'recibidas') {
      const gastos = filtered.filter((d: any) => !d.isIssued);
      if (gastos.length > 0) buildSummarySection('Resumen anual IVA (Gastos)', gastos);
    }
    if (tipo === 'todas' || tipo === 'emitidas') {
      const ingresos = filtered.filter((d: any) => d.isIssued);
      if (ingresos.length > 0) buildSummarySection('Resumen anual IVA (Ingresos)', ingresos);
    }

    const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
    applyNumberFormat(summarySheet);
    adjustColumnWidths(summarySheet);
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Resumen IVA');

    // ─────────────────────────────────────────────────────────────────────────
    // 11. GENERAR BUFFER Y DEVOLVER RESPUESTA BINARIA
    // ─────────────────────────────────────────────────────────────────────────
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    const fechaHoy = new Date().toISOString().split('T')[0];
    const empLabel = empresaNombre.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
    const trimestreLabel = trimestre ? `_T${trimestre}` : '';
    const añoLabel = año ? `_${año}` : '';
    const filename = `Export_${empLabel}${añoLabel}${trimestreLabel}_${fechaHoy}.xlsx`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store'
      }
    });

  } catch (error) {
    console.error('❌ [api/v1/export/excel] Error:', error);
    return NextResponse.json({ error: 'Error interno al generar el export.' }, { status: 500 });
  }
}
