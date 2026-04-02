import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/services/auth-service';
import { revokeInvitation } from '@/services/invitation-service';

export async function POST(req: NextRequest) {
    try {
        const session = await verifySession();
        if (!session) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const { id } = await req.json();
        if (!id) {
            return NextResponse.json({ error: 'ID de invitación requerido' }, { status: 400 });
        }

        const result = await revokeInvitation(id);
        if (!result.success) {
            return NextResponse.json({ error: result.error }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('❌ [API Revoke] Error:', error);
        return NextResponse.json({ error: 'Error interno' }, { status: 500 });
    }
}
