import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/services/auth-service';
import {
  saveColumnVisibility,
  getColumnVisibility,
  deleteColumnVisibility,
} from '@/lib/upstash';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.userId) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const viewId = request.nextUrl.searchParams.get('viewId');
    if (!viewId) {
      return NextResponse.json({ error: 'viewId es requerido' }, { status: 400 });
    }

    const columnVisibility = await getColumnVisibility(session.userId, viewId);
    return NextResponse.json({ columnVisibility, viewId });
  } catch (error) {
    console.error('❌ GET /api/column-visibility:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.userId) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const { viewId, columnVisibility } = await request.json();
    if (!viewId || !columnVisibility || typeof columnVisibility !== 'object') {
      return NextResponse.json({ error: 'viewId y columnVisibility requeridos' }, { status: 400 });
    }

    const ok = await saveColumnVisibility(session.userId, viewId, columnVisibility);
    if (!ok) {
      return NextResponse.json({ error: 'Error guardando' }, { status: 500 });
    }

    return NextResponse.json({ success: true, viewId });
  } catch (error) {
    console.error('❌ POST /api/column-visibility:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.userId) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const viewId = request.nextUrl.searchParams.get('viewId');
    if (!viewId) {
      return NextResponse.json({ error: 'viewId es requerido' }, { status: 400 });
    }

    await deleteColumnVisibility(session.userId, viewId);
    return NextResponse.json({ success: true, viewId });
  } catch (error) {
    console.error('❌ DELETE /api/column-visibility:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
