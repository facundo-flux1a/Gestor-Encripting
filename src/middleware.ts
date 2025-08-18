
import { NextResponse, type NextRequest } from 'next/server';

const protectedRoutes = ['/dashboard', '/documents', '/incidents', '/proveedores', '/settings'];
const publicRoutes = ['/auth/login'];

// This middleware is now simplified to only handle redirects based on cookie presence,
// without decrypting the session, to avoid pulling server-side libraries into the edge runtime.
export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isProtectedRoute = protectedRoutes.some((route) => path.startsWith(route)) || path === '/';
  const hasSessionCookie = request.cookies.has('session');

  // If trying to access a protected route without a session cookie, redirect to login
  if (isProtectedRoute && !hasSessionCookie) {
    return NextResponse.redirect(new URL('/auth/login', request.nextUrl));
  }

  // If logged in (has session cookie)
  if (hasSessionCookie) {
    // If on a public route like login, redirect to dashboard
    if (publicRoutes.includes(path)) {
      return NextResponse.redirect(new URL('/dashboard', request.nextUrl));
    }
    // If at the root, redirect to dashboard
    if (path === '/') {
      return NextResponse.redirect(new URL('/dashboard', request.nextUrl));
    }
  }

  return NextResponse.next();
}

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
};
