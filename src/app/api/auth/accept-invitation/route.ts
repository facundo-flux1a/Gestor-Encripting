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
                invitedEmail: result.invitedEmail
            }, { status: 400 });
        }

        // --- Notification to Admins ---
        try {
            if (result.empresaId) {
                // Find users in this company who are admins
                const admins = await prisma.usuarios.findMany({
                    where: { 
                        id_de_empresa: BigInt(result.empresaId),
                        organization_rol: 'ADMIN',
                        activo: true
                    },
                    select: { id: true }
                });

                const adminIds = admins.map(a => Number(a.id));
                
                if (adminIds.length > 0) {
                    await createNotification({
                        userIds: adminIds,
                        empresaId: result.empresaId,
                        tipo: 'usuario_unido',
                        titulo: 'Nuevo Usuario',
                        mensaje: `El usuario ${result.invitedEmail || 'invitado'} ha aceptado la invitación y se unió al equipo.`,
                        metadata: {}
                    });
                }
            }
        } catch (notifErr) {
            console.error('Error enviando notificacion de invitacion:', notifErr);
        }
        // ------------------------------

        return NextResponse.json({
            success: true,
            message: 'Invitación aceptada con éxito',
            empresaId: result.empresaId
        });

    } catch (error) {
        console.error('❌ [API AcceptInvite] Error:', error);
        return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
    }
}
