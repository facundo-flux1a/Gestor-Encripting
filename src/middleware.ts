
'use server';

import { NextResponse, type NextRequest } from 'next/server';

const protectedRoutes = ['/dashboard', '/documents', '/incidents', '/proveedores', '/settings'];
const publicRoutes = ['/auth/login'];

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isProtectedRoute = protectedRoutes.some((route) => path.startsWith(route)) || path === '/';

  const sessionCookie = request.cookies.get('session')?.value;

  if (isProtectedRoute && !sessionCookie) {
    // Redirect to login if trying to access a protected route without a session
    return NextResponse.redirect(new URL('/auth/login', request.nextUrl));
  }

  if (sessionCookie) {
     if (publicRoutes.includes(path)) {
        // If logged in, redirect from login page to dashboard
        return NextResponse.redirect(new URL('/dashboard', request.nextUrl));
     }
     if (path === '/') {
        // If logged in and at root, redirect to dashboard
        return NextResponse.redirect(new URL('/dashboard', request.nextUrl));
     }
  }
  
  // Allow access to public routes if not logged in.
  // The case of a logged-in user trying to access /auth/login is handled above.
  if (!isProtectedRoute) {
    return NextResponse.next();
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
