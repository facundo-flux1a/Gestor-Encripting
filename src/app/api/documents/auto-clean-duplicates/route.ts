import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/services/auth-service';
import db from '@/lib/db';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { empresaId } = await req.json();

    console.log('🔍 [auto-clean-duplicates] Iniciando limpieza automática...');
    console.log('👤 Usuario:', session.userId, 'Empresa:', empresaId || 'todas');

    // ✅ PASO 1: Encontrar duplicados
    const [docs] = await db.query<RowDataPacket[]>(
      `SELECT 
        d.id, 
        d.numero_documento, 
        d.id_de_empresa,
        d.fecha_creacion,
        d.tipo_documento
       FROM documentos d
       JOIN empresas e ON d.id_de_empresa = e.id
       WHERE e.id_de_usuario = ? 
         ${empresaId ? 'AND d.id_de_empresa = ?' : ''}
         AND d.numero_documento IS NOT NULL 
         AND d.numero_documento != ''
         AND TRIM(d.numero_documento) != ''
         AND (
           LOWER(d.tipo_documento) LIKE '%factura%'
           OR LOWER(d.tipo_documento) LIKE '%abono%'
         )
         AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%'
       ORDER BY d.numero_documento, d.fecha_creacion DESC`,
      empresaId ? [session.userId, empresaId] : [session.userId]
    );

    // ✅ PASO 2: Agrupar duplicados
    const gruposDuplicados = new Map<string, {
      numero: string;
      empresa_id: number;
      documentos: Array<{id: number, fecha: string}>;
    }>();
    
    docs.forEach(doc => {
      const numero = doc.numero_documento.trim().toLowerCase();
      const key = `${numero}|${doc.id_de_empresa}`;
      
      if (!gruposDuplicados.has(key)) {
        gruposDuplicados.set(key, {
          numero: doc.numero_documento,
          empresa_id: doc.id_de_empresa,
          documentos: []
        });
      }
      
      gruposDuplicados.get(key)!.documentos.push({
        id: doc.id,
        fecha: doc.fecha_creacion
      });
    });

    // Filtrar solo grupos con duplicados (2+)
    const duplicadosReales = Array.from(gruposDuplicados.values())
      .filter(grupo => grupo.documentos.length > 1);

    console.log('📊 [auto-clean-duplicates] Grupos de duplicados:', duplicadosReales.length);

    if (duplicadosReales.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No se encontraron duplicados',
        deleted: 0,
        kept: 0,
      });
    }

    let totalDeleted = 0;
    let totalKept = 0;

    // ✅ PASO 3: Eliminar duplicados (mantener el más reciente)
    for (const grupo of duplicadosReales) {
      console.log(`\n📄 Procesando: "${grupo.numero}"`);
      console.log(`   Total: ${grupo.documentos.length} documentos`);

      // Ya están ordenados DESC, el primero es el más reciente
      const [mantener, ...eliminar] = grupo.documentos;

      console.log(`   ✅ MANTENER: ID ${mantener.id}`);
      console.log(`   ❌ ELIMINAR: ${eliminar.length} documento(s)`);

      for (const doc of eliminar) {
        try {
          console.log(`      🗑️  Eliminando documento ID ${doc.id}...`);

          // ⬅️ FIX FINAL: SIN lineas_documento (causaba el error)
          await db.query('DELETE FROM impuestos_documento WHERE documento_id = ?', [doc.id]);
          await db.query('DELETE FROM entidades_documento WHERE documento_id = ?', [doc.id]);
          await db.query('DELETE FROM archivos_documento WHERE documento_id = ?', [doc.id]);
          await db.query('DELETE FROM incidencias_documento WHERE documento_id = ?', [doc.id]);
          await db.query('DELETE FROM documentos WHERE id = ?', [doc.id]);

          totalDeleted++;
          console.log(`      ✅ Documento ${doc.id} eliminado`);

        } catch (error) {
          console.error(`      ❌ Error eliminando ${doc.id}:`, error);
        }
      }

      totalKept++;
    }

    // ✅ PASO 4: Limpiar incidencias obsoletas de duplicados
    console.log('\n🧹 Limpiando incidencias obsoletas...');
    
    const [cleanResult] = await db.query<ResultSetHeader>(
      `DELETE FROM incidencias_documento 
       WHERE descripcion LIKE 'Número de factura duplicado%' 
       AND validado = 0`
    );
    
    console.log(`🧹 Incidencias obsoletas eliminadas: ${cleanResult.affectedRows || 0}`);

    console.log('\n✅ [auto-clean-duplicates] Limpieza completada');
    console.log(`   📊 Grupos procesados: ${duplicadosReales.length}`);
    console.log(`   ✅ Documentos mantenidos: ${totalKept}`);
    console.log(`   ❌ Documentos eliminados: ${totalDeleted}`);

    return NextResponse.json({
      success: true,
      message: `Se eliminaron ${totalDeleted} documento(s) duplicado(s)`,
      deleted: totalDeleted,
      kept: totalKept,
      groups: duplicadosReales.length,
    });

  } catch (error) {
    console.error('❌ [auto-clean-duplicates] Error:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Error al limpiar duplicados',
        details: error instanceof Error ? error.message : 'Error desconocido'
      },
      { status: 500 }
    );
  }
}