
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const publicRoutes = ['/auth/login', '/auth/register'];
const rootRoute = '/';

/**
 * Middleware to protect routes by checking for the presence of a session cookie.
 * This middleware is designed to be lightweight and compatible with the Edge runtime.
 * It does not validate the JWT, only checks for its existence. The actual validation
 * happens in Server Components or API routes running in the Node.js environment.
 */
export function middleware(request: NextRequest) {
  const sessionCookie = request.cookies.get('session');
  const { pathname } = request.nextUrl;

  const isPublicRoute = publicRoutes.includes(pathname);

  // If the user has a session cookie
  if (sessionCookie) {
    // If they are on a public route (login/register) or the root page, redirect to the document page.
    if (isPublicRoute || pathname === rootRoute) {
      return NextResponse.redirect(new URL('/documento/94', request.url));
    }
  } 
  // If the user does not have a session cookie
  else {
    // If they are trying to access any page that isn't public, redirect to login.
    if (!isPublicRoute) {
      return NextResponse.redirect(new URL('/auth/login', request.url));
    }
  }

  // Allow the request to proceed if no redirection is needed.
  return NextResponse.next();
}

// Configuration for which paths the middleware should apply to.
export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};

