import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getCurrentUser } from '@/services/user-service';
import type { OkPacket, RowDataPacket } from 'mysql2';

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    let { nombre, identificador_fiscal, direccion, telefono, email } = body;
    const currentFiscalId = decodeURIComponent(id);

    console.log('📝 [PUT /api/proveedores] Datos recibidos:', {
      currentFiscalId,
      newFiscalId: identificador_fiscal,
      nombre,
      email,
      userId: user.id
    });

    // ✅ Normalizar email vacío
    if (!email || email.trim() === '') {
      // Si está vacío, obtener el email actual de la BD para no cambiarlo
      const [currentProvider] = await db.query<RowDataPacket[]>(
        `SELECT email 
         FROM entidades_documento 
         WHERE identificador_fiscal = ? 
           AND rol IN ('proveedor', 'emisor') 
         LIMIT 1`,
        [currentFiscalId]
      );
      
      email = currentProvider[0]?.email || null;
      console.log('📧 Email vacío detectado, manteniendo:', email);
    } else if (email.trim().toLowerCase() === 'n/a') {
      email = 'N/A';
      console.log('📧 Email normalizado a N/A');
    }

    // Verificar que el proveedor origen existe
    const [providerCheck] = await db.query<RowDataPacket[]>(
      `SELECT DISTINCT ed.id 
       FROM entidades_documento ed
       JOIN documentos d ON ed.documento_id = d.id
       JOIN empresas e ON d.id_de_empresa = e.id
       WHERE ed.identificador_fiscal = ? 
         AND ed.rol IN ('proveedor', 'emisor')
         AND e.id_de_usuario = ?
       LIMIT 1`,
      [currentFiscalId, user.id]
    );

    if (providerCheck.length === 0) {
      console.error('❌ Proveedor origen no encontrado:', currentFiscalId);
      return NextResponse.json(
        { error: 'Proveedor no encontrado' },
        { status: 404 }
      );
    }

    // Si el CIF NO cambió, actualización simple
    if (identificador_fiscal === currentFiscalId) {
      console.log('🔄 Actualización simple (sin cambio de CIF)');
      
      const [result] = await db.query<OkPacket>(
        `UPDATE entidades_documento ed
         JOIN documentos d ON ed.documento_id = d.id
         JOIN empresas e ON d.id_de_empresa = e.id
         SET ed.nombre = ?, 
             ed.direccion = ?, 
             ed.telefono = ?, 
             ed.email = ?
         WHERE ed.identificador_fiscal = ? 
           AND ed.rol IN ('proveedor', 'emisor')
           AND e.id_de_usuario = ?`,
        [nombre, direccion, telefono, email, currentFiscalId, user.id]
      );

      console.log(`✅ Proveedor actualizado: ${result.affectedRows} registros`);

      return NextResponse.json({ 
        success: true,
        merged: false,
        affectedRows: result.affectedRows
      });
    }

    // El CIF CAMBIÓ → Hacer MERGE (consolidar proveedores)
    console.log(`🔀 MERGE detectado: ${currentFiscalId} → ${identificador_fiscal}`);

    // Verificar si el CIF destino ya existe
    const [existingProvider] = await db.query<RowDataPacket[]>(
      `SELECT DISTINCT ed.id 
       FROM entidades_documento ed
       JOIN documentos d ON ed.documento_id = d.id
       JOIN empresas e ON d.id_de_empresa = e.id
       WHERE ed.identificador_fiscal = ? 
         AND ed.rol IN ('proveedor', 'emisor')
         AND e.id_de_usuario = ?
       LIMIT 1`,
      [identificador_fiscal, user.id]
    );

    if (existingProvider.length > 0) {
      console.warn('⚠️ CIF destino ya existe, consolidando proveedores...');
    } else {
      console.log('✨ CIF destino no existe, cambiando CIF limpiamente');
    }

    // Actualizar TODOS los registros del CIF antiguo al nuevo
    const [mergeResult] = await db.query<OkPacket>(
      `UPDATE entidades_documento ed
       JOIN documentos d ON ed.documento_id = d.id
       JOIN empresas e ON d.id_de_empresa = e.id
       SET ed.nombre = ?, 
           ed.identificador_fiscal = ?,
           ed.direccion = ?, 
           ed.telefono = ?, 
           ed.email = ?
       WHERE ed.identificador_fiscal = ? 
         AND ed.rol IN ('proveedor', 'emisor')
         AND e.id_de_usuario = ?`,
      [
        nombre, 
        identificador_fiscal, 
        direccion, 
        telefono, 
        email, 
        currentFiscalId, 
        user.id
      ]
    );

    const wasMerge = existingProvider.length > 0;

    console.log(`✅ ${wasMerge ? 'MERGE' : 'Cambio de CIF'} completado: ${mergeResult.affectedRows} registros actualizados`);

    return NextResponse.json({ 
      success: true,
      merged: wasMerge,
      affectedRows: mergeResult.affectedRows,
      message: wasMerge 
        ? `Proveedores consolidados exitosamente. ${mergeResult.affectedRows} documentos fusionados.`
        : `CIF actualizado. ${mergeResult.affectedRows} registros modificados.`
    });

  } catch (error) {
    console.error('❌ Error actualizando proveedor:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
