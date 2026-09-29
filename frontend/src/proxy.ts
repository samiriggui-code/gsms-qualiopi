import { NextResponse, type NextRequest } from "next/server";

// Sans cookie de session, les écrans de l'application renvoient vers la connexion.
export function proxy(request: NextRequest) {
  if (!request.cookies.get("gsms_session")) {
    const login = new URL("/connexion", request.url);
    login.searchParams.set("suite", request.nextUrl.pathname);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/sessions/:path*", "/aujourdhui/:path*"],
};
