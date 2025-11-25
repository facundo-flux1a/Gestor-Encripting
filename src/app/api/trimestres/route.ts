import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/services/auth-service';
import { getTrimestresList } from '@/services/document-service';
import type { TrimestreFilters } from '@/lib/types';

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    
    // Soportar múltiples empresas: ?empresa_id=1&empresa_id=2&empresa_id=3
    const empresaIdsParam = searchParams.getAll('empresa_id');
    
    const filters: TrimestreFilters = {
      empresa_id: empresaIdsParam.length > 0 
        ? empresaIdsParam.map(id => parseInt(id))
        : undefined,
      año: searchParams.get('año') 
        ? parseInt(searchParams.get('año')!) 
        : undefined,
      mostrar_vacios: searchParams.get('mostrar_vacios') === 'true',
    };

    console.log('📊 [GET /api/trimestres] Filters:', filters);

    const trimestres = await getTrimestresList(session.userId, filters);

    return NextResponse.json(trimestres);
  } catch (error) {
    console.error('❌ Error en GET /api/trimestres:', error);
    return NextResponse.json(
      { error: 'Error al obtener trimestres' },
      { status: 500 }
    );
  }
}