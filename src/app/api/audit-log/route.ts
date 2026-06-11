import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const table = searchParams.get('table') || 'documentos_auditoria';
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);

  try {
    // Helper to serialize BigInts
    const serializeBigInts = (obj: any): any => {
      return JSON.parse(JSON.stringify(obj, (key, value) =>
        typeof value === 'bigint' ? value.toString() : value
      ));
    };

    if (table === 'documentos_auditoria') {
      const rows = await prisma.documentos_auditoria.findMany({
        orderBy: { fecha_accion: 'desc' },
        take: limit,
      });
      return NextResponse.json({ table, rows: serializeBigInts(rows) });
    }

    if (table === 'eventos_sistema') {
      const rows = await prisma.eventos_sistema.findMany({
        orderBy: { fecha: 'desc' },
        take: limit,
      });
      return NextResponse.json({ table, rows: serializeBigInts(rows) });
    }

    return NextResponse.json({ error: 'Tabla no válida' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
