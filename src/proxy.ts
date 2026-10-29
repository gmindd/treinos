import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_SESSAO, tokenValido } from "@/lib/auth/sessao";

// Rotas acessíveis sem sessão. O webhook do Strava valida-se a si próprio (verify_token
// na subscrição; os eventos só desencadeiam pedidos ao Strava). O MCP (fase 7) terá OAuth.
const PUBLICAS = ["/login", "/api/health", "/api/strava/webhook"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLICAS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  const token = request.cookies.get(COOKIE_SESSAO)?.value;
  if (tokenValido(token, process.env.SESSION_SECRET ?? "")) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ erro: "não autenticado" }, { status: 401 });
  }
  const url = new URL("/login", request.url);
  if (pathname !== "/") url.searchParams.set("seguinte", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon|manifest).*)"],
};
