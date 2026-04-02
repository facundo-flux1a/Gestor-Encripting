import { NextRequest, NextResponse } from 'next/server';
import { getInvitationByToken } from '@/services/invitation-service';
import db from '@/lib/db';
import { RowDataPacket } from 'mysql2';

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const token = searchParams.get('token');

        if (!token) {
            return NextResponse.json({ error: 'Token requerido' }, { status: 400 });
        }

        const invitation = await getInvitationByToken(token);

        if (!invitation) {
            return NextResponse.json({ error: 'Invitación no encontrada o expirada' }, { status: 404 });
        }

        // Obtener nombre de la empresa para mostrar en el UI de registro
        const [empRows] = await db.query<RowDataPacket[]>(
            'SELECT nombre_de_empresa FROM empresas WHERE id = ?',
            [invitation.empresa_id]
        );

        // Verificar si el usuario ya existe
        const [userRows] = await db.query<RowDataPacket[]>(
            'SELECT id FROM usuarios WHERE email = ?',
            [invitation.email]
        );

        return NextResponse.json({
            email: invitation.email,
            empresaNombre: empRows[0]?.nombre_de_empresa || 'Empresa Colaboradora',
            rol: invitation.rol,
            userExists: userRows.length > 0
        });
    } catch (error) {
        console.error('❌ [API InvitationDetails] Error:', error);
        return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
    }
}
