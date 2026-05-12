import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSession } from '@/services/auth-service';

export async function POST(request: Request) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const { mensaje, mediaUrls } = await request.json();

        if (!mensaje || mensaje.trim() === '') {
            return NextResponse.json({ error: 'El mensaje es obligatorio' }, { status: 400 });
        }

        const [result] = await db.query(
            'INSERT INTO sugerencias (id_usuario, mensaje, media_urls) VALUES (?, ?, ?)',
            [session.userId, mensaje, JSON.stringify(mediaUrls || [])]
        );

        return NextResponse.json({ 
            success: true, 
            message: 'Sugerencia guardada correctamente' 
        });
    } catch (error: any) {
        console.error('❌ [API Suggestions] Error:', error);
        return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
    }
}
