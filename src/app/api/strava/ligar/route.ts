import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { COOKIE_ESTADO_OAUTH, configStrava, urlAutorizacao } from "@/lib/strava/api";

/** Início do OAuth: redireciona para a página de autorização do Strava. */
export async function GET() {
  if (!configStrava()) {
    return NextResponse.redirect(new URL("/?strava=sem_config", env().APP_URL));
  }
  const estado = randomBytes(16).toString("base64url");
  const resposta = NextResponse.redirect(urlAutorizacao(estado));
  resposta.cookies.set(COOKIE_ESTADO_OAUTH, estado, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/strava",
    maxAge: 10 * 60,
  });
  return resposta;
}
