import { NextRequest, NextResponse } from 'next/server';
import { getUniqueProvidersNames } from '@/services/document-service'; // ✅ Cambio aquí

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const empresaIdsParam = searchParams.get('empresaIds');
    
    let empresaIds: number[] | undefined;
    if (empresaIdsParam) {
      try {
        empresaIds = JSON.parse(empresaIdsParam);
      } catch {
        empresaIds = undefined;
      }
    }

    const proveedores = await getUniqueProvidersNames(empresaIds); // ✅ Cambio aquí
    
    return NextResponse.json({ proveedores });
  } catch (error) {
    console.error('❌ Error en /api/filters/proveedores:', error);
    return NextResponse.json(
      { error: 'Error al obtener proveedores' },
      { status: 500 }
    );
  }
}