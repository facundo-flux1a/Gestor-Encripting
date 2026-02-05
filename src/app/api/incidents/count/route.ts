import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSession } from '@/services/auth-service';
import { RowDataPacket } from 'mysql2';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
        }

        const [rows] = await db.query<RowDataPacket[]>(`
      SELECT COUNT(DISTINCT d.id) as count
      FROM documentos d
      JOIN incidencias_documento i ON d.id = i.documento_id
      JOIN empresas e ON d.id_de_empresa = e.id
      WHERE i.validado = 0 
        AND e.id_de_usuario = ?
    `, [session.userId]);

        return NextResponse.json({
            count: rows[0]?.count || 0
        });

    } catch (error) {
        console.error('❌ [API-INCIDENTS-COUNT] Error:', error);
        return NextResponse.json({ count: 0 }, { status: 500 });
    }
}
