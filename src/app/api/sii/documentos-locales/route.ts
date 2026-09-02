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
    const empresaId = searchParams.get('empresa_id');
    const año = searchParams.get('año') ? parseInt(searchParams.get('año')!) : null;
    const trimestre = searchParams.get('trimestre') ? parseInt(searchParams.get('trimestre')!) : null;

    if (!empresaId) {
      return NextResponse.json({ error: 'Se requiere empresa_id' }, { status: 400 });
    }

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
        d.trimestre_cerrado as doc_trimestre_cerrado,
        d.enviado_sii,
        d.año_trimestre,
        d.num_trimestre,
        t.cerrado as trimestre_cerrado_tabla
      FROM documentos d
      LEFT JOIN trimestres t ON (t.id_de_empresa = d.id_de_empresa AND t.año = d.año_trimestre AND t.num_trimestre = d.num_trimestre)
      WHERE d.id_de_empresa IN (${empresaId.split(',').map(() => '?').join(',')})
    `;

    const params: any[] = empresaId.split(',').map(id => parseInt(id.trim()));

    if (año && año > 0) {
      query += ' AND d.año_trimestre = ?';
      params.push(año);
    }

    if (trimestre && trimestre > 0) {
      query += ' AND d.num_trimestre = ?';
      params.push(trimestre);
    }

    query += ' ORDER BY d.fecha_emision DESC LIMIT 200';

    const [rows]: any = await pool.query(query, params);

    const docIds = Array.from(new Set((rows as any[]).map(r => r.id)));

    let entidadesByDoc: Record<number, Record<string, any>> = {};
    let impuestosByDoc: Record<number, { tipo_iva: number; cuota_iva: number }> = {};

    if (docIds.length > 0) {
      const [entidadesPrisma, impuestosPrisma] = await Promise.all([
        prisma.entidades_documento.findMany({
          where: { documento_id: { in: docIds as number[] }, rol: { in: ['emisor', 'cliente', 'proveedor', 'receptor'] } },
          select: { documento_id: true, rol: true, nombre: true, identificador_fiscal: true }
        }),
        prisma.impuestos_documento.findMany({
          where: { documento_id: { in: docIds as number[] }, tipo_impuesto: 'IVA' },
          select: { documento_id: true, porcentaje: true, cuota: true }
        })
      ]);

      entidadesPrisma.forEach((ent: any) => {
        const docId = Number(ent.documento_id);
        if (!entidadesByDoc[docId]) entidadesByDoc[docId] = {};
        if (ent.rol) entidadesByDoc[docId][ent.rol] = ent;
      });

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

    const documentosFormatted = (rows as any[]).map((doc: any) => {
      const docId = Number(doc.id);
      const baseImponible = parseFloat(doc.importe_sin_impuestos || 0);
      const total = parseFloat(doc.importe_total || 0);
      const ivaReal = impuestosByDoc[docId];
      const cuotaIVA = ivaReal ? ivaReal.cuota_iva : (total - baseImponible);
      const tipoIVA = ivaReal ? ivaReal.tipo_iva : (baseImponible > 0 ? parseFloat(((cuotaIVA / baseImponible) * 100).toFixed(2)) : 21);

      const ents = entidadesByDoc[docId] || {};
      const contraparte = ents.proveedor || ents.cliente || ents.emisor || ents.receptor;

      const isCerrado = doc.doc_trimestre_cerrado === 1 || doc.doc_trimestre_cerrado === true || doc.trimestre_cerrado_tabla === 1 || doc.trimestre_cerrado_tabla === true;
      const isEnviado = doc.enviado_sii === 1 || doc.enviado_sii === true;

      return {
        id: docId,
        numero_documento: doc.numero_documento || 'S/N',
        fecha_emision: doc.fecha_emision ? new Date(doc.fecha_emision).toISOString().split('T')[0] : '-',
        tipo_documento: doc.tipo_documento || 'Factura',
        importe_total: total,
        base_imponible: baseImponible,
        tipo_iva: tipoIVA,
        cuota_iva: cuotaIVA,
        año_trimestre: doc.año_trimestre || (doc.fecha_emision ? new Date(doc.fecha_emision).getFullYear() : new Date().getFullYear()),
        num_trimestre: doc.num_trimestre || (doc.fecha_emision ? Math.ceil((new Date(doc.fecha_emision).getMonth() + 1) / 3) : 1),
        estado_trimestre: isCerrado ? 'Cerrado' : 'Abierto',
        enviado_sii: isEnviado,
        contraparte_nif: contraparte?.identificador_fiscal || '-',
        contraparte_nombre: contraparte?.nombre || '-'
      };
    });

    return NextResponse.json({
      success: true,
      total: documentosFormatted.length,
      documentos: documentosFormatted
    });

  } catch (error) {
    console.error('❌ Error en /api/sii/documentos-locales:', error);
    return NextResponse.json(
      { error: 'Error al consultar documentos del gestor', details: error instanceof Error ? error.message : 'Error desconocido' },
      { status: 500 }
    );
  }
}
