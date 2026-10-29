import { eq } from "drizzle-orm";
import { type NextRequest } from "next/server";
import { db } from "@/db/client";
import { stravaConta, webhookEvento } from "@/db/schema";
import { configStrava } from "@/lib/strava/api";
import { fila, FILAS, opcoesAtividade, type DadosAtividade } from "@/lib/fila";
import { eventoWebhook } from "@/lib/strava/tipos";

// Rota pública (sem sessão): o Strava chama-a diretamente.

/** Validação da subscrição: o Strava envia hub.challenge e o verify_token combinado. */
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const token = configStrava()?.verifyToken;
  if (p.get("hub.mode") !== "subscribe" || !token || p.get("hub.verify_token") !== token) {
    return Response.json({ erro: "verificação inválida" }, { status: 403 });
  }
  return Response.json({ "hub.challenge": p.get("hub.challenge") });
}

/**
 * Evento: guarda-o e põe a atividade na fila. Responde logo (o Strava exige < 2 s).
 * Não se confia no conteúdo: o worker pede sempre a atividade ao Strava, por isso um
 * evento falso não consegue alterar nem apagar nada.
 */
export async function POST(request: NextRequest) {
  const corpo = await request.json().catch(() => null);
  const r = eventoWebhook.safeParse(corpo);
  if (!r.success) return Response.json({ erro: "evento inválido" }, { status: 400 });
  const e = r.data;

  const [evento] = await db().insert(webhookEvento).values({ payload: corpo }).returning({ id: webhookEvento.id });
  const [conta] = await db().select({ id: stravaConta.athleteId }).from(stravaConta).limit(1);

  let jobId: string | null = null;
  if (e.object_type === "activity" && conta && e.owner_id === conta.id) {
    const boss = await fila();
    jobId = await boss.send(
      FILAS.stravaAtividade,
      { stravaId: e.object_id, eventoId: evento.id } satisfies DadosAtividade,
      opcoesAtividade(e.object_id),
    );
  }
  // Ignorado (outro atleta, evento de atleta) ou a atividade já estava na fila.
  if (!jobId) {
    await db().update(webhookEvento).set({ processadoEm: new Date() }).where(eq(webhookEvento.id, evento.id));
  }
  return Response.json({ ok: true });
}
