import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/services/auth-service';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ uploadId: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const resolvedParams = await params;
    const { uploadId } = resolvedParams;

    if (!uploadId) {
      return NextResponse.json({ error: 'uploadId es requerido' }, { status: 400 });
    }

    // Eliminar el registro padre y cualquier hijo si es un lote, SIN tocar los documentos en sí
    await prisma.actividad.deleteMany({
      where: {
        OR: [
          { upload_id: uploadId },
          { parent_upload_id: uploadId }
        ]
      }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('❌ Error eliminando registro de subida activa:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
