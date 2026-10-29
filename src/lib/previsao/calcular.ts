// Previsões das metas (fases 3 e 4): carrega as atividades com streams, corre os motores
// para cada meta ativa, grava o snapshot de hoje e os semanais em falta, e refaz os backtests.
import { and, asc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import { atividade, meta, previsaoSnapshot } from "@/db/schema";
import { jsonNaData, numeroNaData, type LinhaConstante } from "@/lib/analysis/constantes";
import { diasDesde, somarDias } from "@/lib/analysis/estatistica";
import {
  backtestBtt,
  perfisPacing,
  preparar,
  preverBtt,
  type ParametrosBtt,
  type SessaoZwift,
  type VoltaBtt,
} from "@/lib/analysis/previsao-btt";
import { backtestCorrida, preverCorrida, type SessaoCorrida } from "@/lib/analysis/previsao-corrida";
import { lerConstantes, lerParametros, lerStreams } from "@/lib/calculo/recalcular";
import { dataIsoLisboa } from "@/lib/formato";
import { gravarEstado } from "@/lib/sistema";
import {
  num,
  parametrosBtt,
  parametrosCorrida,
  sessaoCorrida,
  sessaoZwift,
  voltaBtt,
  type InfoAtividade,
  type Parametros,
} from "./entradas";

export const VERSAO_PREVISAO = "fase3-4-1";
export const ESTADO_BACKTESTS = "previsao.backtests";
/** Primeiro snapshot semanal (segunda-feira). */
const INICIO_SNAPSHOTS = "2026-03-02";

type Dados = {
  corridas: SessaoCorrida[];
  voltas: VoltaBtt[];
  zwift: SessaoZwift[];
  stravaParaId: Map<number, number>;
};

async function carregar(db: Db, p: Parametros, pb: ParametrosBtt): Promise<Dados> {
  const atividades = await db
    .select()
    .from(atividade)
    .where(
      and(
        eq(atividade.apagada, false),
        eq(atividade.estadoStreams, "ok"),
        inArray(atividade.modalidade, ["corrida", "btt", "zwift"]),
      ),
    )
    .orderBy(asc(atividade.inicio));
  const d: Dados = { corridas: [], voltas: [], zwift: [], stravaParaId: new Map() };
  for (const a of atividades) {
    const s = await lerStreams(db, a.id);
    if (!s) continue;
    if (a.stravaId) d.stravaParaId.set(a.stravaId, a.id);
    const origem = (a.dadosOrigem ?? {}) as { workout_type?: number | null };
    const info: InfoAtividade = {
      id: a.id,
      data: a.dataLocal,
      nome: a.nome,
      descricao: a.descricao,
      sportType: a.sportType,
      comCriancas: a.comCriancas,
      duracaoMovimentoS: a.duracaoMovimentoS,
      distanciaM: a.distanciaM,
      workoutType: origem.workout_type ?? null,
    };
    if (a.modalidade === "corrida") {
      const x = sessaoCorrida(info, s, p);
      if (x) d.corridas.push(x);
    } else if (a.modalidade === "btt") {
      const x = voltaBtt(info, s, pb);
      if (x) d.voltas.push(x);
    } else if (a.potenciaMedia != null) {
      const x = sessaoZwift(info, s, p);
      if (x) d.zwift.push(x);
    }
  }
  return d;
}

function massa(linhas: LinhaConstante[]) {
  return (data: string) =>
    (numeroNaData(linhas, "peso_kg", data) ?? 79) +
    (numeroNaData(linhas, "massa_bike_kg", data) ?? 12.5) +
    (numeroNaData(linhas, "massa_equipamento_kg", data) ?? 6);
}

/** Segundas-feiras desde o início dos snapshots até `hoje` (exclusivo). */
function semanas(hoje: string): string[] {
  const out: string[] = [];
  for (let d = INICIO_SNAPSHOTS; d < hoje; d = somarDias(d, 7)) out.push(d);
  return out;
}

type Meta = typeof meta.$inferSelect;

type Resumo = {
  suficiente: boolean;
  hoje: { centralS: number; p10: number; p90: number; probAlvo: number } | null;
  projecao: { centralS: number; p10: number; p90: number; probAlvo: number } | null;
  detalhes: Record<string, unknown>;
};

function preverMetaCorrida(m: Meta, d: Dados, ate: string, p: Parametros, completo: boolean): Resumo {
  const pc = parametrosCorrida(p);
  const r = preverCorrida(d.corridas, ate, m.distanciaM ?? 10000, m.tempoAlvoS, m.dataProva, completo ? pc : { ...pc, bootstrapN: 0 });
  return {
    suficiente: r.suficiente,
    hoje: r.hoje,
    projecao: r.projecao,
    detalhes: completo ? { tipo: "corrida", ...r, eficiencia: r.eficiencia } : { tipo: "corrida", a: r.a?.tempoS ?? null, b: r.b?.tempoS ?? null, falta: r.falta },
  };
}

function preverMetaBtt(m: Meta, d: Dados, ate: string, pb: ParametrosBtt, linhas: LinhaConstante[], completo: boolean, cache: Map<number, ReturnType<typeof preparar>>): Resumo {
  const idRef = m.referenciaStravaId ? d.stravaParaId.get(m.referenciaStravaId) : undefined;
  const alvo = idRef != null ? d.voltas.find((v) => v.id === idRef) : undefined;
  if (!alvo) {
    return {
      suficiente: false,
      hoje: null,
      projecao: null,
      detalhes: { tipo: "btt", falta: [`Percurso: falta a atividade de referência (Strava ${m.referenciaStravaId ?? "—"}) com streams.`] },
    };
  }
  const prep = cache.get(m.id) ?? preparar(alvo, d.voltas, pb);
  cache.set(m.id, prep);
  const r = preverBtt(
    prep,
    d.zwift,
    {
      ate,
      dataProva: m.dataProva,
      alvoS: m.tempoAlvoS,
      perfis: perfisPacing(alvo, pb, `Como em ${alvo.data.slice(0, 4)}`),
      refIds: [alvo.id],
      referencia: { tempoS: m.tempoReferenciaS ?? alvo.duracaoMovimentoS, porSeg: alvo.segmentos.map((s) => s.tempoMovS) },
      massa: massa(linhas),
      bootstrap: completo,
    },
    pb,
  );
  const central = r.cenarios[0];
  // Sem bootstrap (snapshots semanais), guarda-se só o valor central.
  const hoje = r.hoje ?? (central.hojeS != null ? { centralS: central.hojeS, p10: NaN, p90: NaN, probAlvo: NaN } : null);
  const projecao = r.projecao ?? (central.projecaoS != null ? { centralS: central.projecaoS, p10: NaN, p90: NaN, probAlvo: NaN } : null);
  const pontos = alvo.grelha.lat.map((la, k) => [la, alvo.grelha.lon[k]]);
  return {
    suficiente: r.suficiente,
    hoje,
    projecao,
    detalhes: completo
      ? { tipo: "btt", ...r, referencia: { id: alvo.id, nome: alvo.nome, data: alvo.data }, mapa: pontos.filter((_, k) => k % 2 === 0) }
      : { tipo: "btt", cenarios: r.cenarios, falta: r.falta },
  };
}

const fin = (x: number | null | undefined) => (x != null && Number.isFinite(x) ? x : null);

export async function recalcularPrevisoes(db: Db) {
  const inicio = Date.now();
  const p = await lerParametros(db);
  const linhas = await lerConstantes(db);
  const hoje = dataIsoLisboa(new Date());
  const zonas = jsonNaData<number[]>(linhas, "zonas_fc", hoje) ?? [124, 154, 169, 184];
  const pb = parametrosBtt(p, zonas[0]);
  const d = await carregar(db, p, pb);
  const metas = await db.select().from(meta).where(eq(meta.ativa, true));
  const existentes = await db
    .select({ metaId: previsaoSnapshot.metaId, data: previsaoSnapshot.data, versao: previsaoSnapshot.versaoModelo })
    .from(previsaoSnapshot);
  const cache = new Map<number, ReturnType<typeof preparar>>();

  let gravados = 0;
  for (const m of metas) {
    const datas = [...semanas(hoje), hoje].filter((x) => x <= m.dataProva);
    for (const data of datas) {
      const completo = data === hoje;
      if (!completo && existentes.some((e) => e.metaId === m.id && e.data === data && e.versao === VERSAO_PREVISAO)) continue;
      // Snapshot de `data` = previsão com os dados até ao fim desse dia.
      const ate = somarDias(data, 1);
      const r = m.tipo === "corrida" ? preverMetaCorrida(m, d, ate, p, completo) : preverMetaBtt(m, d, ate, pb, linhas, completo, cache);
      const valores = {
        versaoModelo: VERSAO_PREVISAO,
        suficiente: r.suficiente,
        hojeS: fin(r.hoje?.centralS),
        hojeP10S: fin(r.hoje?.p10),
        hojeP90S: fin(r.hoje?.p90),
        projecaoS: fin(r.projecao?.centralS),
        projecaoP10S: fin(r.projecao?.p10),
        projecaoP90S: fin(r.projecao?.p90),
        probAlvo: fin(r.projecao?.probAlvo ?? r.hoje?.probAlvo),
        detalhes: r.detalhes,
      };
      await db
        .insert(previsaoSnapshot)
        .values({ metaId: m.id, data, ...valores })
        .onConflictDoUpdate({ target: [previsaoSnapshot.metaId, previsaoSnapshot.data], set: valores });
      gravados++;
    }
  }

  // Backtests (aceitação das fases 3 e 4).
  const corrida = backtestCorrida(d.corridas, num(p, "corrida.backtest_fc_min", 160), parametrosCorrida(p));
  const casosBtt = ((p.get("btt.backtests") as { stravaId: number }[] | undefined) ?? [])
    .map((c) => d.stravaParaId.get(c.stravaId))
    .map((id) => d.voltas.find((v) => v.id === id))
    .filter((v): v is VoltaBtt => !!v)
    .map((alvo) => backtestBtt(alvo, d.voltas, d.zwift, alvo.data, massa(linhas), pb));
  await gravarEstado(db, ESTADO_BACKTESTS, {
    em: new Date().toISOString(),
    versao: VERSAO_PREVISAO,
    corrida,
    btt: casosBtt,
    dados: {
      corridas: d.corridas.length,
      voltas: d.voltas.length,
      voltasExcluidas: d.voltas.filter((v) => v.excluida).map((v) => ({ data: v.data, nome: v.nome, motivo: v.excluida })),
      zwift: d.zwift.length,
      zwiftComJanelas: d.zwift.filter((z) => z.janelas.length > 0).length,
    },
  });

  return {
    duracaoMs: Date.now() - inicio,
    snapshots: gravados,
    dados: { corridas: d.corridas.length, voltas: d.voltas.length, zwift: d.zwift.length },
    diasAteProva: metas.map((m) => diasDesde(hoje, m.dataProva)),
  };
}
