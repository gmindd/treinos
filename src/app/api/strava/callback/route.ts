import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db/client";
import { env } from "@/lib/env";
import { fila, FILAS } from "@/lib/fila";
import { COOKIE_ESTADO_OAUTH, ligarConta } from "@/lib/strava/api";

/** Regresso do OAuth do Strava: guarda os tokens e arranca o backfill e o webhook. */
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const voltar = (resultado: string) => {
    const r = NextResponse.redirect(new URL(`/?strava=${resultado}`, env().APP_URL));
    r.cookies.delete({ name: COOKIE_ESTADO_OAUTH, path: "/api/strava" });
    return r;
  };

  const estado = request.cookies.get(COOKIE_ESTADO_OAUTH)?.value;
  if (!estado || estado !== p.get("state")) return voltar("erro_estado");
  if (p.get("error")) return voltar("recusado");

  const codigo = p.get("code");
  const scope = p.get("scope") ?? "";
  if (!codigo) return voltar("erro");
  if (!scope.split(",").includes("activity:read_all")) return voltar("sem_permissao");

  try {
    await ligarConta(db(), codigo, scope);
    const boss = await fila();
    await boss.send(FILAS.stravaBackfill, {});
    await boss.send(FILAS.stravaSubscricao, {});
  } catch (e) {
    console.error("[strava] falhou a ligação:", e);
    return voltar("erro");
  }
  return voltar("ligado");
}
