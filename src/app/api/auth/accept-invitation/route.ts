import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/services/auth-service';
import { acceptInvitation } from '@/services/invitation-service';
import { createNotification } from '@/services/notification-service';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
    try {
        const session = await verifySession();
        if (!session) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const { token } = await req.json();

        if (!token) {
            return NextResponse.json({ error: 'Token requerido' }, { status: 400 });
        }

        const userId = session.userId;
        if (!userId) {
            return NextResponse.json({ error: 'Usuario no encontrado en sesión' }, { status: 401 });
        }

        const result = await acceptInvitation(token, userId);

        if (!result.success) {
            return NextResponse.json({
                error: result.error,
                // @ts-ignore
                invitedEmail: result.invitedEmail
            }, { status: 400 });
        }

        return NextResponse.json({
            success: true,
            message: 'Invitación aceptada con éxito',
            // @ts-ignore
            empresaId: result.empresaId
        });

    } catch (error) {
        console.error('❌ [API AcceptInvite] Error:', error);
        return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
    }
}
