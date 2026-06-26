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
    const año = parseInt(searchParams.get('año') || '0');
    const trimestre = parseInt(searchParams.get('trimestre') || '0');
    const empresaId = searchParams.get('empresa_id');

    if (!año || !trimestre) {
      return NextResponse.json(
        { error: 'Faltan parámetros: año y trimestre' },
        { status: 400 }
      );
    }

    console.log('📥 [API-TRIMESTRES-DOCS-SII] Parámetros:', { año, trimestre, empresaId });

    // ✅ Query modificado con filtros
    let query = `
      SELECT 
        d.id,
        d.numero_documento,
        d.fecha_emision,
        d.tipo_documento,
        d.importe_total,
        d.importe_sin_impuestos,
        d.moneda,
        d.id_de_empresa
      FROM documentos d
      WHERE 
        d.año_trimestre = ? 
        AND d.num_trimestre = ?
        AND d.trimestre_cerrado = 1
        AND d.enviado_sii = 0
        AND (
          (LOWER(d.tipo_documento) LIKE '%factura%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
          OR (LOWER(d.tipo_documento) LIKE '%abono%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
        )
    `;

    const params: any[] = [año, trimestre];

    if (empresaId && empresaId !== 'all') {
      query += ' AND d.id_de_empresa = ?';
      params.push(parseInt(empresaId));
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

    if (docIds.length > 0) {
      const [empresasPrisma, entidadesPrisma] = await Promise.all([
        prisma.empresas.findMany({
          where: { id: { in: empIds as number[] } },
          select: { id: true, nombre_de_empresa: true, CIF: true }
        }),
        prisma.entidades_documento.findMany({
          where: { documento_id: { in: docIds as number[] }, rol: { in: ['emisor', 'cliente'] } },
          select: { documento_id: true, rol: true, nombre: true, identificador_fiscal: true }
        })
      ]);

      empresasPrisma.forEach(e => empresasMap[Number(e.id)] = e);
      entidadesPrisma.forEach(ent => {
        if (!entidadesByDoc[Number(ent.documento_id)]) entidadesByDoc[Number(ent.documento_id)] = {};
        if (ent.rol) entidadesByDoc[Number(ent.documento_id)][ent.rol] = ent;
      });
    }

    // Formatear documentos para el SII
    const documentosSII = rows.map((doc: any) => {
      const baseImponible = parseFloat(doc.importe_sin_impuestos || 0);
      const total = parseFloat(doc.importe_total || 0);
      const cuotaIVA = total - baseImponible;
      const tipoIVA = baseImponible > 0 ? ((cuotaIVA / baseImponible) * 100).toFixed(2) : '21';

      const empresa = empresasMap[doc.id_de_empresa] || {};
      const ents = entidadesByDoc[doc.id] || {};

      return {
        // Datos originales
        id: doc.id,
        numero_documento: doc.numero_documento,
        fecha_emision: doc.fecha_emision,
        tipo_documento: doc.tipo_documento,
        
        // Datos empresa
        nif_empresa: empresa.CIF || '',
        nombre_empresa: empresa.nombre_de_empresa || '',
        
        // Datos para SII (formato factura)
        num_factura: doc.numero_documento,
        fecha_factura: doc.fecha_emision,
        tipo_factura: 'F1',
        clave_regimen: '01',
        descripcion: doc.tipo_documento,
        base_imponible: baseImponible.toFixed(2),
        tipo_iva: tipoIVA,
        cuota_iva: cuotaIVA.toFixed(2),
        
        // Datos cliente/emisor
        nif_cliente: ents.cliente?.identificador_fiscal || ents.emisor?.identificador_fiscal || '',
        nombre_cliente: ents.cliente?.nombre || ents.emisor?.nombre || '',
        pais_cliente: 'ES'
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