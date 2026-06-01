import { NextRequest, NextResponse } from 'next/server';
import { getDocsClientNames } from '@/services/document-service';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const empresaIdsParam = searchParams.get('empresaIds');

    let empresaIds: number[] | undefined;
    if (empresaIdsParam) {
      try { empresaIds = JSON.parse(empresaIdsParam); } catch { /* ignore */ }
    }

    const clientes = await getDocsClientNames(empresaIds);
    return NextResponse.json({ clientes });
  } catch (error) {
    console.error('❌ Error en /api/docs/filters/clientes:', error);
    return NextResponse.json({ error: 'Error al obtener clientes' }, { status: 500 });
  }
}
