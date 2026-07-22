import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/services/auth-service';
import db from '@/lib/db';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import { pickCanonicalDuplicate } from '@/services/duplicates/canonical';

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { empresaId } = await req.json();

    console.log('🔍 [auto-clean-duplicates] Iniciando limpieza automática...');
    console.log('👤 Usuario:', session.userId, 'Empresa:', empresaId || 'todas');

    // PASO 1: Encontrar candidatos (con métricas para canónico)
    const [docs] = await db.query<RowDataPacket[]>(
      `SELECT 
        d.id, 
        d.numero_documento, 
        d.id_de_empresa,
        d.fecha_creacion,
        d.tipo_documento,
        d.importe_total,
        (SELECT COUNT(*) FROM lineas_documento l WHERE l.documento_id = d.id) AS lineas,
        (SELECT COUNT(*) FROM impuestos_documento i WHERE i.documento_id = d.id) AS impuestos
       FROM documentos d
       JOIN empresas e ON d.id_de_empresa = e.id
       WHERE JSON_CONTAINS(e.id_de_usuario, CAST(? AS JSON)) 
         ${empresaId ? 'AND d.id_de_empresa = ?' : ''}
         AND d.numero_documento IS NOT NULL 
         AND d.numero_documento != ''
         AND TRIM(d.numero_documento) != ''
         AND (
           LOWER(d.tipo_documento) LIKE '%factura%'
           OR LOWER(d.tipo_documento) LIKE '%abono%'
         )
         AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%'
       ORDER BY d.numero_documento, d.fecha_creacion ASC`,
      empresaId ? [session.userId, empresaId] : [session.userId]
    );

    // PASO 2: Agrupar por numero|empresa
    const gruposDuplicados = new Map<string, {
      numero: string;
      empresa_id: number;
      documentos: Array<{
        id: number;
        fecha_creacion: string;
        tipo_documento: string | null;
        importe_total: number | string | null;
        lineas: number;
        impuestos: number;
      }>;
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
        id: Number(doc.id),
        fecha_creacion: doc.fecha_creacion,
        tipo_documento: doc.tipo_documento,
        importe_total: doc.importe_total,
        lineas: Number(doc.lineas) || 0,
        impuestos: Number(doc.impuestos) || 0,
      });
    });

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

    // PASO 3: Canónico (signo abono → completitud → más antiguo)
    for (const grupo of duplicadosReales) {
      console.log(`\n📄 Procesando: "${grupo.numero}" (${grupo.documentos.length} docs)`);

      const mantener = pickCanonicalDuplicate(grupo.documentos);
      const eliminar = grupo.documentos.filter(d => d.id !== mantener.id);

      console.log(`   ✅ MANTENER: ID ${mantener.id} (canónico)`);
      console.log(`   ❌ ELIMINAR: ${eliminar.map(d => d.id).join(', ')}`);

      for (const doc of eliminar) {
        try {
          console.log(`      🗑️  Eliminando documento ID ${doc.id}...`);

          await db.query('DELETE FROM impuestos_documento WHERE documento_id = ?', [doc.id]);
          await db.query('DELETE FROM entidades_documento WHERE documento_id = ?', [doc.id]);
          await db.query('DELETE FROM lineas_documento WHERE documento_id = ?', [doc.id]);
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
