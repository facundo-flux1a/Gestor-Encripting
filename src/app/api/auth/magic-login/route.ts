import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashField } from '@/lib/encryption';
import { createSession, findUserByEmail } from '@/services/auth-service';
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
    // Buscar usuario por email (usa hash + fallback plano para migración)
    const user = await findUserByEmail(email);

    if (!user) {
      return NextResponse.redirect(new URL('/auth/login?error=user_not_found', req.url));
    }

    // Verificar código y expiración
    if (user.two_factor_code !== code) {
      return NextResponse.redirect(new URL('/auth/login?error=magic_link_invalid_code', req.url));
    }

    if (!user.two_factor_expires_at || new Date(user.two_factor_expires_at) < new Date()) {
      return NextResponse.redirect(new URL('/auth/login?error=magic_link_expired', req.url));
    }

    // Código válido: limpiar y verificar email
    await prisma.usuarios.update({
      where: { id: user.id },
      data: { email_verified: true, two_factor_code: null, two_factor_expires_at: null }
    });

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

    // Registrar evento de login (VeriFactu / Log de Eventos)
    try {
      await prisma.eventos_sistema.create({
        data: {
          usuario: user.email,
          tipo_evento: 'LOGIN',
          metadata: JSON.stringify({ ip: req.headers.get('x-forwarded-for') || 'unknown', agent: req.headers.get('user-agent') }),
          fecha: new Date()
        }
      });
    } catch (e) {
      console.warn('⚠️ No se pudo registrar el evento de LOGIN en eventos_sistema', e);
    }

    if (inviteToken) {
      await acceptInvitation(inviteToken, user.id);
    }

    return response;

  } catch (error) {
    console.error('Magic link error:', error);
    return NextResponse.redirect(new URL('/auth/login?error=server_error', req.url));
  }
}
