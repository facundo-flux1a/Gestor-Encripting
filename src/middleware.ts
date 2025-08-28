
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSession } from '@/services/auth-service';

export const runtime = 'nodejs';

const publicRoutes = ['/auth/login', '/auth/register'];
const rootRoute = '/';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Utiliza el servicio de autenticación para obtener la sesión
  const session = await getSession();

  const isPublicRoute = publicRoutes.includes(pathname);

  // Si el usuario está autenticado
  if (session) {
    // Si intenta acceder a una ruta pública (login, register) o a la raíz, redirigir al dashboard
    if (isPublicRoute || pathname === rootRoute) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  } 
  // Si el usuario no está autenticado
  else {
    // Si intenta acceder a una ruta que no es pública, redirigir al login
    if (!isPublicRoute) {
      return NextResponse.redirect(new URL('/auth/login', request.url));
    }
  }

  // Si ninguna de las condiciones de redirección se cumple, permite que la solicitud continúe
  return NextResponse.next();
}

// Configuración para que el middleware se aplique a todas las rutas excepto las estáticas.
export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
