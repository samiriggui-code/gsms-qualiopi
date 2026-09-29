import { NextRequest, NextResponse } from 'next/server';
import { API_URL, SESSION_COOKIE } from '@/lib/session';

// Proxy authentifié vers l'API FastAPI : /api/backend/v1/... → {API_URL}/api/v1/...
// Ajoute le Bearer lu dans le cookie de session.
async function proxy(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const url = `${API_URL}/api/${path.join('/')}${request.nextUrl.search}`;

  const headers = new Headers();
  const contentType = request.headers.get('content-type');
  if (contentType) headers.set('content-type', contentType);
  if (token) headers.set('authorization', `Bearer ${token}`);

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: request.method,
      headers,
      body: ['GET', 'HEAD'].includes(request.method)
        ? undefined
        : await request.arrayBuffer(),
    });
  } catch {
    return NextResponse.json(
      { detail: "L'API est injoignable." },
      { status: 502 },
    );
  }

  const response = new NextResponse(upstream.body, {
    status: upstream.status,
    headers: {
      'content-type':
        upstream.headers.get('content-type') ?? 'application/json',
    },
  });
  // Jeton expiré ou invalide : on purge la session
  if (upstream.status === 401) response.cookies.delete(SESSION_COOKIE);
  return response;
}

export {
  proxy as GET,
  proxy as POST,
  proxy as PUT,
  proxy as PATCH,
  proxy as DELETE,
};
