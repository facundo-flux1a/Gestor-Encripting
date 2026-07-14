import { NextResponse } from 'next/server';
import { dbName } from '@/lib/db';
import connection from '@/lib/db';
import { getSession } from '@/services/auth-service';

export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session || !session.userId) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const empresaId = searchParams.get('empresaId');

    if (!empresaId) {
      return NextResponse.json({ error: 'Falta empresaId' }, { status: 400 });
    }

    const conn = await connection.getConnection();

    try {
      // 1. Obtener los lotes masivos (tienen parent_upload_id)
      const [batchRows] = await conn.query<any[]>(
        `
        SELECT 
          parent_upload_id,
          MAX(documento_nombre) as batch_name,
          COUNT(*) as total_docs,
          SUM(CASE WHEN status IN ('Completado', 'completed') THEN 1 ELSE 0 END) as completed_docs,
          SUM(CASE WHEN status IN ('Fallido', 'failed', 'error', 'permanent-fail') THEN 1 ELSE 0 END) as failed_docs,
          SUM(CASE WHEN status IN ('procesando', 'analyzing', 'waiting', 'Reintentando') THEN 1 ELSE 0 END) as active_docs,
          MAX(is_new) as is_new_batch,
          MAX(updated_at) as last_updated
        FROM ${dbName}.actividad
        WHERE id_de_empresa = ? 
          AND parent_upload_id IS NOT NULL
        GROUP BY parent_upload_id
        HAVING active_docs > 0 OR is_new_batch = 1
        ORDER BY last_updated DESC
        LIMIT 20
        `,
        [empresaId]
      );

      // 2. Obtener los documentos individuales (NO tienen parent_upload_id, o son el padre mismo)
      // Nota: El padre a veces se crea primero (para paginar). Lo excluimos si tiene hijos, 
      // o simplemente mostramos los individuales que están activos.
      const [individualRows] = await conn.query<any[]>(
        `
        SELECT 
          upload_id,
          documento_nombre as file_name,
          status,
          progress,
          step,
          mensaje,
          is_new,
          updated_at as last_updated
        FROM ${dbName}.actividad
        WHERE id_de_empresa = ? 
          AND (parent_upload_id IS NULL OR parent_upload_id = '')
          AND (status IN ('procesando', 'analyzing', 'waiting', 'Reintentando') OR is_new = 1)
          -- Excluir uploads que sean "padres" de un lote (donde existan hijos con ese parent_upload_id)
          AND NOT EXISTS (
            SELECT 1 FROM ${dbName}.actividad a2 
            WHERE a2.parent_upload_id = ${dbName}.actividad.upload_id
          )
        ORDER BY updated_at DESC
        LIMIT 20
        `,
        [empresaId]
      );

      conn.release();

      let etaSeconds = 0;
      if (batchRows.length > 0 || individualRows.length > 0) {
        const pendingBatchDocs = batchRows.reduce((acc, r) => acc + Number(r.active_docs || 0), 0);
        const pendingIndividualDocs = individualRows.filter(r => ['procesando', 'analyzing', 'waiting', 'Reintentando'].includes(r.status)).length;
        etaSeconds = (pendingBatchDocs + pendingIndividualDocs) * 25;
      }

      return NextResponse.json({
        etaSeconds,
        batches: batchRows.map(row => ({
          id: row.parent_upload_id,
          name: row.batch_name ? row.batch_name.replace(/_doc_\d+$/, '') : 'Lote de documentos',
          totalDocs: Number(row.total_docs),
          completedDocs: Number(row.completed_docs),
          failedDocs: Number(row.failed_docs),
          activeDocs: Number(row.active_docs),
          isNew: row.is_new_batch === 1,
          lastUpdated: row.last_updated
        })),
        individuals: individualRows.map(row => ({
          id: row.upload_id,
          fileName: row.file_name || 'Documento sin nombre',
          status: row.status,
          progress: row.progress || 0,
          step: row.step || '',
          message: row.mensaje || '',
          isNew: row.is_new === 1,
          lastUpdated: row.last_updated
        }))
      });
    } catch (err) {
      conn.release();
      throw err;
    }
  } catch (error: any) {
    console.error('❌ [API ActiveBatch] Error:', error);
    return NextResponse.json(
      { error: 'Error al obtener subidas activas', details: error.message },
      { status: 500 }
    );
  }
}
