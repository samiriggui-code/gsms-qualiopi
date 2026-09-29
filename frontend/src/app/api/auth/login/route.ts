import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { API_URL, TOKEN_COOKIE } from "@/lib/server-config";

// Le jeton reste dans un cookie httpOnly : le code du navigateur ne le voit jamais.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const res = await fetch(`${API_URL}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: body.email ?? "", password: body.password ?? "" }),
    cache: "no-store",
  }).catch(() => null);
  if (res === null) {
    return NextResponse.json({ detail: "Serveur GSMS injoignable" }, { status: 503 });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json({ detail: data.detail ?? "Identifiants invalides" }, { status: res.status });
  }
  (await cookies()).set(TOKEN_COOKIE, data.access_token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return NextResponse.json({ user: data.user });
}
