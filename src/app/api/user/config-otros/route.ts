import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/user-service';
import { upstash } from '@/lib/upstash';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const key = `otros-folders:${user.id}`;
        const stored = await upstash.get(key);

        const tipos = stored ? (stored as string[]) : [];
        console.log('✅ [Redis] Carpetas recuperadas:', tipos);

        return NextResponse.json({ tipos });
    } catch (error) {
        console.error('❌ [Redis] Error al obtener configuración:', error);
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

        const key = `otros-folders:${user.id}`;
        await upstash.set(key, JSON.stringify(limitedTipos));

        console.log('✅ [Redis] Carpetas guardadas:', limitedTipos);

        return NextResponse.json({ success: true, tipos: limitedTipos });
    } catch (error) {
        console.error('❌ [Redis] Error al procesar solicitud:', error);
        return NextResponse.json({ error: 'Error al procesar solicitud' }, { status: 500 });
    }
}
