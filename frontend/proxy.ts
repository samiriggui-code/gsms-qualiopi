import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/lib/session';

// Redirige vers /signin tant qu'aucune session n'existe.
// La validité du jeton est vérifiée par l'API à chaque appel (401 → purge du cookie).
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSession = request.cookies.has(SESSION_COOKIE);

  if (pathname === '/signin') {
    return hasSession
      ? NextResponse.redirect(new URL('/', request.url))
      : NextResponse.next();
  }

  if (!hasSession) {
    const url = new URL('/signin', request.url);
    url.searchParams.set('callbackUrl', `${pathname}${search}`);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api/|_next/|media/|favicon.ico).*)'],
};
