import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

// ✅ AGREGAR las rutas de reset password
const publicRoutes = [
  '/',
  '/landing',
  '/auth/login',
  '/auth/register',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/accept-invitation',
  '/legal(.*)',
];
const rootRoute = '/';

/**
 * Middleware to protect routes by checking for the presence of a session cookie.
 * This middleware is designed to be lightweight and compatible with the Edge runtime.
 * It does not validate the JWT, only checks for its existence. The actual validation
 * happens in Server Components or API routes running in the Node.js environment.
 */
export async function middleware(request: NextRequest) {
  const sessionCookie = request.cookies.get('session');
  const { pathname } = request.nextUrl;

  const isPublicRoute = publicRoutes.some(route => {
    if (route.includes('(.*)')) {
      const pattern = route.replace('(.*)', '');
      return pathname.startsWith(pattern);
    }
    return route === pathname;
  });

  // 1. Si NO hay cookie
  if (!sessionCookie) {
    // Si intenta acceder a ruta protegida -> Redirect a raíz (Landing)
    if (!isPublicRoute) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    // Si es ruta pública, dejar pasar
    return NextResponse.next();
  }

  // 2. Si HAY cookie, VERIFICAR FIRMA
  try {
    const secretKey = new TextEncoder().encode(process.env.SESSION_SECRET);
    await jwtVerify(sessionCookie.value, secretKey, {
      algorithms: ['HS256'],
    });

    // 3. Casos especiales: Si ya tiene sesión, permitir login/register SOLO si hay un token de invitación
    const hasToken = request.nextUrl.searchParams.has('token') || request.nextUrl.searchParams.has('invite_token');

    if (isPublicRoute) {
      // ✅ Si es login/register y ya tiene sesión -> Dashboard
      if ((pathname.startsWith('/auth/login') || pathname.startsWith('/auth/register')) && !hasToken) {
        return NextResponse.redirect(new URL('/dashboard', request.url));
      }
      // ✅ Para cualquier otra ruta pública (como / o /landing), permitir incluso con sesión
      return NextResponse.next();
    }

    return NextResponse.next();

  } catch (error) {
    // ❌ Firma inválida (cookie manipulada, expirada o clave secreta cambiada)
    console.warn('⚠️ [middleware] Cookie de sesión inválida, eliminando y redirigiendo a login.');

    const response = NextResponse.redirect(new URL('/auth/login', request.url));
    response.cookies.delete('session');
    return response;
  }
}

// Configuration for which paths the middleware should apply to.
export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};