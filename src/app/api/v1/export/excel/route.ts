import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/services/api-key-service';
import db from '@/lib/db';
import type { RowDataPacket } from 'mysql2';
import * as XLSX from 'xlsx';

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

    // 3. Leer filtros del body JSON (todos opcionales)
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      // body vacío es válido — exporta todo sin filtros
    }

    const trimestre: number | null = body.trimestre ? Number(body.trimestre) : null;
    const año: number | null = body.año ? Number(body.año) : null;
    const proveedor: string | null = body.proveedor?.trim() || null;
    const cliente: string | null = body.cliente?.trim() || null;
    const tipo: 'emitidas' | 'recibidas' | 'todas' = body.tipo || 'todas';

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
        e.nombre_de_empresa,
        e.CIF AS empresa_cif,
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
      WHERE d.id_de_empresa = ?
        AND (
          (LOWER(d.tipo_documento) LIKE '%factura%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
          OR (LOWER(d.tipo_documento) LIKE '%abono%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
          OR (LOWER(d.tipo_documento) LIKE '%nota%cr%dito%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
        )
        AND d.id NOT IN (
          SELECT documento_id FROM incidencias_documento WHERE validado = 0
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

    // Filtro por proveedor
    if (proveedor) {
      query += ` AND d.id IN (
        SELECT ent2.documento_id FROM entidades_documento ent2
        WHERE ent2.rol IN ('emisor','proveedor')
          AND (ent2.nombre LIKE ? OR ent2.identificador_fiscal LIKE ?)
      )`;
      const term = `%${proveedor}%`;
      params.push(term, term);
    }

    // Filtro por cliente
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

    // 7. Enriquecer documentos con entidades y determinar is_issued
    const empresaCif = documentos[0]?.empresa_cif?.trim().toLowerCase() || '';

    const enriched = documentos.map((doc: any) => {
      const entidades: Record<string, { nombre: string; cif: string }> = {};
      if (doc.entidades_raw) {
        doc.entidades_raw.split(';;').forEach((e: string) => {
          const [rol, nombre, cif] = e.split('||');
          if (rol) entidades[rol] = { nombre: nombre || '', cif: cif || '' };
        });
      }

      const emisorCif = (entidades.emisor?.cif || entidades.proveedor?.cif || '').trim().toLowerCase();
      const isIssued = !!(empresaCif && emisorCif && emisorCif === empresaCif);

      const iva_details = ivaByDoc[doc.doc_id] || [];

      return { ...doc, entidades, isIssued, iva_details };
    });

    // 8. Filtrar por tipo si se especifica
    const filtered = tipo === 'todas'
      ? enriched
      : enriched.filter((d: any) => tipo === 'emitidas' ? d.isIssued : !d.isIssued);

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
    const VAT_RATES = [21, 15, 10, 4, 0];

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

      // Totales finales
      row['Base Imponible'] = Number(doc.importe_sin_impuestos) || 0;
      row['Total Factura'] = Number(doc.importe_total) || 0;

      return row;
    });

    // Fila de totales
    const numCols = [
      'Base 21%', 'IVA 21%', 'Base 15%', 'IVA 15%',
      'Base 10%', 'IVA 10%', 'Base 4%', 'IVA 4%',
      'Base 0%', 'Retención', 'Base Imponible', 'Total Factura'
    ];
    const totalsRow: Record<string, any> = { 'Tipo': 'TOTALES' };
    numCols.forEach(col => {
      totalsRow[col] = filtered.reduce((sum: number, doc: any) => {
        // Re-calculate same as above for totals
        if (col === 'Base Imponible') return sum + (Number(doc.importe_sin_impuestos) || 0);
        if (col === 'Total Factura') return sum + (Number(doc.importe_total) || 0);
        if (col === 'Retención') {
          const r = (doc.iva_details || []).find((i: any) => {
            const t = (i.tipo_impuesto || '').toUpperCase();
            return t.includes('RETENCION') || t.includes('IRPF');
          });
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

        (doc.iva_details || []).forEach((detail: any) => {
          const tipo = (detail.tipo_impuesto || '').toUpperCase();
          const cuota = Math.abs(Number(detail.cuota) || 0);

          if (tipo.includes('RETENCION') || tipo.includes('IRPF')) {
            if (q >= 1 && q <= 4) accumulators.retenciones[q] += cuota;
            accumulators.retenciones.total += cuota;
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
        totalBasesRow.push(VAT_RATES.reduce((s, r) => s + (accumulators[`base_${r}`]?.[q] || 0), 0));
      });
      totalBasesRow.push(VAT_RATES.reduce((s, r) => s + (accumulators[`base_${r}`]?.total || 0), 0));
      summaryRows.push(totalBasesRow);

      const totalIvaRow: (string | number)[] = ['Total IVA'];
      activeQuarters.forEach(q => {
        totalIvaRow.push(VAT_RATES.filter(r => r > 0).reduce((s, r) => s + (accumulators[`iva_${r}`]?.[q] || 0), 0));
      });
      totalIvaRow.push(VAT_RATES.filter(r => r > 0).reduce((s, r) => s + (accumulators[`iva_${r}`]?.total || 0), 0));
      summaryRows.push(totalIvaRow);
      summaryRows.push([]);

      // Total facturado y retenciones
      summaryRows.push(buildRow('Total Gral. Facturado', totalFacturado));
      summaryRows.push(buildRow('Total Retenciones', accumulators.retenciones));
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
