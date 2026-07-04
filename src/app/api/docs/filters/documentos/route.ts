import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/user-service';
import db from '@/lib/db';
import type { RowDataPacket } from 'mysql2';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const [empresaRows] = await db.query<RowDataPacket[]>(
      `SELECT id FROM empresas WHERE JSON_CONTAINS(id_de_usuario, CAST(? AS JSON))`,
      [user.id]
    );

    if (empresaRows.length === 0) {
      return NextResponse.json({ documentos: [] });
    }

    const empresaIds = empresaRows.map((r: any) => r.id);

    // Fetch the latest 100 documents to populate the dropdown
    const [docs] = await db.query<RowDataPacket[]>(
      `SELECT id, tipo_documento, numero_documento FROM documentos 
       WHERE id_de_empresa IN (?) 
       ORDER BY fecha_emision DESC 
       LIMIT 100`,
      [empresaIds]
    );

    // Format them nicely: "1045 - Factura INV-2026"
    const formattedDocs = docs.map((d: any) => {
      const num = d.numero_documento ? ` ${d.numero_documento}` : '';
      return `${d.id} - ${d.tipo_documento}${num}`;
    });

    return NextResponse.json({ documentos: formattedDocs });
  } catch (error) {
    console.error('❌ Error en /api/docs/filters/documentos:', error);
    return NextResponse.json({ error: 'Error al obtener documentos' }, { status: 500 });
  }
}
