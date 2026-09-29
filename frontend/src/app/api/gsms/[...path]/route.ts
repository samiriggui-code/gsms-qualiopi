import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { API_URL, TOKEN_COOKIE } from "@/lib/server-config";

// Relais vers l'API GSMS : ajoute le jeton du cookie, renvoie la réponse telle quelle (JSON ou fichier).
async function relay(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const token = (await cookies()).get(TOKEN_COOKIE)?.value;
  if (!token) {
    return NextResponse.json(
      { error: "unauthenticated", detail: "Session expirée : reconnectez-vous" },
      { status: 401 },
    );
  }
  const { path } = await params;
  const url = new URL(request.url);
  const target = `${API_URL}/api/v1/${path.map(encodeURIComponent).join("/")}${url.search}`;
  const headers: HeadersInit = { Authorization: `Bearer ${token}` };
  const contentType = request.headers.get("content-type");
  if (contentType) headers["Content-Type"] = contentType;
  const hasBody = !["GET", "HEAD"].includes(request.method);
  const res = await fetch(target, {
    method: request.method,
    headers,
    body: hasBody ? await request.arrayBuffer() : undefined,
    cache: "no-store",
  }).catch(() => null);
  if (res === null) {
    return NextResponse.json({ error: "unreachable", detail: "Serveur GSMS injoignable" }, { status: 503 });
  }
  const out = new Headers();
  for (const h of ["content-type", "content-disposition", "x-content-sha256"]) {
    const v = res.headers.get(h);
    if (v) out.set(h, v);
  }
  return new NextResponse(res.body, { status: res.status, headers: out });
}

export { relay as GET, relay as POST, relay as PUT, relay as PATCH, relay as DELETE };
