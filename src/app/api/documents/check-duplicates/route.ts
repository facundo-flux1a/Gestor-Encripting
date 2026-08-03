import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/services/auth-service';
import db from '@/lib/db';
import { prisma } from '@/lib/prisma';
import type { RowDataPacket } from 'mysql2';
import { createNotification, getUserIdsForEmpresa } from '@/services/notification-service';

// Candado en memoria para evitar ejecuciones concurrentes en el mismo proceso (sin agotar el connection pool)
let isProcessing = false;

export async function POST(req: NextRequest) {
  if (isProcessing) {
    console.log('⏭️ [check-duplicates] Lock en memoria ocupado. Omitiendo petición concurrente.');
    return NextResponse.json({ success: true, incidenciasCreadas: 0, skipped: true });
  }

  isProcessing = true;
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
      // Remover todos los espacios del número de factura con regex para mejorar la coincidencia
      const numero = doc.numero_documento.trim().toLowerCase().replace(/\s+/g, '');
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

    // ─── 0. Obtener incidencias previas para saber si hay NUEVOS duplicados ──────
    const [existingRows] = await db.query<any[]>(
      `SELECT id, CAST(documento_id AS CHAR) as doc_id FROM incidencias_documento 
       WHERE descripcion LIKE '%factura duplicado:%' 
       AND validado = 0`
    );
    
    // Agrupar incidencias existentes por documento
    const existingByDoc = new Map<string, number[]>();
    for (const r of existingRows) {
      const docId = String(r.doc_id);
      if (!existingByDoc.has(docId)) {
        existingByDoc.set(docId, []);
      }
      existingByDoc.get(docId)!.push(r.id);
    }

    const currentDuplicateIds = new Set(todosLosIdsDuplicados.map(String));
    const allDocIdsFetched = new Set(docs.map(d => String(d.id)));

    // ─── 1. Limpiar incidencias de documentos que YA NO son duplicados ──────────
    const idsToDelete: number[] = [];
    
    for (const r of existingRows) {
      const docId = String(r.doc_id);
      // Solo borrar si el documento pertenece a la empresa actual (fue evaluado) y ya no es duplicado.
      if (allDocIdsFetched.has(docId) && !currentDuplicateIds.has(docId)) {
        idsToDelete.push(r.id);
      }
    }

    // Resolver race conditions: si un mismo doc tiene MÚLTIPLES incidencias de duplicado, dejar solo 1
    for (const [docId, incIds] of existingByDoc.entries()) {
      if (incIds.length > 1) {
        idsToDelete.push(...incIds.slice(1));
        existingByDoc.set(docId, [incIds[0]]);
      }
    }

    if (idsToDelete.length > 0) {
      await db.query(
        `DELETE FROM incidencias_documento WHERE id IN (?)`,
        [idsToDelete]
      );
    }

    // ─── 2. Actualizar o Crear incidencias ─────────────────────────────────────────
    let creadas = 0;
    const existingIds = new Set(existingByDoc.keys());
    
    if (duplicadosReales.length > 0) {
      const rowsToInsert: [number, number, string][] = [];
      const queriesToUpdate: Promise<any>[] = [];

      for (const grupo of duplicadosReales) {
        for (const docId of grupo.ids) {
          const otrosIds = grupo.ids.filter(id => id !== docId).join(', ');
          const desc = `Número de factura duplicado: "${grupo.numero}". También presente en documentos: ${otrosIds}`;
          
          const incIds = existingByDoc.get(String(docId));
          if (incIds && incIds.length > 0) {
            // Actualizar la descripción silenciosamente
            queriesToUpdate.push(
              db.query(
                `UPDATE incidencias_documento SET descripcion = ? WHERE id = ?`,
                [desc, incIds[0]]
              )
            );
          } else {
            // Es uno nuevo, lo preparamos para insertar
            rowsToInsert.push([docId, grupo.empresa_id, desc]);
          }
        }
      }

      // Ejecutar updates
      if (queriesToUpdate.length > 0) {
        await Promise.all(queriesToUpdate);
      }

      // Ejecutar inserts (ahora seguro por GET_LOCK)
      if (rowsToInsert.length > 0) {
        const placeholders = rowsToInsert.map(() => '(?, ?, ?, 1, 0)').join(', ');
        const flatValues = rowsToInsert.flatMap(r => r);

        const [result] = await db.query<any>(
          `INSERT INTO incidencias_documento 
           (documento_id, id_de_empresa, descripcion, incidencia, validado) 
           VALUES ${placeholders}`,
          flatValues
        );
        creadas = result?.affectedRows ?? rowsToInsert.length;
      }

      // ─── 3. Disparar webhooks y notificaciones en paralelo (fire-and-forget) ─────────
      const { fireWebhook } = await import('@/services/webhook-service');
      const asyncTasks = [];

      for (const grupo of duplicadosReales) {
        // Encontrar qué documentos de este grupo son NUEVOS
        const newDocIds = grupo.ids.filter(id => !existingIds.has(String(id)));

        // Solo disparar si insertamos filas y hay documentos nuevos detectados
        if (creadas > 0 && newDocIds.length > 0) {
          // 1. Webhooks (se disparan individualmente por cada documento nuevo detectado)
          for (const docId of newDocIds) {
            const otrosIds = grupo.ids.filter(id => id !== docId).join(', ');
            const desc = `Número de factura duplicado: "${grupo.numero}". También presente en documentos: ${otrosIds}`;
            
            asyncTasks.push(
              fireWebhook(grupo.empresa_id, 'documento.requiere_atencion', {
                documento_id: docId,
                motivo: desc
              })
            );
          }

          // 2. Notificación In-App (SE DISPARA UNA SOLA VEZ POR GRUPO, MAX 1 VEZ CADA 24 HS)
          asyncTasks.push(
            (async () => {
              const userIds = await getUserIdsForEmpresa(grupo.empresa_id);
              if (userIds.length > 0) {
                // EVITAR SPAM: Verificar si ya notificamos sobre esta factura en las últimas 24 horas
                const [recentNotifs] = await db.query<any[]>(
                  `SELECT id FROM notificaciones 
                   WHERE tipo = 'factura_duplicada' 
                   AND empresa_id = ? 
                   AND created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)
                   AND JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.numero')) = ?`,
                  [grupo.empresa_id, grupo.numero]
                );

                if (recentNotifs.length > 0) {
                  console.log(`⏭️ [check-duplicates] Notificación ya enviada recientemente para factura "${grupo.numero}". Omitiendo spam.`);
                  return;
                }

                const formatter = new Intl.ListFormat('es', { style: 'long', type: 'conjunction' });
                const idsTexto = formatter.format(grupo.ids.map(String));
                const nombreEmpresa = empresaMap.get(grupo.empresa_id) || `Empresa #${grupo.empresa_id}`;

                await createNotification({
                  userIds,
                  empresaId: grupo.empresa_id,
                  tipo: 'factura_duplicada',
                  titulo: 'Documentos duplicados',
                  mensaje: `(${nombreEmpresa}) Los documentos ${idsTexto} comparten el mismo número de factura "${grupo.numero}".`,
                  metadata: { ids_duplicados: grupo.ids, numero: grupo.numero }
                });
              }
            })()
          );
        }
      }
      Promise.allSettled(asyncTasks).catch(console.error);
    }

    console.log('[check-duplicates] Incidencias creadas:', creadas);

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
  } finally {
    isProcessing = false;
  }
}