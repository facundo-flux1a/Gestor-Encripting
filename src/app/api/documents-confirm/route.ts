// app/api/documents-confirm/route.ts
import { NextResponse } from 'next/server';
import connection from '@/lib/db';
import { getSession } from '@/services/auth-service';

export async function PATCH(request: Request) {
  console.log('🔵 [API /documents-confirm] Request recibido');

  try {
    console.log('1️⃣ Obteniendo sesión...');
    const session = await getSession();

    if (!session) {
      console.log('❌ No hay sesión');
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }
    console.log('✅ Sesión OK, userId:', session.userId);

    console.log('2️⃣ Parseando body...');
    const body = await request.json();
    console.log('✅ Body:', body);

    // ✅ CAMBIO: Ahora aceptamos documentId O documentIds (array)
    const documentId = body.documentId;
    const documentIds = body.documentIds;

    // Validar que venga al menos uno
    if (!documentId && (!documentIds || documentIds.length === 0)) {
      console.log('❌ No documentId ni documentIds');
      return NextResponse.json({ error: 'ID(s) de documento requerido(s)' }, { status: 400 });
    }

    // ✅ NUEVO: Normalizar a array
    const idsToConfirm = documentIds && documentIds.length > 0
      ? documentIds
      : [documentId];

    console.log('✅ IDs a confirmar:', idsToConfirm);

    // ✅ NUEVO: Verificar que todos los documentos pertenecen al usuario
    const placeholders = idsToConfirm.map(() => '?').join(',');

    console.log('3️⃣ Consultando base de datos...');
    const [checkRows] = await connection.query(
      `SELECT d.id, d.tipo_documento, e.id_de_usuario, d.trimestre_cerrado, d.año_trimestre, d.num_trimestre
       FROM erp49.documentos d
       INNER JOIN erp49.empresas e ON d.id_de_empresa = e.id
       WHERE d.id IN (${placeholders}) AND e.id_de_usuario = ?`,
      [...idsToConfirm, session.userId]
    );
    console.log('✅ Filas encontradas:', (checkRows as any[]).length);

    if ((checkRows as any[]).length === 0) {
      console.log('❌ Documentos no encontrados');
      return NextResponse.json({ error: 'Documentos no encontrados' }, { status: 404 });
    }

    // ✅ NUEVO: Verificar trimestres cerrados
    const lockedDocs = (checkRows as any[]).filter((d: any) => d.trimestre_cerrado === 1);
    if (lockedDocs.length > 0) {
      const first = lockedDocs[0];
      console.log('❌ Intento de confirmar documentos en trimestre cerrado');
      return NextResponse.json({
        error: `No se pueden confirmar los documentos porque ${lockedDocs.length} de ellos pertenecen a trimestres cerrados (ej: ${first.año_trimestre}Q${first.num_trimestre}).`
      }, { status: 400 });
    }

    // ✅ NUEVO: Procesar todos los documentos
    const resultados = (checkRows as any[]).map((doc: any) => {
      const tipoActual = doc.tipo_documento || '';
      const nuevoTipo = tipoActual.replace(/\s*\(SIN CONFIRMAR\)\s*/gi, '').trim();

      return {
        id: doc.id,
        tipo_anterior: tipoActual,
        tipo_nuevo: nuevoTipo
      };
    });

    console.log('✅ Resultados:', resultados);

    // ✅ NUEVO: Actualizar todos de una vez
    console.log('4️⃣ Actualizando documentos...');

    // Construir CASE para UPDATE múltiple
    const caseStatements = resultados.map((r: any) =>
      `WHEN id = ${r.id} THEN '${r.tipo_nuevo.replace(/'/g, "''")}'`
    ).join(' ');

    await connection.query(
      `UPDATE erp49.documentos 
       SET tipo_documento = CASE ${caseStatements} END
       WHERE id IN (${placeholders})`,
      idsToConfirm
    );

    console.log('✅ Actualización completa');

    return NextResponse.json({
      success: true,
      message: `${resultados.length} documento(s) confirmado(s) correctamente`,
      confirmados: resultados.length,
      detalles: resultados,
    });

  } catch (error: any) {
    console.error('❌ ERROR CRÍTICO en /documents-confirm:', error);
    console.error('Stack:', error.stack);
    return NextResponse.json(
      { error: 'Error al confirmar el documento', details: error.message },
      { status: 500 }
    );
  }
}