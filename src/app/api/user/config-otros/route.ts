import { NextRequest, NextResponse } from 'next/server';
import { getUserConfigOtros, updateUserConfigOtros } from '@/services/user-service';
import { getCurrentUser } from '@/services/user-service';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const tipos = await getUserConfigOtros();
        return NextResponse.json({ tipos });
    } catch (error) {
        return NextResponse.json({ error: 'Error al obtener configuración' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const user = await getCurrentUser();
        console.log('📡 [API-CONFIG-OTROS] User ID:', user?.id);

        if (!user) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const { tipos } = await request.json();
        console.log('📦 [API-CONFIG-OTROS] Tipos recibidos:', tipos);

        if (!Array.isArray(tipos)) {
            return NextResponse.json({ error: 'Formato inválido' }, { status: 400 });
        }

        // Limitar a 5 tipos como se solicitó
        const limitedTipos = tipos.slice(0, 5);

        const success = await updateUserConfigOtros(limitedTipos);

        if (success) {
            return NextResponse.json({ success: true, tipos: limitedTipos });
        } else {
            return NextResponse.json({ error: 'Error al actualizar' }, { status: 500 });
        }
    } catch (error) {
        return NextResponse.json({ error: 'Error al procesar solicitud' }, { status: 500 });
    }
}
