import { NextRequest, NextResponse } from 'next/server';
import { validateSingleIncident } from '@/services/incidents-service';
import { getCurrentUser } from '@/services/user-service';

export const dynamic = 'force-dynamic';

export async function POST(
    request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const params = await props.params;
    try {
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
        }

        const incidentId = parseInt(params.id, 10);
        if (isNaN(incidentId)) {
            return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
        }

        const result = await validateSingleIncident(incidentId, user.id);

        if (!result.success) {
            return NextResponse.json({ error: 'Error al validar incidencia' }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('❌ Error validando incidencia:', error);
        return NextResponse.json({
            error: 'Error interno'
        }, { status: 500 });
    }
}
