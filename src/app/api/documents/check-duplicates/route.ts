import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/services/auth-service';
import db from '@/lib/db';
import type { RowDataPacket } from 'mysql2';

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { empresaId } = await req.json();

    console.log('🔍 [check-duplicates] Verificando duplicados para empresa:', empresaId);

    // Obtener todos los documentos de la empresa
    const [docs] = await db.query<RowDataPacket[]>(
      `SELECT d.id, d.numero_documento, d.id_de_empresa, e.id_de_usuario
       FROM documentos d
       JOIN empresas e ON d.id_de_empresa = e.id
       WHERE e.id_de_usuario = ? ${empresaId ? 'AND d.id_de_empresa = ?' : ''}
       AND d.numero_documento IS NOT NULL 
       AND d.numero_documento != ''`,
      empresaId ? [session.userId, empresaId] : [session.userId]
    );

    // Detectar duplicados (agrupar por numero_documento + empresa)
    const gruposDuplicados = new Map<string, {numero: string, empresa_id: number, ids: number[]}>();
    
    docs.forEach(doc => {
      const numero = doc.numero_documento.trim().toLowerCase();
      const key = `${numero}|${doc.id_de_empresa}`;
      
      if (!gruposDuplicados.has(key)) {
        gruposDuplicados.set(key, {
          numero: doc.numero_documento,
          empresa_id: doc.id_de_empresa,
          ids: []
        });
      }
      gruposDuplicados.get(key)!.ids.push(doc.id); // ✅ Cambiado de doc.id_documento a doc.id
    });

    // Filtrar solo los grupos que tienen duplicados (2+ documentos)
    const duplicadosReales = Array.from(gruposDuplicados.values())
      .filter(grupo => grupo.ids.length > 1);

    // Obtener todos los IDs duplicados en un solo array
    const todosLosIdsDuplicados = duplicadosReales.flatMap(grupo => grupo.ids);

    console.log('📊 [check-duplicates] Duplicados encontrados:', todosLosIdsDuplicados.length);
    console.log('🔢 [check-duplicates] Grupos de duplicados:', duplicadosReales.length);

    // Eliminar incidencias de duplicados que ya no lo son
    await db.query(
      `DELETE FROM incidencias_documento 
       WHERE descripcion LIKE 'Número de factura duplicado%' 
       AND validado = 0`
    );

    // Crear nuevas incidencias para cada grupo de duplicados
    let creadas = 0;
    for (const grupo of duplicadosReales) {
      for (const docId of grupo.ids) {
        const otrosIds = grupo.ids.filter(id => id !== docId).join(', ');
        
        const [existing] = await db.query<RowDataPacket[]>(
          'SELECT id FROM incidencias_documento WHERE documento_id = ? AND descripcion LIKE ?',
          [docId, 'Número de factura duplicado%']
        );

        if (existing.length === 0) {
          await db.query(
            `INSERT INTO incidencias_documento 
             (documento_id, id_de_empresa, descripcion, incidencia, validado) 
             VALUES (?, ?, ?, 1, 0)`,
            [
              docId,
              grupo.empresa_id,
              `Número de factura duplicado: "${grupo.numero}". También presente en documentos: ${otrosIds}`
            ]
          );
          creadas++;
        }
      }
    }

    console.log('✅ [check-duplicates] Incidencias creadas:', creadas);

    // Devolver estructura que el hook espera
    return NextResponse.json({
      success: true,
      duplicates: duplicadosReales.map(grupo => ({
        numero: grupo.numero,
        empresa_id: grupo.empresa_id,
        ids: grupo.ids
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