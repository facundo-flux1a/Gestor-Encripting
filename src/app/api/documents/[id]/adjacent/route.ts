import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/user-service';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(
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
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const companyIdParam = searchParams.get('companyId');

    const currentDoc = await prisma.documentos.findUnique({
      where: { id: BigInt(documentId) },
      select: { id: true, id_de_empresa: true }
    });

    if (!currentDoc) {
      return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 });
    }

    const companyId = companyIdParam ? parseInt(companyIdParam, 10) : (currentDoc.id_de_empresa ? Number(currentDoc.id_de_empresa) : null);

    const whereClause: any = {
      OR: [
        { id_de_empresa: null },
        { empresas: { id_de_usuario: { array_contains: user.id } } }
      ]
    };

    if (companyId && !isNaN(companyId)) {
      whereClause.id_de_empresa = BigInt(companyId);
    }

    const docs = await prisma.documentos.findMany({
      where: whereClause,
      orderBy: [
        { fecha_emision: 'desc' },
        { id: 'desc' }
      ],
      select: { id: true }
    });

    const ids = docs.map(d => Number(d.id));
    const currentIndex = ids.indexOf(documentId);

    const prevId = currentIndex > 0 ? ids[currentIndex - 1] : null;
    const nextId = currentIndex >= 0 && currentIndex < ids.length - 1 ? ids[currentIndex + 1] : null;

    return NextResponse.json({
      prevId,
      nextId,
      currentIndex: currentIndex >= 0 ? currentIndex + 1 : null,
      totalCount: ids.length,
      ids
    });
  } catch (error) {
    console.error('❌ Error obteniendo documentos adyacentes:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
