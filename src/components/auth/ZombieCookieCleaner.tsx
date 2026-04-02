'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export function ZombieCookieCleaner() {
    const router = useRouter();

    useEffect(() => {
        const cleanup = async () => {
            console.warn('🧟 [ZombieCookieCleaner] Detectada cookie de sesión inválida o caducada en base de datos. Limpiando...');
            try {
                // Llama al endpoint de logout para borrar la cookie HttpOnly
                await fetch('/api/auth/logout', { method: 'POST' });
                // Recarga la página después de limpiar para que el middleware reciba una petición sin cookie
                window.location.reload();
            } catch (error) {
                console.error('❌ [ZombieCookieCleaner] Error al limpiar la cookie zombie:', error);
            }
        };

        cleanup();
    }, []);

    return null;
}
