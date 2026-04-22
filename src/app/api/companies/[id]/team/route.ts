import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, getUsersByIds } from '@/services/user-service';
import { getInvitationsByEmpresa } from '@/services/invitation-service';
import db from '@/lib/db';
import { RowDataPacket } from 'mysql2';

export const dynamic = 'force-dynamic';

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
        }

        const params = await context.params;
        const empresaId = parseInt(params.id, 10);

        if (isNaN(empresaId)) {
            return NextResponse.json({ error: 'ID de empresa inválido' }, { status: 400 });
        }

        // Verificar que la empresa pertenece al usuario (o es miembro)
        const [empresaCheck] = await db.query<RowDataPacket[]>(
            'SELECT id, id_de_usuario FROM empresas WHERE id = ? AND JSON_CONTAINS(id_de_usuario, CAST(? AS JSON))',
            [empresaId, user.id]
        );

        if (empresaCheck.length === 0) {
            return NextResponse.json({ error: 'Empresa no encontrada o sin permisos' }, { status: 404 });
        }

        const company = empresaCheck[0];
        let memberIds: number[] = [];
        try {
            const rawIds = company.id_de_usuario;
            memberIds = Array.isArray(rawIds) ? rawIds : JSON.parse(rawIds || '[]');
        } catch (e) {
            memberIds = [];
        }

        const [members, invitations] = await Promise.all([
            getUsersByIds(memberIds, empresaId),
            getInvitationsByEmpresa(empresaId)
        ]);

        return NextResponse.json({
            members,
            invitations
        });

    } catch (error) {
        console.error('❌ [API-COMPANY-TEAM] Error:', error);
        return NextResponse.json(
            { error: 'Error al obtener el equipo de la empresa' },
            { status: 500 }
        );
    }
}
