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
    
    const documentId = body.documentId;

    if (!documentId) {
      console.log('❌ No documentId');
      return NextResponse.json({ error: 'ID de documento requerido' }, { status: 400 });
    }
    console.log('✅ documentId:', documentId);

    console.log('3️⃣ Consultando base de datos...');
    const [checkRows] = await connection.query(
      `SELECT d.id, d.tipo_documento, e.id_de_usuario
       FROM erp49.documentos d
       INNER JOIN erp49.empresas e ON d.id_de_empresa = e.id
       WHERE d.id = ? AND e.id_de_usuario = ?`,
      [documentId, session.userId]
    );
    console.log('✅ Filas encontradas:', (checkRows as any[]).length);

    if ((checkRows as any[]).length === 0) {
      console.log('❌ Documento no encontrado');
      return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 });
    }

    const documento = (checkRows as any[])[0];
    console.log('✅ Documento encontrado:', documento);
    
    const tipoActual = documento.tipo_documento || '';
    const nuevoTipo = tipoActual.replace(/\s*\(SIN CONFIRMAR\)\s*/gi, '').trim();
    console.log('✅ Tipos:', { tipoActual, nuevoTipo });

    console.log('4️⃣ Actualizando documento...');
    await connection.query(
      `UPDATE erp49.documentos 
       SET tipo_documento = ?
       WHERE id = ?`,
      [nuevoTipo, documentId]
    );
    console.log('✅ Actualización completa');

    return NextResponse.json({
      success: true,
      message: 'Documento confirmado correctamente',
      tipo_anterior: tipoActual,
      tipo_nuevo: nuevoTipo,
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