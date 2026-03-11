import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/services/auth-service';
import { getSelectedCompanies, saveSelectedCompanies } from '@/lib/upstash';

export const dynamic = 'force-dynamic';

// GET - Obtener IDs de empresas seleccionadas por el usuario
export async function GET(_request: NextRequest) {
    try {
        const session = await getSession();

        if (!session) {
            return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
        }

        const ids = await getSelectedCompanies(session.userId);

        return NextResponse.json({ ids: ids ?? [] });
    } catch (error) {
        console.error('❌ [API-SELECTED-COMPANIES-GET] Error:', error);
        // Degradar gracefully: devolver array vacío en lugar de un 500
        return NextResponse.json({ ids: [] });
    }
}

// POST - Guardar IDs de empresas seleccionadas
export async function POST(request: NextRequest) {
    try {
        const session = await getSession();

        if (!session) {
            return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
        }

        const body = await request.json();
        const { ids } = body;

        if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'number')) {
            return NextResponse.json(
                { error: 'El campo ids debe ser un array de números' },
                { status: 400 }
            );
        }

        const success = await saveSelectedCompanies(session.userId, ids);

        return NextResponse.json({ success, ids });
    } catch (error) {
        console.error('❌ [API-SELECTED-COMPANIES-POST] Error:', error);
        return NextResponse.json({ error: 'Error al guardar selección' }, { status: 500 });
    }
}
