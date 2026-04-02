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

        // Obtener parámetros de query string
        const url = new URL(request.url);
        const empresaIdParam = url.searchParams.get('empresaId');

        let query = `
      SELECT COUNT(DISTINCT d.id) as count
      FROM documentos d
      JOIN incidencias_documento i ON d.id = i.documento_id
      JOIN empresas e ON d.id_de_empresa = e.id
      WHERE i.validado = 0 
        AND JSON_CONTAINS(e.id_de_usuario, CAST(? AS JSON))`;

        const params: any[] = [session.userId];

        // Filtrar por empresa si se proporciona el parámetro
        if (empresaIdParam) {
            const empresaIds = empresaIdParam.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
            if (empresaIds.length > 0) {
                query += ` AND d.id_de_empresa IN (${empresaIds.map(() => '?').join(',')})`;
                params.push(...empresaIds);
            }
        }

        const [rows] = await db.query<RowDataPacket[]>(query, params);

        return NextResponse.json({
            count: rows[0]?.count || 0
        });

    } catch (error) {
        console.error('❌ [API-INCIDENTS-COUNT] Error:', error);
        return NextResponse.json({ count: 0 }, { status: 500 });
    }
}
