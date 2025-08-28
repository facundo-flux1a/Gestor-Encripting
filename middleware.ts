
import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/services/auth-service';

const publicRoutes = ['/auth/login', '/auth/register'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = await getSession();

  const isPublicRoute = publicRoutes.some(route => pathname.startsWith(route));
  const isProtectedRoute = !isPublicRoute;

  // Si el usuario está autenticado
  if (session) {
    // Si intenta acceder a una ruta pública (login/register) o la raíz, redirigir al dashboard
    if (isPublicRoute || pathname === '/') {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
    // Si está en una ruta protegida, permitir el acceso
    return NextResponse.next();
  }

  // Si el usuario NO está autenticado
  if (isProtectedRoute) {
    // Si intenta acceder a una ruta protegida, redirigir a login
    const loginUrl = new URL('/auth/login', request.url);
    loginUrl.searchParams.set('redirect', pathname); // Opcional: para redirigir después del login
    return NextResponse.redirect(loginUrl);
  }

  // Si no está autenticado y está en una ruta pública, permitir acceso
  return NextResponse.next();
}

// Configura el middleware para que se ejecute en todas las rutas excepto las estáticas
export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
