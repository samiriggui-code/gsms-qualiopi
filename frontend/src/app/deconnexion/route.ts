import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { TOKEN_COOKIE } from "@/lib/server-config";

export async function POST(request: Request) {
  (await cookies()).delete(TOKEN_COOKIE);
  return NextResponse.redirect(new URL("/connexion", request.url), { status: 303 });
}
