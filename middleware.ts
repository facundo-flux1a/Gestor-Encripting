
import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/services/auth-service';

// Define las rutas que no requieren autenticación
const publicRoutes = ['/auth/login', '/auth/register'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Comprueba si la ruta actual es una de las rutas públicas
  const isPublicRoute = publicRoutes.some(route => pathname.startsWith(route));

  // Obtiene la sesión del usuario
  const session = await getSession();

  // Si la ruta es pública
  if (isPublicRoute) {
    // Si hay una sesión activa y el usuario intenta acceder a una ruta pública,
    // redirigir al dashboard
    if (session) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
    // Si no hay sesión, permite el acceso a la ruta pública
    return NextResponse.next();
  }

  // Si la ruta no es pública y no hay sesión, redirigir a la página de login
  if (!session) {
    // Guarda la URL a la que intentaba acceder para redirigir después del login
    const loginUrl = new URL('/auth/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Si hay sesión y la ruta es la raíz, redirigir al dashboard
  if (pathname === '/') {
      return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // Si hay sesión y no es una ruta pública, permite el acceso
  return NextResponse.next();
}

// Configura el middleware para que se ejecute en todas las rutas excepto las estáticas
export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
