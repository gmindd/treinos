// Leituras das previsões para a UI.
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { meta, previsaoSnapshot } from "@/db/schema";
import type { backtestBtt } from "@/lib/analysis/previsao-btt";
import type { backtestCorrida } from "@/lib/analysis/previsao-corrida";
import { lerEstado } from "@/lib/sistema";
import { ESTADO_BACKTESTS, VERSAO_PREVISAO } from "./calcular";

export type Backtests = {
  em: string;
  versao: string;
  corrida: ReturnType<typeof backtestCorrida>;
  btt: ReturnType<typeof backtestBtt>[];
  dados: {
    corridas: number;
    voltas: number;
    voltasExcluidas: { data: string; nome: string; motivo: string }[];
    zwift: number;
    zwiftComJanelas: number;
  };
};

export const lerBacktests = (db: Db) => lerEstado<Backtests>(db, ESTADO_BACKTESTS);

/** Estimativa dos próximos dias sem treinar (guardada no snapshot de hoje). */
export type Descanso = {
  hoje: { data: string; ctl: number; atl: number } | null;
  dias: { data: string; ctl: number; atl: number; tsb: number; fator: number; tempoS: number }[];
};

/** Critério de aceitação: corrida (fase 3) erro mediano < 3%; BTT (fase 4) todas as provas < 4%. */
export function estadoValidacao(b: Backtests | null, tipo: "corrida" | "btt") {
  if (!b) return { passou: null, texto: "Backtest ainda não corrido." };
  if (tipo === "corrida") {
    const e = b.corrida.erroMedianoAbs;
    if (b.corrida.avaliados < 3) {
      return { passou: null, texto: `Backtest inconclusivo: só ${b.corrida.avaliados} esforço(s) forte(s) com dados anteriores.` };
    }
    return e != null && e < 0.03
      ? { passou: true, texto: `Backtest OK: erro mediano ${(e * 100).toFixed(1)}%.` }
      : { passou: false, texto: `Backtest falhou: erro mediano ${((e ?? 0) * 100).toFixed(1)}% (critério < 3%).` };
  }
  if (b.btt.length === 0) return { passou: null, texto: "Backtest sem provas." };
  const piores = b.btt.filter((c) => c.erro == null || Math.abs(c.erro) >= 0.04);
  return piores.length === 0
    ? { passou: true, texto: "Backtest OK: todas as provas a menos de 4%." }
    : {
        passou: false,
        texto: `Backtest falhou: ${b.btt.map((c) => `${c.prova.nome} ${c.erro != null ? `${(c.erro * 100).toFixed(1)}%` : "sem previsão"}`).join(" · ")} (critério < 4%).`,
      };
}

export async function previsoesMetas(db: Db) {
  const metas = await db.select().from(meta).where(eq(meta.ativa, true)).orderBy(asc(meta.dataProva));
  if (metas.length === 0) return [];
  const snaps = await db
    .select({
      metaId: previsaoSnapshot.metaId,
      data: previsaoSnapshot.data,
      suficiente: previsaoSnapshot.suficiente,
      hojeS: previsaoSnapshot.hojeS,
      hojeP10S: previsaoSnapshot.hojeP10S,
      hojeP90S: previsaoSnapshot.hojeP90S,
      projecaoS: previsaoSnapshot.projecaoS,
      projecaoP10S: previsaoSnapshot.projecaoP10S,
      projecaoP90S: previsaoSnapshot.projecaoP90S,
      probAlvo: previsaoSnapshot.probAlvo,
      descanso: sql<Descanso | null>`${previsaoSnapshot.detalhes}->'descanso'`,
    })
    .from(previsaoSnapshot)
    .where(and(inArray(previsaoSnapshot.metaId, metas.map((m) => m.id)), eq(previsaoSnapshot.versaoModelo, VERSAO_PREVISAO)))
    .orderBy(asc(previsaoSnapshot.data));
  return metas.map((m) => {
    const proprios = snaps.filter((s) => s.metaId === m.id);
    return {
      meta: m,
      ultimo: proprios.at(-1) ?? null,
      descanso: proprios.at(-1)?.descanso ?? null,
      historico: proprios.map((s) => ({ data: s.data, hoje: s.hojeS, projecao: s.projecaoS })),
    };
  });
}

/** Snapshot mais recente com os detalhes completos. */
export async function previsaoDetalhada(db: Db, metaId: number) {
  const [s] = await db
    .select()
    .from(previsaoSnapshot)
    .where(and(eq(previsaoSnapshot.metaId, metaId), eq(previsaoSnapshot.versaoModelo, VERSAO_PREVISAO)))
    .orderBy(desc(previsaoSnapshot.data))
    .limit(1);
  return s ?? null;
}
