import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/services/auth-service';
import db from '@/lib/db';
import { prisma } from '@/lib/prisma';
import type { RowDataPacket } from 'mysql2';

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { empresaId } = await req.json();

    console.log('🔍 [check-duplicates] Verificando duplicados para empresa:', empresaId);

    // Obtener todos los documentos de la empresa con información del proveedor
    const [docs] = await db.query<RowDataPacket[]>(
      `SELECT 
          d.id, 
          d.numero_documento, 
          d.id_de_empresa, 
          d.tipo_documento,
          e.identificador_fiscal_hash as proveedor_cif_hash,
          e.identificador_fiscal as proveedor_cif_raw,
          e.nombre_hash as proveedor_nombre_hash,
          e.nombre as proveedor_nombre_raw
       FROM documentos d
       JOIN empresas emp ON d.id_de_empresa = emp.id
       LEFT JOIN entidades_documento e ON (d.id = e.documento_id AND e.rol IN ('proveedor', 'emisor'))
       WHERE JSON_CONTAINS(emp.id_de_usuario, CAST(? AS JSON)) ${empresaId ? 'AND d.id_de_empresa = ?' : ''}
       AND d.numero_documento IS NOT NULL 
       AND d.numero_documento != ''`,
      empresaId ? [session.userId, empresaId] : [session.userId]
    );

    // Detectar duplicados (agrupar según lógica de negocio)
    const gruposDuplicados = new Map<string, {
      numero: string;
      empresa_id: number;
      ids: number[];
      docs: { id: number; tipo: string; seccion: string; empresa_nombre: string }[];
    }>();

    docs.forEach(doc => {
      const numero = doc.numero_documento.trim().toLowerCase();
      const tipo = (doc.tipo_documento || '').toLowerCase();
      let key = '';

      if (tipo.includes('recibida') || tipo.includes('recibido')) {
        const cif = doc.proveedor_cif_hash || doc.proveedor_cif_raw;
        const nombre = doc.proveedor_nombre_hash || doc.proveedor_nombre_raw;
        const proveedor = (cif || nombre || 'DESCONOCIDO').trim().toLowerCase();
        key = `${numero}|${doc.id_de_empresa}|RECIBIDA|${proveedor}`;
      } else {
        key = `${numero}|${doc.id_de_empresa}|EMITIDA`;
      }

      if (!gruposDuplicados.has(key)) {
        gruposDuplicados.set(key, {
          numero: doc.numero_documento,
          empresa_id: doc.id_de_empresa,
          ids: [],
          docs: []
        });
      }

      const grupo = gruposDuplicados.get(key)!;
      grupo.ids.push(doc.id);

      let seccion = 'Emitidas';
      if (tipo.includes('recibida') || tipo.includes('recibido') || tipo.includes('gasto')) {
        seccion = 'Recibidas';
      } else if (tipo.includes('abono') || tipo.includes('rectificativa')) {
        seccion = 'Abonos';
      }

      grupo.docs.push({
        id: doc.id,
        tipo: doc.tipo_documento || 'Desconocido',
        seccion,
        empresa_nombre: `Empresa #${doc.id_de_empresa}`
      });
    });

    const duplicadosReales = Array.from(gruposDuplicados.values())
      .filter(grupo => grupo.ids.length > 1);

    // ─── Obtener nombres de empresas via Prisma (desencripta automáticamente) ──────
    const empresaIdsInvolucradas = [...new Set(duplicadosReales.map(g => g.empresa_id))];
    let empresaMap = new Map<number, string | null>();

    if (empresaIdsInvolucradas.length > 0) {
      const empresasData = await prisma.empresas.findMany({
        where: { id: { in: empresaIdsInvolucradas } },
        select: { id: true, nombre_de_empresa: true }
      });
      empresaMap = new Map(empresasData.map(e => [Number(e.id), e.nombre_de_empresa || null]));
    }

    duplicadosReales.forEach(grupo => {
      const nombreEmpresa = empresaMap.get(grupo.empresa_id);
      if (nombreEmpresa) {
        grupo.docs.forEach(doc => {
          if (doc.empresa_nombre.startsWith('Empresa #')) {
            doc.empresa_nombre = nombreEmpresa;
          }
        });
      }
    });

    const todosLosIdsDuplicados = duplicadosReales.flatMap(grupo => grupo.ids);

    console.log('📊 [check-duplicates] Duplicados encontrados:', todosLosIdsDuplicados.length);
    console.log('🔢 [check-duplicates] Grupos de duplicados:', duplicadosReales.length);

    // ─── 1. Limpiar incidencias viejas de duplicados (1 sola query) ──────────────
    await db.query(
      `DELETE FROM incidencias_documento 
       WHERE descripcion LIKE 'Número de factura duplicado%' 
       AND validado = 0`
    );

    // ─── 2. Crear incidencias en BULK (INSERT IGNORE) ─────────────────────────────
    let creadas = 0;
    if (duplicadosReales.length > 0) {
      const rowsToInsert: [number, number, string][] = [];

      for (const grupo of duplicadosReales) {
        for (const docId of grupo.ids) {
          const otrosIds = grupo.ids.filter(id => id !== docId).join(', ');
          const desc = `Número de factura duplicado: "${grupo.numero}". También presente en documentos: ${otrosIds}`;
          rowsToInsert.push([docId, grupo.empresa_id, desc]);
        }
      }

      if (rowsToInsert.length > 0) {
        const placeholders = rowsToInsert.map(() => '(?, ?, ?, 1, 0)').join(', ');
        const flatValues = rowsToInsert.flatMap(r => r);

        const [result] = await db.query<any>(
          `INSERT IGNORE INTO incidencias_documento 
           (documento_id, id_de_empresa, descripcion, incidencia, validado) 
           VALUES ${placeholders}`,
          flatValues
        );
        creadas = result?.affectedRows ?? rowsToInsert.length;
      }

      // ─── 3. Disparar webhooks en paralelo (fire-and-forget) ───────────────────
      const { fireWebhook } = await import('@/services/webhook-service');
      const webhookPromises = duplicadosReales.flatMap(grupo =>
        grupo.ids.map(docId => {
          const otrosIds = grupo.ids.filter(id => id !== docId).join(', ');
          const desc = `Número de factura duplicado: "${grupo.numero}". También presente en documentos: ${otrosIds}`;
          return fireWebhook(grupo.empresa_id, 'documento.requiere_atencion', {
            documento_id: docId,
            motivo: desc
          });
        })
      );
      Promise.allSettled(webhookPromises).catch(console.error);
    }

    console.log('✅ [check-duplicates] Incidencias creadas:', creadas);

    return NextResponse.json({
      success: true,
      duplicates: duplicadosReales.map(grupo => ({
        numero: grupo.numero,
        empresa_id: grupo.empresa_id,
        ids: grupo.ids,
        docs: grupo.docs
      })),
      totalDuplicados: todosLosIdsDuplicados.length,
      incidenciasCreadas: creadas
    });

  } catch (error) {
    console.error('❌ [check-duplicates] Error:', error);
    return NextResponse.json(
      { error: 'Error al verificar duplicados' },
      { status: 500 }
    );
  }
}