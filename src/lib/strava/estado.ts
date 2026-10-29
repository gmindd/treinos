// Estado da ligação ao Strava para mostrar na UI.
import { and, count, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { atividade, stravaConta } from "@/db/schema";
import { fila, FILAS } from "@/lib/fila";
import { lerEstado } from "@/lib/sistema";
import { configStrava, ESTADO_ERRO, ESTADO_LIMITES } from "./api";
import { pausaAte, type EstadoLimites } from "./limites";
import { ESTADO_SINCRONIZACAO, ESTADO_WEBHOOK, type EstadoWebhook } from "./sincronizar";

export type EstadoSincronizacao = {
  tipo: "backfill" | "reconciliacao";
  desde: string;
  listadas: number;
  enfileiradas: number;
  em: string;
};

export async function estadoStrava(db: Db) {
  const [[conta], [totais], [comStreams], sincronizacao, webhook, erro, limites] = await Promise.all([
    db.select({ athleteId: stravaConta.athleteId }).from(stravaConta).limit(1),
    db.select({ n: count() }).from(atividade).where(eq(atividade.apagada, false)),
    db
      .select({ n: count() })
      .from(atividade)
      .where(and(eq(atividade.apagada, false), eq(atividade.estadoStreams, "ok"))),
    lerEstado<EstadoSincronizacao>(db, ESTADO_SINCRONIZACAO),
    lerEstado<EstadoWebhook>(db, ESTADO_WEBHOOK),
    lerEstado<string>(db, ESTADO_ERRO),
    lerEstado<EstadoLimites>(db, ESTADO_LIMITES),
  ]);

  // Jobs ainda por fazer (contagem do último ciclo de monitorização do pg-boss).
  let naFila: number | null = null;
  try {
    const q = await (await fila()).getQueue(FILAS.stravaAtividade);
    naFila = q ? q.queuedCount + q.activeCount : 0;
  } catch {
    naFila = null;
  }

  return {
    configurado: configStrava() !== null,
    athleteId: conta?.athleteId ?? null,
    atividades: totais.n,
    comStreams: comStreams.n,
    naFila,
    sincronizacao,
    webhook,
    erro,
    pausaAte: pausaAte(limites, new Date()),
  };
}
