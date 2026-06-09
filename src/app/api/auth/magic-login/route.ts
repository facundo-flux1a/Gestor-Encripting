import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import type { RowDataPacket } from 'mysql2';
import { createSession } from '@/services/auth-service';
import { acceptInvitation } from '@/services/invitation-service';

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const email = searchParams.get('email');
  const code = searchParams.get('code');
  
  // Opcionalmente podemos recibir el token de invitación
  const inviteToken = searchParams.get('invite_token');

  if (!email || !code) {
    return NextResponse.redirect(new URL('/auth/login?error=magic_link_invalid', req.url));
  }

  try {
    const [rows] = await db.query<RowDataPacket[]>('SELECT * FROM usuarios WHERE email = ?', [email]);
    if (rows.length === 0) {
      return NextResponse.redirect(new URL('/auth/login?error=user_not_found', req.url));
    }
    
    const user = rows[0];

    // Verificar código y expiración
    if (user.two_factor_code !== code) {
      return NextResponse.redirect(new URL('/auth/login?error=magic_link_invalid_code', req.url));
    }
    
    if (!user.two_factor_expires_at || new Date(user.two_factor_expires_at) < new Date()) {
      return NextResponse.redirect(new URL('/auth/login?error=magic_link_expired', req.url));
    }

    // Código válido: limpiar y verificar email
    await db.query(
      'UPDATE usuarios SET email_verified = 1, two_factor_code = NULL, two_factor_expires_at = NULL WHERE id = ?',
      [user.id]
    );

    // Si había una cookie temporal pending_2fa, no es fácil borrarla desde un Server Component en ruta de API sin Response cookies,
    // pero al setear la cookie real de sesión, la pending_2fa dejará de importar.
    // Igual podemos intentar borrarla:
    const response = NextResponse.redirect(new URL('/dashboard', req.url));
    response.cookies.delete('pending_2fa');

    // Crear la sesión real
    // Nota: createSession de auth-service.ts usa cookies() de next/headers, lo cual SÍ funciona en un Route Handler 
    // y aplicará la cookie directamente a la respuesta en Next.js App Router.
    await createSession(
      user.id,
      user.email,
      user.nombre,
      user.tutorial,
      user.tutorial_documentos,
      user.tutorial_trimestres,
      user.tutorial_actividad,
      user.tutorial_individual,
      user.tutorial_incidencias,
      user.tutorial_proveedores,
      user.tutorial_health_check,
      user.organization_rol
    );

    if (inviteToken) {
      await acceptInvitation(inviteToken, user.id);
    }

    return response;

  } catch (error) {
    console.error('Magic link error:', error);
    return NextResponse.redirect(new URL('/auth/login?error=server_error', req.url));
  }
}
