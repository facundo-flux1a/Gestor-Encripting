import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/services/user-service';

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
      // Si está vacío, buscar el email actual via Prisma para que venga desencriptado
      const currentProvider = await prisma.entidades_documento.findFirst({
        where: {
          identificador_fiscal: currentFiscalId,
          rol: { in: ['proveedor', 'emisor', 'cliente', 'receptor'] }
        },
        select: { email: true }
      });
      email = currentProvider?.email || null;
      console.log('📧 Email vacío detectado, manteniendo:', email);
    } else if (email.trim().toLowerCase() === 'n/a') {
      email = 'N/A';
      console.log('📧 Email normalizado a N/A');
    }

    // Verificar que el proveedor origen existe para este usuario
    const providerCheck = await prisma.entidades_documento.findFirst({
      where: {
        identificador_fiscal: currentFiscalId,
        rol: { in: ['proveedor', 'emisor', 'cliente', 'receptor'] },
        documentos: {
          empresas: {
            id_de_usuario: { path: '$', array_contains: user.id }
          }
        }
      },
      select: { id: true }
    });

    if (!providerCheck) {
      console.error('❌ Proveedor origen no encontrado:', currentFiscalId);
      return NextResponse.json(
        { error: 'Proveedor no encontrado' },
        { status: 404 }
      );
    }

    // Obtener todos los IDs de entidades que matchean el CIF actual y pertenecen al usuario
    const entitiesToUpdate = await prisma.entidades_documento.findMany({
      where: {
        identificador_fiscal: currentFiscalId,
        rol: { in: ['proveedor', 'emisor', 'cliente', 'receptor'] },
        documentos: {
          empresas: {
            id_de_usuario: { path: '$', array_contains: user.id }
          }
        }
      },
      select: { id: true }
    });

    const entityIds = entitiesToUpdate.map(e => e.id);

    if (entityIds.length === 0) {
      return NextResponse.json({ error: 'No se encontraron entidades para actualizar' }, { status: 404 });
    }

    // Si el CIF NO cambió, actualización simple de datos personales
    if (identificador_fiscal === currentFiscalId) {
      console.log('🔄 Actualización simple (sin cambio de CIF)');

      await prisma.entidades_documento.updateMany({
        where: { id: { in: entityIds } },
        data: {
          nombre: nombre ?? undefined,
          direccion: direccion ?? undefined,
          telefono: telefono ?? undefined,
          email: email ?? undefined,
        }
      });

      console.log(`✅ Proveedor actualizado: ${entityIds.length} registros`);

      return NextResponse.json({
        success: true,
        merged: false,
        affectedRows: entityIds.length
      });
    }

    // El CIF CAMBIÓ → Hacer MERGE (consolidar proveedores)
    console.log(`🔀 MERGE detectado: ${currentFiscalId} → ${identificador_fiscal}`);

    const existingProvider = await prisma.entidades_documento.findFirst({
      where: {
        identificador_fiscal,
        rol: { in: ['proveedor', 'emisor', 'cliente', 'receptor'] },
        documentos: {
          empresas: {
            id_de_usuario: { path: '$', array_contains: user.id }
          }
        }
      },
      select: { id: true }
    });

    const wasMerge = !!existingProvider;

    if (wasMerge) {
      console.warn('⚠️ CIF destino ya existe, consolidando proveedores...');
    } else {
      console.log('✨ CIF destino no existe, cambiando CIF limpiamente');
    }

    await prisma.entidades_documento.updateMany({
      where: { id: { in: entityIds } },
      data: {
        nombre: nombre ?? undefined,
        identificador_fiscal,
        direccion: direccion ?? undefined,
        telefono: telefono ?? undefined,
        email: email ?? undefined,
      }
    });

    console.log(`✅ ${wasMerge ? 'MERGE' : 'Cambio de CIF'} completado: ${entityIds.length} registros actualizados`);

    try {
      const { logAuditAction } = await import('@/services/audit-service');
      await logAuditAction({
        accion: 'EDICION_ENTIDAD',
        usuarioEmail: user.email,
        userId: user.id,
        detalle: { 
          entidadOriginal: currentFiscalId,
          entidadNueva: identificador_fiscal,
          nombre,
          fueMerge: wasMerge,
          afectados: entityIds.length 
        }
      });
    } catch (auditErr) {
      console.warn('⚠️ Error registrando auditoría EDICION_ENTIDAD:', auditErr);
    }

    return NextResponse.json({
      success: true,
      merged: wasMerge,
      affectedRows: entityIds.length,
      message: wasMerge
        ? `Proveedores consolidados exitosamente. ${entityIds.length} documentos fusionados.`
        : `CIF actualizado. ${entityIds.length} registros modificados.`
    });

  } catch (error) {
    console.error('❌ Error actualizando proveedor:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
