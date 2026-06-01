import { NextRequest, NextResponse } from 'next/server';
import { getDocsProviderNames } from '@/services/document-service';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const empresaIdsParam = searchParams.get('empresaIds');

    let empresaIds: number[] | undefined;
    if (empresaIdsParam) {
      try { empresaIds = JSON.parse(empresaIdsParam); } catch { /* ignore */ }
    }

    const proveedores = await getDocsProviderNames(empresaIds);
    return NextResponse.json({ proveedores });
  } catch (error) {
    console.error('❌ Error en /api/docs/filters/proveedores:', error);
    return NextResponse.json({ error: 'Error al obtener proveedores' }, { status: 500 });
  }
}
