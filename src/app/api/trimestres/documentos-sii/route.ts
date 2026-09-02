import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/services/auth-service';
import pool from '@/lib/db';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const año = searchParams.get('año') ? parseInt(searchParams.get('año')!) : null;
    const trimestre = searchParams.get('trimestre') ? parseInt(searchParams.get('trimestre')!) : null;
    const empresaId = searchParams.get('empresa_id');
    const incluirEnviadas = searchParams.get('incluir_enviadas') === 'true';
    const tipoLibro = searchParams.get('tipo_libro') || 'emitidas';

    console.log('📥 [API-TRIMESTRES-DOCS-SII] Parámetros:', { año, trimestre, empresaId, tipoLibro, incluirEnviadas });

    let query = `
      SELECT 
        d.id,
        d.numero_documento,
        d.fecha_emision,
        d.tipo_documento,
        d.importe_total,
        d.importe_sin_impuestos,
        d.moneda,
        d.id_de_empresa,
        d.trimestre_cerrado,
        d.enviado_sii,
        d.año_trimestre,
        d.num_trimestre
      FROM documentos d
      WHERE 
        (
          (LOWER(d.tipo_documento) LIKE '%factura%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
          OR (LOWER(d.tipo_documento) LIKE '%abono%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
        )
    `;

    if (!incluirEnviadas) {
      query += ` AND (d.enviado_sii = 0 OR d.enviado_sii IS NULL)`;
    }

    if (tipoLibro === 'recibidas') {
      query += ` AND (LOWER(d.tipo_documento) LIKE '%recibid%' OR LOWER(d.tipo_documento) LIKE '%gasto%' OR LOWER(d.tipo_documento) LIKE '%compra%')`;
    } else if (tipoLibro === 'emitidas') {
      query += ` AND LOWER(d.tipo_documento) NOT LIKE '%recibid%' AND LOWER(d.tipo_documento) NOT LIKE '%gasto%' AND LOWER(d.tipo_documento) NOT LIKE '%compra%'`;
    }

    const params: any[] = [];

    const trimestresParam = searchParams.get('trimestres') || searchParams.get('trimestre');
    const mesesParam = searchParams.get('meses');
    const fechaDesde = searchParams.get('fecha_desde');
    const fechaHasta = searchParams.get('fecha_hasta');

    if (año && año > 0) {
      query += ' AND d.año_trimestre = ?';
      params.push(año);
    }

    if (trimestresParam && trimestresParam !== 'all') {
      const arrTrim = trimestresParam.split(',').map(t => parseInt(t.replace('T', '').trim())).filter(n => !isNaN(n));
      if (arrTrim.length > 0) {
        query += ` AND d.num_trimestre IN (${arrTrim.map(() => '?').join(',')})`;
        arrTrim.forEach(t => params.push(t));
      }
    }

    if (mesesParam) {
      const arrMeses = mesesParam.split(',').map(m => parseInt(m.trim())).filter(n => !isNaN(n));
      if (arrMeses.length > 0) {
        query += ` AND MONTH(d.fecha_emision) IN (${arrMeses.map(() => '?').join(',')})`;
        arrMeses.forEach(m => params.push(m));
      }
    }

    if (fechaDesde) {
      query += ' AND d.fecha_emision >= ?';
      params.push(fechaDesde);
    }

    if (fechaHasta) {
      query += ' AND d.fecha_emision <= ?';
      params.push(fechaHasta);
    }

    if (empresaId && empresaId !== 'all') {
      query += ' AND d.id_de_empresa IN (' + empresaId.split(',').map(() => '?').join(',') + ')';
      empresaId.split(',').forEach(id => params.push(parseInt(id.trim())));
    }

    query += ' ORDER BY d.fecha_emision ASC';

    console.log('📝 [API-TRIMESTRES-DOCS-SII] Query:', query);
    console.log('📝 [API-TRIMESTRES-DOCS-SII] Params:', params);

    const [rows]: any = await pool.query(query, params);

    console.log('✅ [API-TRIMESTRES-DOCS-SII] Documentos encontrados:', rows.length);

    const docIds = Array.from(new Set((rows as any[]).map(r => r.id)));
    const empIds = Array.from(new Set((rows as any[]).map(r => r.id_de_empresa)));

    let empresasMap: Record<number, any> = {};
    let entidadesByDoc: Record<number, Record<string, any>> = {};

    let impuestosByDoc: Record<number, { tipo_iva: number; cuota_iva: number }> = {};

    if (docIds.length > 0) {
      const [empresasPrisma, entidadesPrisma, impuestosPrisma] = await Promise.all([
        prisma.empresas.findMany({
          where: { id: { in: empIds as number[] } },
          select: { id: true, nombre_de_empresa: true, CIF: true }
        }),
        prisma.entidades_documento.findMany({
          where: { documento_id: { in: docIds as number[] }, rol: { in: ['emisor', 'cliente', 'proveedor', 'receptor'] } },
          select: { documento_id: true, rol: true, nombre: true, identificador_fiscal: true }
        }),
        prisma.impuestos_documento.findMany({
          where: { documento_id: { in: docIds as number[] }, tipo_impuesto: 'IVA' },
          select: { documento_id: true, porcentaje: true, cuota: true }
        })
      ]);

      empresasPrisma.forEach((e: any) => empresasMap[Number(e.id)] = e);
      entidadesPrisma.forEach((ent: any) => {
        if (!entidadesByDoc[Number(ent.documento_id)]) entidadesByDoc[Number(ent.documento_id)] = {};
        if (ent.rol) entidadesByDoc[Number(ent.documento_id)][ent.rol] = ent;
      });
      // Guardamos el primer tramo IVA de cada documento
      impuestosPrisma.forEach((imp: any) => {
        const docId = Number(imp.documento_id);
        if (!impuestosByDoc[docId]) {
          impuestosByDoc[docId] = {
            tipo_iva: parseFloat(imp.porcentaje?.toString() || '21'),
            cuota_iva: parseFloat(imp.cuota?.toString() || '0'),
          };
        }
      });
    }

    // Formatear documentos para el SII
    const documentosSII = rows.map((doc: any) => {
      const baseImponible = parseFloat(doc.importe_sin_impuestos || 0);
      const total = parseFloat(doc.importe_total || 0);
      // Usar datos reales de impuestos_documento (porcentaje y cuota IVA declarados)
      const ivaReal = impuestosByDoc[doc.id];
      const cuotaIVA = ivaReal ? ivaReal.cuota_iva : (total - baseImponible);
      const tipoIVA = ivaReal ? ivaReal.tipo_iva : (baseImponible > 0 ? parseFloat(((cuotaIVA / baseImponible) * 100).toFixed(2)) : 21);

      const empresa = empresasMap[doc.id_de_empresa] || {};
      const ents = entidadesByDoc[doc.id] || {};

        // Datos cliente/emisor/proveedor
        const contraparte = ents.proveedor || ents.cliente || ents.emisor || ents.receptor;
        const nifContraparte = contraparte?.identificador_fiscal || '';
        const nombreContraparte = contraparte?.nombre || '';

        return {
          // Datos originales
          id: doc.id,
          numero_documento: doc.numero_documento,
          fecha_emision: doc.fecha_emision,
          tipo_documento: doc.tipo_documento,
          trimestre_cerrado: doc.trimestre_cerrado === 1 || doc.trimestre_cerrado === true,
          enviado_sii: doc.enviado_sii === 1 || doc.enviado_sii === true,
          año_trimestre: doc.año_trimestre,
          num_trimestre: doc.num_trimestre,
          
          // Datos empresa
          nif_empresa: empresa.CIF || '',
          nombre_empresa: empresa.nombre_de_empresa || '',
          
          // Datos cliente/proveedor
          nif_cliente: nifContraparte,
          nombre_cliente: nombreContraparte,
          pais_cliente: 'ES',
          
          // Datos para SII (formato factura)
          num_factura: doc.numero_documento,
          fecha_factura: doc.fecha_emision,
          tipo_factura: nifContraparte ? 'F1' : 'F2',
        clave_regimen: '01',
        descripcion: doc.tipo_documento,
        base_imponible: baseImponible.toFixed(2),
        tipo_iva: typeof tipoIVA === 'number' ? tipoIVA : parseFloat(tipoIVA as string),
        cuota_iva: typeof cuotaIVA === 'number' ? cuotaIVA : parseFloat(cuotaIVA as string),
      };
    });

    return NextResponse.json({
      success: true,
      año,
      trimestre,
      empresa_id: empresaId,
      total_documentos: documentosSII.length,
      documentos: documentosSII
    });

  } catch (error) {
    console.error('❌ Error en /api/trimestres/documentos-sii:', error);
    return NextResponse.json(
      { 
        error: 'Error al cargar documentos para SII',
        details: error instanceof Error ? error.message : 'Error desconocido'
      },
      { status: 500 }
    );
  }
}