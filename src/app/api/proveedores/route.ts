import { NextResponse } from 'next/server';
import { getProvidersWithStats } from '@/services/document-service';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { companyIds } = body;

    if (!Array.isArray(companyIds)) {
      return NextResponse.json({ error: 'companyIds required' }, { status: 400 });
    }

    if (companyIds.length === 0) {
      return NextResponse.json({ providers: [] });
    }

    // Ya viene con empresaNombre desde el service
    const providers = await getProvidersWithStats(companyIds);

    return NextResponse.json({ providers });
  } catch (error) {
    console.error('❌ Error en /api/proveedores:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}