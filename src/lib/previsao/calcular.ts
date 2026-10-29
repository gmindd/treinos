// Previsões das metas (fases 3 e 4): carrega as atividades com streams, corre os motores
// para cada meta ativa, grava o snapshot de hoje e os semanais em falta, e refaz os backtests.
import { gunzipSync } from "node:zlib";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import { atividade, meta, percurso, previsaoSnapshot } from "@/db/schema";
import { jsonNaData, numeroNaData, type LinhaConstante } from "@/lib/analysis/constantes";
import { diasDesde, somarDias } from "@/lib/analysis/estatistica";
import {
  backtestBtt,
  perfisPacing,
  preparar,
  fatorMovimentoMediano,
  prepararVolta,
  preverBtt,
  resumoPorZona,
  type ParametrosBtt,
  type SessaoZwift,
  type VoltaBtt,
} from "@/lib/analysis/previsao-btt";
import { custoMinetti } from "@/lib/analysis/corrida";
import { rotuloClasse } from "@/lib/analysis/btt";
import {
  backtestCorrida,
  distanciaEquivalente,
  fatorDesnivel,
  preverCorrida,
  type SessaoCorrida,
} from "@/lib/analysis/previsao-corrida";
import { lerConstantes, lerParametros, lerStreams } from "@/lib/calculo/recalcular";
import { dataIsoLisboa, formatarData } from "@/lib/formato";
import { streamsDoGpx, type Gpx } from "@/lib/gpx";
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

/**
 * Corrida: o modelo prevê a distância plana equivalente (Minetti). Com GPX, o tempo
 * reparte-se pelos segmentos (altimetria, setores e zonas como no BTT); sem GPX, o D+ da
 * meta entra com metade a subir e metade a descer.
 */
function preverMetaCorrida(
  m: Meta,
  d: Dados,
  gpx: Map<number, AlvoGpx | null>,
  ate: string,
  p: Parametros,
  pb: ParametrosBtt,
  completo: boolean,
): Resumo {
  const pc = parametrosCorrida(p);
  const g = m.percursoId ? gpx.get(m.percursoId) : undefined;
  if (m.percursoId && !g) {
    return { suficiente: false, hoje: null, projecao: null, detalhes: { tipo: "corrida", falta: ["Percurso: o GPX não deu para segmentar."] } };
  }
  const segs = g?.volta.segmentos ?? null;
  const distancia = segs ? segs.reduce((t, s) => t + s.comp, 0) : (m.distanciaM ?? 10000);
  const desnivel = segs ? segs.reduce((t, s) => t + Math.max(0, s.declive * s.comp), 0) : (m.desnivelM ?? 0);
  const equivalente = segs ? distanciaEquivalente(segs) : distancia * fatorDesnivel(distancia, desnivel);
  const r = preverCorrida(d.corridas, ate, equivalente, m.tempoAlvoS, m.dataProva, completo ? pc : { ...pc, bootstrapN: 0 });
  const percurso = { distanciaM: distancia, desnivelM: desnivel, equivalenteM: equivalente };
  if (!completo) {
    return { suficiente: r.suficiente, hoje: r.hoje, projecao: r.projecao, detalhes: { tipo: "corrida", a: r.a?.tempoS ?? null, b: r.b?.tempoS ?? null, falta: r.falta, percurso } };
  }
  let curso: Record<string, unknown> | null = null;
  if (g && segs && r.hoje) {
    const T = r.hoje.centralS;
    const peso = segs.map((s) => (s.comp * custoMinetti(s.declive)) / custoMinetti(0) / equivalente);
    const ref = g.temTempo ? segs.map((s) => s.tempoMovS) : null;
    const somaRef = ref ? ref.reduce((t, x) => t + x, 0) : 0;
    const segmentos = segs.map((s, k) => {
      const previsto = T * peso[k];
      return {
        dIni: s.dIni,
        comp: s.comp,
        declive: s.declive,
        classe: rotuloClasse(s.classe, pb.classes),
        classeIdx: s.classe,
        nivel: 0,
        referenciaS: ref ? ref[k] : null,
        previstoS: previsto,
        // Meta repartida como a referência (o mesmo ritmo relativo) ou, sem ela, como o previsto.
        necessarioS: ref && somaRef > 0 ? (ref[k] * m.tempoAlvoS) / somaRef : (previsto * m.tempoAlvoS) / T,
        fcPerfil: s.fcMedia,
        pontos: [s.i0, s.i1] as [number, number],
      };
    });
    const gr = g.volta.grelha;
    curso = {
      segmentos,
      ...resumoPorZona(segmentos),
      gpx: { temTempo: g.temTempo, temFc: g.temFc, data: g.data },
      mapa: gr.lat.map((la, k) => [la, gr.lon[k]]).filter((_, k) => k % 2 === 0),
      altimetria: gr.d.map((x, k) => [Math.round(x), Math.round(gr.alt[k] * 10) / 10]).filter((_, k) => k % 4 === 0 || k === gr.d.length - 1),
    };
  }
  return {
    suficiente: r.suficiente,
    hoje: r.hoje,
    projecao: r.projecao,
    detalhes: { tipo: "corrida", ...r, eficiencia: r.eficiencia, percurso, curso },
  };
}

