import { NextResponse } from "next/server";

import { API_URL } from "@/lib/server-config";

// Relais public (sans session) : questionnaire et documents d'un stagiaire, ouverts par un lien signé.
// Seules ces deux ressources passent ; le lien lui-même est vérifié par l'API.
const OPEN = new Set(["questionnaires", "documents"]);

async function relay(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  if (path.length !== 2 || !OPEN.has(path[0])) {
    return NextResponse.json({ error: "not_found", detail: "Lien invalide" }, { status: 404 });
  }
  const target = `${API_URL}/api/v1/public/${path.map(encodeURIComponent).join("/")}`;
  const res = await fetch(target, {
    method: request.method,
    headers: request.method === "POST" ? { "Content-Type": "application/json" } : undefined,
    body: request.method === "POST" ? await request.arrayBuffer() : undefined,
    cache: "no-store",
  }).catch(() => null);
  if (res === null) {
    return NextResponse.json({ error: "unreachable", detail: "Service momentanément indisponible" }, { status: 503 });
  }
  const out = new Headers({ "Cache-Control": "no-store", "X-Robots-Tag": "noindex" });
  for (const h of ["content-type", "content-disposition", "x-content-sha256"]) {
    const v = res.headers.get(h);
    if (v) out.set(h, v);
  }
  return new NextResponse(res.body, { status: res.status, headers: out });
}

export { relay as GET, relay as POST };
