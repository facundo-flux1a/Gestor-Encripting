import { NextRequest, NextResponse } from 'next/server';
import { getInvitationByToken } from '@/services/invitation-service';
import { prisma } from '@/lib/prisma';
import { hashField } from '@/lib/encryption';
import { findUserByEmail } from '@/services/auth-service';

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

        // Obtener nombre de la empresa usando Prisma (descifra nombre_de_empresa automáticamente)
        const empresa = await prisma.empresas.findUnique({
            where: { id: BigInt(invitation.empresa_id) },
            select: { nombre_de_empresa: true }
        });

        // Verificar si el usuario ya existe (buscar por email, usa fallback)
        const existingUser = await findUserByEmail(invitation.email);

        return NextResponse.json({
            email: invitation.email,
            empresaNombre: empresa?.nombre_de_empresa || 'Empresa Colaboradora',
            rol: invitation.rol,
            userExists: !!existingUser
        });
    } catch (error) {
        console.error('❌ [API InvitationDetails] Error:', error);
        return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
    }
}
