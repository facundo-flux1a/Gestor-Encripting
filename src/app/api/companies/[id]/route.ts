import { NextRequest, NextResponse } from 'next/server';
import { deleteCompany } from '@/services/document-service';
import { getCurrentUser } from '@/services/user-service';
import { validateCompanyDocuments } from '@/services/incidents-service';
import db from '@/lib/db';
import type { RowDataPacket } from 'mysql2';
import { hashField } from '@/lib/encryption';
export const dynamic = 'force-dynamic';


// GET - Contar documentos de una empresa
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    console.log('📊 [API-COUNT-DOCS] Iniciando conteo...');

    const user = await getCurrentUser();

    if (!user) {
      console.warn('⚠️ [API-COUNT-DOCS] No hay usuario autenticado');
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const params = await context.params;
    const empresaId = parseInt(params.id, 10);

    if (isNaN(empresaId)) {
      return NextResponse.json({ error: 'ID de empresa inválido' }, { status: 400 });
    }

    console.log('🔍 [API-COUNT-DOCS] Contando documentos de empresa:', empresaId);

    // Verificar que la empresa pertenece al usuario
    const [empresaCheck] = await db.query<RowDataPacket[]>(
      'SELECT id FROM empresas WHERE id = ? AND JSON_CONTAINS(id_de_usuario, CAST(? AS JSON))',
      [empresaId, user.id]
    );

    if (empresaCheck.length === 0) {
      console.error('❌ [API-COUNT-DOCS] Empresa no encontrada');
      return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 });
    }

    // Contar documentos
    const [countResult] = await db.query<RowDataPacket[]>(
      'SELECT COUNT(*) as count FROM documentos WHERE id_de_empresa = ?',
      [empresaId]
    );

    const count = countResult[0]?.count || 0;

    console.log('✅ [API-COUNT-DOCS] Documentos encontrados:', count);

    return NextResponse.json({ count });

  } catch (error) {
    console.error('❌ [API-COUNT-DOCS] Error:', error);
    return NextResponse.json(
      { error: 'Error al contar documentos' },
      { status: 500 }
    );
  }
}

