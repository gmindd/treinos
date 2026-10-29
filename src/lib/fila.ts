// Filas pg-boss partilhadas entre o worker (que as cria e processa) e o web (que só envia).
import { PgBoss } from "pg-boss";
import { env } from "@/lib/env";

export const FILAS = {
  heartbeat: "heartbeat",
  /** Importar uma atividade (detalhe + streams). singletonKey = strava id. */
  stravaAtividade: "strava-atividade",
  /** Backfill desde 01/01/2026 (depois de ligar o Strava). */
  stravaBackfill: "strava-backfill",
  /** Reconciliação diária dos últimos 30 dias. */
  stravaReconciliar: "strava-reconciliar",
  /** Criar/confirmar a subscrição do webhook. */
  stravaSubscricao: "strava-subscricao",
  /** Recalcular métricas e carga (depois de importar atividades ou mudar constantes). */
  recalcular: "calculo-recalcular",
} as const;

/** Espera antes de recalcular: junta várias importações seguidas num só cálculo. */
export const ATRASO_RECALCULO_S = 30;

export type DadosAtividade = { stravaId: number; eventoId?: number };

export function opcoesAtividade(stravaId: number) {
  return { singletonKey: String(stravaId) };
}

const global = globalThis as unknown as { __fila?: Promise<PgBoss> };

/** Instância só para enviar jobs a partir do web (sem supervisão nem cron). */
export function fila(): Promise<PgBoss> {
  if (!global.__fila) {
    global.__fila = (async () => {
      const boss = new PgBoss({
        connectionString: env().DATABASE_URL,
        schema: "pgboss",
        supervise: false,
        schedule: false,
      });
      boss.on("error", (e) => console.error("[fila] erro pg-boss:", e));
      await boss.start();
      return boss;
    })().catch((e) => {
      global.__fila = undefined;
      throw e;
    });
  }
  return global.__fila;
}
