import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/services/auth-service';
import pool from '@/lib/db';

// PATCH /api/sii/marcar-enviado — actualiza enviado_sii = 1 para los docs indicados
export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const body = await request.json();
    const { ids }: { ids: number[] } = body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'Se requiere un array de IDs' }, { status: 400 });
    }

    const placeholders = ids.map(() => '?').join(',');
    await pool.query(
      `UPDATE documentos SET enviado_sii = 1 WHERE id IN (${placeholders})`,
      ids
    );

    return NextResponse.json({ success: true, actualizados: ids.length });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 });
  }
}
