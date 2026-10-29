// Jobs do Strava: importação de atividades, backfill, reconciliação diária e webhook.
import { eq } from "drizzle-orm";
import type { Job, PgBoss } from "pg-boss";
import { db } from "@/db/client";
import { stravaConta, webhookEvento } from "@/db/schema";
import { ATRASO_RECALCULO_S, FILAS, opcoesAtividade, type DadosAtividade } from "@/lib/fila";
import { configStrava, LimiteStrava } from "@/lib/strava/api";
import {
  garantirSubscricao,
  importarAtividade,
  INICIO_BACKFILL,
  sincronizarDesde,
} from "@/lib/strava/sincronizar";

const DIAS_RECONCILIACAO = 30;

async function contaLigada() {
  const [conta] = await db().select({ id: stravaConta.athleteId }).from(stravaConta).limit(1);
  return Boolean(conta) && configStrava() !== null;
}

export async function registarJobsStrava(boss: PgBoss) {
  const opcoes = { policy: "stately" as const, retryLimit: 5, retryDelay: 60, retryBackoff: true };
  await boss.createQueue(FILAS.stravaAtividade, { ...opcoes, expireInSeconds: 300 });
  await boss.createQueue(FILAS.stravaBackfill, { ...opcoes, expireInSeconds: 900 });
  await boss.createQueue(FILAS.stravaReconciliar, { ...opcoes, expireInSeconds: 900 });
  await boss.createQueue(FILAS.stravaSubscricao, { ...opcoes, retryDelay: 300 });

  const enfileirar = async (ids: number[]) => {
    for (const id of ids) {
      await boss.send(FILAS.stravaAtividade, { stravaId: id } satisfies DadosAtividade, opcoesAtividade(id));
    }
  };

  /** Limite de pedidos: volta a pôr o job na fila para quando o Strava deixar. */
  const adiar = async (fila: string, dados: object, e: LimiteStrava, extra: object = {}) => {
    console.log(`[strava] limite de pedidos; ${fila} adiado para ${e.ate.toISOString()}`);
    await boss.send(fila, dados, { ...extra, startAfter: e.ate });
  };

  await boss.work<DadosAtividade>(FILAS.stravaAtividade, async ([job]: Job<DadosAtividade>[]) => {
    const { stravaId, eventoId } = job.data;
    try {
      const r = await importarAtividade(db(), stravaId);
      console.log(`[strava] atividade ${stravaId}: ${r}`);
      await boss.sendAfter(FILAS.recalcular, {}, null, ATRASO_RECALCULO_S);
      if (eventoId) {
        await db().update(webhookEvento).set({ processadoEm: new Date(), erro: null }).where(eq(webhookEvento.id, eventoId));
      }
    } catch (e) {
      if (e instanceof LimiteStrava) return adiar(FILAS.stravaAtividade, job.data, e, opcoesAtividade(stravaId));
      if (eventoId) {
        await db().update(webhookEvento).set({ erro: String(e) }).where(eq(webhookEvento.id, eventoId));
      }
      throw e;
    }
  });

  await boss.work(FILAS.stravaBackfill, async () => {
    try {
      const r = await sincronizarDesde(db(), INICIO_BACKFILL, "backfill", enfileirar);
      console.log(`[strava] backfill: ${r.listadas} no Strava, ${r.enfileiradas} na fila`);
    } catch (e) {
      if (e instanceof LimiteStrava) return adiar(FILAS.stravaBackfill, {}, e);
      throw e;
    }
  });

  await boss.work(FILAS.stravaReconciliar, async () => {
    if (!(await contaLigada())) return;
    const desde = new Date(Date.now() - DIAS_RECONCILIACAO * 24 * 60 * 60 * 1000);
    try {
      const r = await sincronizarDesde(db(), desde, "reconciliacao", enfileirar);
      console.log(`[strava] reconciliação: ${r.listadas} no Strava, ${r.enfileiradas} na fila`);
    } catch (e) {
      if (e instanceof LimiteStrava) return adiar(FILAS.stravaReconciliar, {}, e);
      throw e;
    }
  });

  await boss.work(FILAS.stravaSubscricao, async () => {
    const r = await garantirSubscricao(db());
    console.log(`[strava] webhook: ${r.ativo ? `ativo (subscrição ${r.id})` : r.motivo}`);
  });

  await boss.schedule(FILAS.stravaReconciliar, "30 4 * * *", null, { tz: "Europe/Lisbon" });

  // Ao arrancar (ex.: depois de um deploy) confirma o webhook.
  if (await contaLigada()) await boss.send(FILAS.stravaSubscricao, {});
}
