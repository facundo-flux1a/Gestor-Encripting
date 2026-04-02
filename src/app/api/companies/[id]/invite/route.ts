import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/services/auth-service';
import { createInvitation } from '@/services/invitation-service';
import { getCompanies } from '@/services/document-service';

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await verifySession();
        if (!session) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const { email, rol } = await req.json();

        // Await params object for Next.js 15+ compatibility
        const resolvedParams = await params;
        const empresaId = parseInt(resolvedParams.id);

        if (!email || !rol) {
            return NextResponse.json({ error: 'Email y Rol requeridos' }, { status: 400 });
        }

        // 1. Verificar que el usuario tiene acceso a esta empresa y es ADMIN
        const companies = await getCompanies();
        const empresa = companies.find(c => c.id === empresaId);

        if (!empresa) {
            return NextResponse.json({ error: 'Empresa no encontrada o sin acceso' }, { status: 404 });
        }

        // 2. Crear invitación con el email del remitente
        const result = await createInvitation(empresaId.toString(), email, rol, session.nombre);

        if (!result.success) {
            return NextResponse.json({ error: result.error }, { status: 500 });
        }

        return NextResponse.json({ success: true, message: 'Invitación enviada con éxito' });

    } catch (error) {
        console.error('❌ [API Invite] Error:', error);
        return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
    }
}
