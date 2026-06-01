import { NextResponse } from 'next/server';
import { getClientsWithStats } from '@/services/document-service';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { companyIds } = body;

    if (!Array.isArray(companyIds)) {
      return NextResponse.json({ error: 'companyIds required' }, { status: 400 });
    }

    if (companyIds.length === 0) {
      return NextResponse.json({ clients: [] });
    }

    const clients = await getClientsWithStats(companyIds);

    return NextResponse.json({ clients });
  } catch (error) {
    console.error('❌ Error en /api/clientes:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
