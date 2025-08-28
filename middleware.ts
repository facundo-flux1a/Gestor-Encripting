import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/services/auth-service';

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - auth/login (login page)
     * - auth/register (register page)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|auth/login|auth/register).*)',
  ],
};

export async function middleware(request: NextRequest) {
  try {
    const session = await getSession();
    const { pathname } = request.nextUrl;

    // If there's no session and the user is not on an auth page, redirect to login
    if (!session) {
      const url = request.nextUrl.clone();
      url.pathname = '/auth/login';
      url.searchParams.set('redirect', pathname); // Optional: save redirect path
      return NextResponse.redirect(url);
    }

    // If there is a session and the user is on the root path, redirect to dashboard
    if (session && pathname === '/') {
      const url = request.nextUrl.clone();
      url.pathname = '/dashboard';
      return NextResponse.redirect(url);
    }

    // If there is a session and the user is trying to access auth pages, redirect to dashboard
    if (session && (pathname === '/auth/login' || pathname === '/auth/register')) {
      const url = request.nextUrl.clone();
      url.pathname = '/dashboard';
      return NextResponse.redirect(url);
    }

    // Allow the request to continue
    return NextResponse.next();
  } catch (error) {
    // If there's an error getting the session, redirect to login
    console.error('Middleware error:', error);
    const url = request.nextUrl.clone();
    url.pathname = '/auth/login';
    return NextResponse.redirect(url);
  }
}