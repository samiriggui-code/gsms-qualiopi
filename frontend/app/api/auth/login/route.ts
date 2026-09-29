import { NextRequest, NextResponse } from 'next/server';
import { API_URL, SESSION_COOKIE, SESSION_MAX_AGE } from '@/lib/session';

export async function POST(request: NextRequest) {
  const { email, password, rememberMe } = await request.json();

  let upstream: Response;
  try {
    upstream = await fetch(`${API_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    return NextResponse.json(
      { detail: "L'API est injoignable." },
      { status: 502 },
    );
  }

  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    return NextResponse.json(
      { detail: data.detail ?? 'Connexion impossible.' },
      { status: upstream.status },
    );
  }

  const response = NextResponse.json({ user: data.user });
  response.cookies.set(SESSION_COOKIE, data.access_token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    // Sans « se souvenir de moi », cookie de session (supprimé à la fermeture du navigateur)
    ...(rememberMe ? { maxAge: SESSION_MAX_AGE } : {}),
  });
  return response;
}
