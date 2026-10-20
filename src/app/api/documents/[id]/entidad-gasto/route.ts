import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/user-service';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/documents/[id]/entidad-gasto
 *
 * Guarda la cuenta de gasto (6xxx) o ingreso (7xxx) de la entidad principal
 * de un documento. Es PER-DOCUMENTO — no propaga a otros documentos del mismo
 * proveedor. Para actualizar el default canónico, usar /api/entidades-config.
 *
 * Body: { cuentaGasto: string | null, rol?: string }
 */
export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params;
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const documentId = parseInt(params.id, 10);
    if (isNaN(documentId)) {
      return NextResponse.json({ error: 'ID de documento inválido' }, { status: 400 });
    }

    const body = await request.json();
    const { cuentaGasto, rol } = body;

    if (cuentaGasto !== null && typeof cuentaGasto !== 'string') {
      return NextResponse.json(
        { error: '"cuentaGasto" debe ser string o null.' },
        { status: 400 }
      );
    }

    // Verificar que el documento pertenece a la empresa del user
    const doc = await prisma.documentos.findUnique({
      where: { id: BigInt(documentId) },
      select: { id: true, id_de_empresa: true },
    });

    if (!doc) {
      return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 });
    }

    if ((user as any).empresaId && Number(doc.id_de_empresa) !== (user as any).empresaId) {
      return NextResponse.json({ error: 'Sin acceso a este documento' }, { status: 403 });
    }

    // Actualizar la entidad principal del documento (proveedor/emisor o cliente/receptor)
    // El rol por defecto es el del tercero (proveedor en recibidas, cliente en emitidas)
    const rolesTarget = rol
      ? [rol]
      : ['proveedor', 'emisor', 'cliente', 'receptor'];

    const cuentaFinal = cuentaGasto && cuentaGasto.trim() !== '' ? cuentaGasto.trim() : null;

    const updated = await prisma.entidades_documento.updateMany({
      where: {
        documento_id: BigInt(documentId),
        rol: { in: rolesTarget },
      },
      data: { cuenta_gasto: cuentaFinal },
    });

    return NextResponse.json({
      success: true,
      updatedRows: updated.count,
      cuenta_gasto: cuentaFinal,
    });

  } catch (error: any) {
    console.error('❌ [ENTIDAD-GASTO] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Error al actualizar cuenta de gasto' },
      { status: 500 }
    );
  }
}
