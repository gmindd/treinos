"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { COOKIE_SESSAO, DURACAO_SESSAO_S, criarToken, passwordCorreta } from "@/lib/auth/sessao";

export type EstadoLogin = { erro?: string };

function destinoSeguro(valor: FormDataEntryValue | null) {
  const s = typeof valor === "string" ? valor : "";
  return s.startsWith("/") && !s.startsWith("//") ? s : "/";
}

export async function entrar(_anterior: EstadoLogin, form: FormData): Promise<EstadoLogin> {
  const { APP_PASSWORD, SESSION_SECRET } = env();
  const tentativa = String(form.get("password") ?? "");

  if (!passwordCorreta(tentativa, APP_PASSWORD)) {
    // Abranda tentativas repetidas.
    await new Promise((r) => setTimeout(r, 800));
    return { erro: "Password errada." };
  }

  (await cookies()).set(COOKIE_SESSAO, criarToken(SESSION_SECRET), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DURACAO_SESSAO_S,
  });
  redirect(destinoSeguro(form.get("seguinte")));
}

export async function sair() {
  (await cookies()).delete(COOKIE_SESSAO);
  redirect("/login");
}
