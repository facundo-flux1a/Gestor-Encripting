import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify, SignJWT, type JWTPayload } from 'jose';
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_S,
  SESSION_RENEW_WHEN_REMAINING_S,
  sessionCookieOptions,
} from '@/lib/session-config';

// ✅ AGREGAR las rutas de reset password
const publicRoutes = [
  '/',
  '/landing',
  '/auth/login',
  '/auth/register',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/accept-invitation',
  '/auth/2fa',
  '/auth/verify-email',
  '/legal(.*)',
];
const rootRoute = '/';

/**
 * Ventana deslizante: si a la sesión le queda poco, se reemite con la duración
 * completa sobre la respuesta que ya íbamos a devolver. Mientras el usuario
 * siga usando la app no lo desloguea nunca; si la deja de usar 30 días, caduca.
 *
 * Se conservan todos los claims (userId, flags de tutorial, organization_rol);
 * sólo se reemplazan iat/exp.
 */
async function renovarSesionSiHaceFalta(
  response: NextResponse,
  payload: JWTPayload,
  secretKey: Uint8Array
): Promise<NextResponse> {
  const ahoraS = Math.floor(Date.now() / 1000);
  const exp = typeof payload.exp === 'number' ? payload.exp : 0;

  // Todavía le sobra vida: no tocamos nada (evita un Set-Cookie por request).
  if (exp - ahoraS > SESSION_RENEW_WHEN_REMAINING_S) return response;

  const { iat, exp: _exp, nbf, ...claims } = payload;
  const nuevoExp = ahoraS + SESSION_MAX_AGE_S;

  try {
    const renovada = await new SignJWT(claims)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(nuevoExp)
      .sign(secretKey);

    response.cookies.set(SESSION_COOKIE_NAME, renovada, {
      ...sessionCookieOptions,
      expires: new Date(nuevoExp * 1000),
    });
  } catch (error) {
    // Si falla la refirma, seguimos con la cookie vieja: sigue siendo válida
    // hasta su exp original. Nunca romper la navegación por esto.
    console.warn('⚠️ [middleware] No se pudo renovar la sesión:', error);
  }

  return response;
}

/**
 * Middleware to protect routes by checking for the presence of a session cookie.
 * This middleware is designed to be lightweight and compatible with the Edge runtime.
 * It does not validate the JWT, only checks for its existence. The actual validation
 * happens in Server Components or API routes running in the Node.js environment.
 */
export async function middleware(request: NextRequest) {
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME);
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
    const { payload } = await jwtVerify(sessionCookie.value, secretKey, {
      algorithms: ['HS256'],
    });

    // 3. Casos especiales: Si ya tiene sesión, permitir login/register SOLO si hay un token de invitación
    const hasToken = request.nextUrl.searchParams.has('token') || request.nextUrl.searchParams.has('invite_token');

    if (isPublicRoute) {
      // ✅ Si es login/register y ya tiene sesión -> Dashboard (salvo si viene con ?logout=true o ?force=true)
      const isForceLogin = request.nextUrl.searchParams.has('logout') || request.nextUrl.searchParams.has('force');
      if ((pathname.startsWith('/auth/login') || pathname.startsWith('/auth/register')) && !hasToken && !isForceLogin) {
        return renovarSesionSiHaceFalta(
          NextResponse.redirect(new URL('/dashboard', request.url)),
          payload,
          secretKey
        );
      }
      // ✅ Para cualquier otra ruta pública (como / o /landing), permitir incluso con sesión
      return renovarSesionSiHaceFalta(NextResponse.next(), payload, secretKey);
    }

    return renovarSesionSiHaceFalta(NextResponse.next(), payload, secretKey);

  } catch (error) {
    // ❌ Firma inválida (cookie manipulada, expirada o clave secreta cambiada)
    console.warn('⚠️ [middleware] Cookie de sesión inválida, eliminando y redirigiendo a login.');

    const response = NextResponse.redirect(new URL('/auth/login', request.url));
    response.cookies.delete(SESSION_COOKIE_NAME);
    return response;
  }
}

// Configuration for which paths the middleware should apply to.
// Excludes: API routes, Next.js internals, and any path with a file extension (static assets)
export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};