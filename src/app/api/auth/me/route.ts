import { NextResponse } from 'next/server';
import { verifySession } from '@/services/auth-service';
import { cookies } from 'next/headers';

export async function GET() {
    try {
        const session = await verifySession();
        if (!session) {
            // Limpiar "cookie zombie" exclusivamente aquí, ya que este endpoint 
            // se llama durante el flujo de invitación. Esto evita el bucle de redirección
            // sin afectar globalmente al resto de la app en inicios de sesión normales.
            const cookieStore = await cookies();
            if (cookieStore.has('session')) {
                console.warn('🧟 [api/auth/me] Detectada cookie zombie durante invitación. Limpiando...');
                cookieStore.delete('session');
            }
            return NextResponse.json({ loggedIn: false }, { status: 200 });
        }
        return NextResponse.json({
            loggedIn: true,
            user: {
                id: session.userId,
                email: session.email,
                nombre: session.nombre
            }
        });
    } catch (error) {
        return NextResponse.json({ loggedIn: false }, { status: 200 });
    }
}
