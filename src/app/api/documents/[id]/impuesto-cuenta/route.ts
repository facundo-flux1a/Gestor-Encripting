import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/user-service';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/documents/[id]/impuesto-cuenta
 *
 * Acepta o edita la cuenta contable de un impuesto concreto de un documento.
 * El user puede aceptar la sugerencia de la IA o escribir una cuenta manual.
 *
 * Body: { impuestoId: number, cuentaContable: string | null }
 *   - cuentaContable: la cuenta a asignar (ej. "47200021") o null para limpiarla.
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
    const { impuestoId, cuentaContable } = body;

    if (typeof impuestoId !== 'number') {
      return NextResponse.json(
        { error: 'El campo "impuestoId" debe ser un número.' },
        { status: 400 }
      );
    }

    if (cuentaContable !== null && typeof cuentaContable !== 'string') {
      return NextResponse.json(
        { error: 'El campo "cuentaContable" debe ser un string o null.' },
        { status: 400 }
      );
    }

    // Verificar que el impuesto pertenece al documento correcto y a la empresa del user
    const impuesto = await prisma.impuestos_documento.findUnique({
      where: { id: BigInt(impuestoId) },
      include: { documentos: { select: { id: true, id_de_empresa: true } } },
    });

    if (!impuesto) {
      return NextResponse.json({ error: 'Impuesto no encontrado' }, { status: 404 });
    }

    if (Number(impuesto.documentos.id) !== documentId) {
      return NextResponse.json({ error: 'El impuesto no pertenece a este documento' }, { status: 403 });
    }

    // Verificar que el user tiene acceso a la empresa del documento
    if (user.empresaId && Number(impuesto.documentos.id_de_empresa) !== user.empresaId) {
      return NextResponse.json({ error: 'Sin acceso a este documento' }, { status: 403 });
    }

    // Actualizar la cuenta contable (string vacío equivale a NULL → limpia el campo)
    const cuentaFinal = cuentaContable && cuentaContable.trim() !== '' ? cuentaContable.trim() : null;
    const updated = await prisma.impuestos_documento.update({
      where: { id: BigInt(impuestoId) },
      data: { cuenta_contable: cuentaFinal },
    });

    return NextResponse.json({
      success: true,
      impuesto: {
        id: Number(updated.id),
        tipo_impuesto: updated.tipo_impuesto,
        cuenta_contable: updated.cuenta_contable,
      },
    });

  } catch (error: any) {
    console.error('❌ [IMPUESTO-CUENTA] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Error al actualizar la cuenta contable' },
      { status: 500 }
    );
  }
}