// PATCH - Actualizar empresa (DINÁMICO)
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    console.log('✏️ [API-UPDATE-COMPANY] Iniciando actualización...');

    const user = await getCurrentUser();

    if (!user) {
      console.warn('⚠️ [API-UPDATE-COMPANY] No hay usuario autenticado');
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const params = await context.params;
    const empresaId = parseInt(params.id, 10);

    if (isNaN(empresaId)) {
      return NextResponse.json({ error: 'ID de empresa inválido' }, { status: 400 });
    }

    const body = await request.json();
    console.log('📝 [API-UPDATE-COMPANY] Datos recibidos:', body);

    // ✅ VALIDACIÓN DINÁMICA: Solo valida campos que vienen en el body
    if ('name' in body) {
      if (!body.name?.trim()) {
        return NextResponse.json(
          { error: 'El nombre de la empresa no puede estar vacío' },
          { status: 400 }
        );
      }
    }

    console.log('🔍 [API-UPDATE-COMPANY] Verificando propiedad de empresa:', empresaId);

    // Verificar que la empresa pertenece al usuario
    const [empresaCheck] = await db.query<RowDataPacket[]>(
      'SELECT id FROM empresas WHERE id = ? AND JSON_CONTAINS(id_de_usuario, CAST(? AS JSON))',
      [empresaId, user.id]
    );

    if (empresaCheck.length === 0) {
      console.error('❌ [API-UPDATE-COMPANY] Empresa no encontrada o sin permisos');
      return NextResponse.json(
        { error: 'Empresa no encontrada' },
        { status: 404 }
      );
    }

    // Verificar si el CIF ya existe en otra empresa (solo si viene en el body)
    if ('cif' in body && body.cif !== null && body.cif !== undefined && body.cif.trim()) {
      const cifHash = hashField(body.cif.trim());
      const [cifCheck] = await db.query<RowDataPacket[]>(
        'SELECT id FROM empresas WHERE (cif_hash = ? OR CIF = ?) AND JSON_CONTAINS(id_de_usuario, CAST(? AS JSON)) AND id != ?',
        [cifHash, body.cif.trim(), user.id, empresaId]
      );

      if (cifCheck.length > 0) {
        return NextResponse.json(
          { error: 'Ya existe una empresa con ese CIF' },
          { status: 409 }
        );
      }
    }

    // Verificar email único (solo si viene en el body)
    if ('mailDeCarga' in body && body.mailDeCarga !== null && body.mailDeCarga !== undefined && body.mailDeCarga.trim()) {
      const mailHash = hashField(body.mailDeCarga.trim());
      // ✅ Comparar contra hash (post-migración) con fallback a texto plano (pre-migración)
      const [emailCheck] = await db.query<RowDataPacket[]>(
        'SELECT id FROM empresas WHERE (mail_de_carga_hash = ? OR mail_de_carga = ?) AND id != ?',
        [mailHash, body.mailDeCarga.trim(), empresaId]
      );

      if (emailCheck.length > 0) {
        return NextResponse.json(
          { error: 'Ya existe una empresa con ese mail de carga' },
          { status: 409 }
        );
      }
    }

    // ✅ CONSTRUCCIÓN DINÁMICA: Solo actualiza campos presentes en el body
    const updateData: any = {};

    if ('name' in body) updateData.nombre_de_empresa = body.name.trim();
    if ('nombreFiscal' in body) updateData.nombre_fiscal = body.nombreFiscal?.trim() || null;
    if ('cif' in body) updateData.CIF = body.cif?.trim() || null;
    if ('mailDeCarga' in body) {
      const mailVal = body.mailDeCarga?.trim() || null;
      updateData.mail_de_carga = mailVal;
      // ✅ Recalcular hash para mantener el blind index sincronizado
      updateData.mail_de_carga_hash = mailVal ? hashField(mailVal) : null;
    }
    if ('recargo' in body) {
      const rawRecargo = body.recargo;
      updateData.recargo = (rawRecargo === true || rawRecargo === 1 || rawRecargo === 'true');
      console.log(`🔌 [API-UPDATE] Recargo parsing: raw=${rawRecargo} (${typeof rawRecargo}) -> db=${updateData.recargo}`);
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No hay campos para actualizar' },
        { status: 400 }
      );
    }

    console.log('💾 [API-UPDATE-COMPANY] Actualizando campos:', updateData);

    const { prisma } = await import('@/lib/prisma');

    // Actualizar empresa usando Prisma para que aplique la encriptación automáticamente
    const updatedRecord = await prisma.empresas.update({
      where: { id: BigInt(empresaId) },
      data: updateData
    });

    console.log('✅ [API-UPDATE-COMPANY] Empresa actualizada exitosamente');

    const companyResponse = {
      id: Number(updatedRecord.id),
      name: updatedRecord.nombre_de_empresa,
      nombre_fiscal: updatedRecord.nombre_fiscal,
      CIF: updatedRecord.CIF,
      mail_de_carga: updatedRecord.mail_de_carga,
      recargo: updatedRecord.recargo
    };

    console.log('✅ [API-UPDATE-COMPANY] Empresa actualizada exitosamente');

    // Registrar evento de cambio de configuración (Orden HAC/1177/2024)
    try {
      await prisma.eventos_sistema.create({
        data: {
          id_de_empresa: BigInt(empresaId),
          usuario: user.email,
          tipo_evento: 'CONFIG_CHANGE',
          metadata: JSON.stringify({
            ip: request.headers.get('x-forwarded-for') || 'unknown',
            userAgent: request.headers.get('user-agent') || 'unknown',
            cambios: updateData
          })
        }
      });
    } catch (e) {
      console.warn('⚠️ [API-UPDATE-COMPANY] No se pudo guardar log de auditoría del sistema:', e);
    }

    // ✅ FIRE AND FORGET: Revalidar incidencias por cambio de contexto
    validateCompanyDocuments(empresaId).catch(err => {
      console.error('❌ [Background] Error en validación de empresa:', err);
    });

    return NextResponse.json({
      success: true,
      message: 'Empresa actualizada correctamente',
      company: companyResponse
    });

  } catch (error) {
    console.error('❌ [API-UPDATE-COMPANY] Error:', error);
    return NextResponse.json(
      { error: 'Error al actualizar la empresa' },
      { status: 500 }
    );
  }
}

// DELETE - Eliminar empresa y todos sus documentos
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    console.log('🗑️ [API-DELETE-COMPANY] Iniciando eliminación...');

    const user = await getCurrentUser();

    if (!user) {
      console.warn('⚠️ [API-DELETE-COMPANY] No hay usuario autenticado');
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const params = await context.params;
    const companyId = parseInt(params.id);

    if (isNaN(companyId)) {
      return NextResponse.json({ error: 'ID de empresa inválido' }, { status: 400 });
    }

    console.log('👤 [API-DELETE-COMPANY] Usuario:', user.id, 'Empresa:', companyId);

    const result = await deleteCompany(companyId, user.id);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    console.log('✅ [API-DELETE-COMPANY] Empresa eliminada exitosamente');

    return NextResponse.json({
      success: true,
      message: result.documentsDeleted
        ? `Empresa eliminada junto con ${result.documentsDeleted} documento(s)`
        : 'Empresa eliminada correctamente',
      documentsDeleted: result.documentsDeleted
    });

  } catch (error) {
    console.error('❌ [API-DELETE-COMPANY] Error:', error);
    return NextResponse.json(
      { error: 'Error al eliminar la empresa' },
      { status: 500 }
    );
  }
}