
import { NextResponse, type NextRequest } from 'next/server';
import { decrypt } from '@/services/auth-service';

const protectedRoutes = ['/dashboard', '/documents', '/incidents', '/proveedores', '/settings'];
const publicRoutes = ['/auth/login'];

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isProtectedRoute = protectedRoutes.some((route) => path.startsWith(route)) || path === '/';

  const sessionCookie = request.cookies.get('session')?.value;
  let sessionPayload: { user: any; expires: Date } | null = null;
  
  if (sessionCookie) {
    sessionPayload = await decrypt(sessionCookie);
  }

  if (isProtectedRoute && !sessionPayload?.user) {
    // Redirect to login if trying to access a protected route without a session
    return NextResponse.redirect(new URL('/auth/login', request.nextUrl));
  }

  if (sessionPayload?.user) {
     if (publicRoutes.includes(path)) {
        // If logged in, redirect from login page to dashboard
        return NextResponse.redirect(new URL('/dashboard', request.nextUrl));
     }
     if (path === '/') {
        // If logged in and at root, redirect to dashboard
        return NextResponse.redirect(new URL('/dashboard', request.nextUrl));
     }
  }
  
  if (!isProtectedRoute && !sessionPayload?.user && path !== '/auth/login') {
     // If not logged in and not on login page, redirect to login
     // This handles cases like trying to access non-existent public pages
     return NextResponse.redirect(new URL('/auth/login', request.nextUrl));
  }
  
  return NextResponse.next();
}

// See "Matching Paths" below to learn more
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
}