/** Percurso de um GPX carregado, como "volta" (alvo do motor; nunca entra como dado de treino). */
export type AlvoGpx = { volta: VoltaBtt; temTempo: boolean; temFc: boolean; data: string | null };

function alvoDoGpx(id: number, nome: string, gpx: Gpx, pb: ParametrosBtt): AlvoGpx | null {
  const t0 = gpx.pontos.find((x) => x.t != null)?.t;
  const data = gpx.temTempo && t0 != null ? dataIsoLisboa(new Date(t0 * 1000)) : null;
  // Pausas como nos streams do Strava (intervalos > max_lacuna); num GPX gravado de poucos em
  // poucos segundos o limite sobe para 3× o intervalo típico entre pontos.
  const s = streamsDoGpx(gpx);
  const dts = s.time.slice(1).map((t, i) => t - s.time[i]).filter((x) => x > 0).sort((a, b) => a - b);
  const dtTipico = dts[Math.floor(dts.length / 2)] ?? 1;
  const volta = prepararVolta(
    { id: -id, data: data ?? "2000-01-01", nome, sportType: null, comCriancas: false, duracaoMovimentoS: 0 },
    s,
    gpx.temTempo ? { ...pb, maxLacunaS: Math.max(pb.maxLacunaS, 3 * dtTipico) } : { ...pb, maxLacunaS: 1e9 },
  );
  return volta ? { volta, temTempo: gpx.temTempo, temFc: gpx.temFc, data } : null;
}

