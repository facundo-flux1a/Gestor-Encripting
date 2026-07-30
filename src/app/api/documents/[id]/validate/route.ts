import { NextRequest, NextResponse } from 'next/server';
import { validateDocumentIncidents } from '@/services/document-service';
import { getCurrentUser } from '@/services/user-service';
import { createNotification, getUserIdsForEmpresa } from '@/services/notification-service';
import { prisma } from '@/lib/prisma';
export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params;
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const documentId = parseInt(params.id, 10);
    if (isNaN(documentId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
    }

    const result = await validateDocumentIncidents(documentId);

    if (!result.success) {
      return NextResponse.json({ error: 'Error al validar' }, { status: 500 });
    }

    // --- Notification ---
    const docInfo = await prisma.documentos.findUnique({
      where: { id: BigInt(documentId) },
      select: { id_de_empresa: true, numero_documento: true }
    });

    if (docInfo?.id_de_empresa) {
      const empresaIdNum = Number(docInfo.id_de_empresa);
      const userIds = await getUserIdsForEmpresa(empresaIdNum);
      if (userIds.length > 0) {
        const docNum = docInfo.numero_documento || documentId.toString();
        await createNotification({
          userIds,
          empresaId: empresaIdNum,
          tipo: 'incidencia_resuelta',
          titulo: 'Incidencias Resueltas',
          mensaje: `Todas las incidencias de la factura #${docNum} han sido resueltas.`,
          metadata: { documentoId: documentId.toString() }
        });
      }
    }
    // --------------------

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('❌ Error validando incidencias:', error);
    return NextResponse.json({
      error: 'Error al validar incidencias'
    }, { status: 500 });
  }
}