import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/services/auth-service';
import { getTableFilters, saveTableFilters } from '@/lib/upstash';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.userId) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const viewId = searchParams.get('viewId') || 'documents-table';

    const filters = await getTableFilters(session.userId, viewId);
    return NextResponse.json({ filters });
  } catch (error) {
    console.error('❌ [API] Error en GET /api/filters:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.userId) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const { viewId, filters } = await request.json();
    if (!viewId || !filters) {
      return NextResponse.json({ error: 'viewId y filters son requeridos' }, { status: 400 });
    }

    const success = await saveTableFilters(session.userId, viewId, filters);
    return NextResponse.json({ success });
  } catch (error) {
    console.error('❌ [API] Error en POST /api/filters:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
