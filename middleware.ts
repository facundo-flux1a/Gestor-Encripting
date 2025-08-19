
import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/services/auth-service';

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|auth/login|auth/register).*)'],
};

export async function middleware(request: NextRequest) {
  const session = await getSession();
  const { pathname } = request.nextUrl;

  // If there's no session and the user is not on the login/register page, redirect them.
  if (!session) {
    const url = request.nextUrl.clone();
    url.pathname = '/auth/login';
    return NextResponse.redirect(url);
  }

  // If there is a session and the user is on the root path, redirect to dashboard.
  if (session && pathname === '/') {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}