function preverMetaBtt(
  m: Meta,
  d: Dados,
  gpx: Map<number, AlvoGpx | null>,
  ate: string,
  pb: ParametrosBtt,
  linhas: LinhaConstante[],
  completo: boolean,
  cache: Map<number, ReturnType<typeof preparar>>,
): Resumo {
  let alvo: VoltaBtt | undefined;
  let referencia: { tempoS: number; porSeg: number[] } | null = null;
  let refIds: number[] = [];
  let nomeRef = "";
  let origem: Record<string, unknown> = {};
  let fatorMovimento: number | undefined;
  if (m.percursoId) {
    const g = gpx.get(m.percursoId);
    if (!g) return { suficiente: false, hoje: null, projecao: null, detalhes: { tipo: "btt", falta: ["Percurso: o GPX não deu para segmentar."] } };
    alvo = g.volta;
    // Tudo em tempo em movimento do Strava: se o GPX é uma volta tua (mesmo dia e mesma
    // distância), usa-se o tempo dessa atividade; senão, o fator mediano das voltas recentes.
    const dist = alvo.grelha.d[alvo.grelha.d.length - 1];
    // A distância do GPX (ponto a ponto) e a do Strava diferem uns 4%: tolerância de 8%,
    // e se houver várias voltas nesse dia fica a de distância mais próxima.
    const diferenca = (v: VoltaBtt) => Math.abs(v.grelha.d[v.grelha.d.length - 1] - dist) / dist;
    const mesma = g.data
      ? d.voltas.filter((v) => v.data === g.data && diferenca(v) < 0.08).sort((x, y) => diferenca(x) - diferenca(y))[0]
      : undefined;
    const fatorMed = fatorMovimentoMediano(d.voltas, ate);
    if (g.temTempo) {
      const porSeg = alvo.segmentos.map((s) => s.tempoMovS);
      const soma = porSeg.reduce((t, x) => t + x, 0);
      referencia = { tempoS: m.tempoReferenciaS ?? (mesma ? mesma.duracaoMovimentoS : soma * fatorMed), porSeg };
    } else {
      fatorMovimento = fatorMed;
    }
    if (mesma) refIds = [mesma.id];
    nomeRef = g.temFc ? `FC do GPX${g.data ? ` (${formatarData(g.data)})` : ""}` : `FC constante de ${pb.fcProvaDefault} bpm`;
    origem = {
      gpx: { temTempo: g.temTempo, temFc: g.temFc, data: g.data },
      unidades: mesma ? `tempo do Strava de "${mesma.nome}"` : `fator mediano das voltas recentes (${fatorMed.toFixed(3).replace(".", ",")})`,
    };
  } else {
    const idRef = m.referenciaStravaId ? d.stravaParaId.get(m.referenciaStravaId) : undefined;
    alvo = idRef != null ? d.voltas.find((v) => v.id === idRef) : undefined;
    if (alvo) {
      referencia = { tempoS: m.tempoReferenciaS ?? alvo.duracaoMovimentoS, porSeg: alvo.segmentos.map((s) => s.tempoMovS) };
      refIds = [alvo.id];
      nomeRef = `Como em ${alvo.data.slice(0, 4)}`;
      origem = { referencia: { id: alvo.id, nome: alvo.nome, data: alvo.data } };
    }
  }
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
      perfis: perfisPacing(alvo, pb, nomeRef),
      refIds,
      referencia,
      massa: massa(linhas),
      bootstrap: completo,
      fatorMovimento,
    },
    pb,
  );
  const central = r.cenarios[0];
  // Sem bootstrap (snapshots semanais), guarda-se só o valor central.
  const hoje = r.hoje ?? (central.hojeS != null ? { centralS: central.hojeS, p10: NaN, p90: NaN, probAlvo: NaN } : null);
  const projecao = r.projecao ?? (central.projecaoS != null ? { centralS: central.projecaoS, p10: NaN, p90: NaN, probAlvo: NaN } : null);
  const g = alvo.grelha;
  return {
    suficiente: r.suficiente,
    hoje,
    projecao,
    detalhes: completo
      ? {
          tipo: "btt",
          ...r,
          ...origem,
          ...resumoPorZona(r.segmentos),
          mapa: g.lat.map((la, k) => [la, g.lon[k]]).filter((_, k) => k % 2 === 0),
          // Altimetria a cada 100 m (4 pontos da grelha): [distância, altitude].
          altimetria: g.d.map((x, k) => [Math.round(x), Math.round(g.alt[k] * 10) / 10]).filter((_, k) => k % 4 === 0 || k === g.d.length - 1),
        }
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
  const idsPercurso = metas.map((m) => m.percursoId).filter((x): x is number => x != null);
  const gpx = new Map<number, AlvoGpx | null>();
  if (idsPercurso.length) {
    const ps = await db.select().from(percurso).where(inArray(percurso.id, idsPercurso));
    for (const x of ps) {
      gpx.set(x.id, x.pontos ? alvoDoGpx(x.id, x.nome, JSON.parse(gunzipSync(x.pontos).toString("utf8")) as Gpx, pb) : null);
    }
  }
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
      const r = m.tipo === "corrida" ? preverMetaCorrida(m, d, gpx, ate, p, pb, completo) : preverMetaBtt(m, d, gpx, ate, pb, linhas, completo, cache);
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
