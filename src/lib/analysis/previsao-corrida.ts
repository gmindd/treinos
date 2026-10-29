// Motor de previsão de corrida (brief §7.1), funções puras.
// Modelo A: velocidade GAP = a + b·FC + c·t (Huber, ponderado por recência) avaliado na
// FC de prova. Modelo B: melhores esforços convertidos com Riegel. Combinação ponderada
// pela qualidade dos dados, intervalo por bootstrap por sessão e projeção até à prova.
import type { AmostrasCorrida, JanelaEstavel } from "./corrida";
import {
  diasDesde,
  ganhoProjetado,
  pesoRecencia,
  reamostragens,
  regressaoHuber,
  resumoTempos,
  somarDias,
} from "./estatistica";
import { media } from "./series";
import { tendencia } from "./zwift";

export type EsforcoCorrida = { distanciaM: number; tempoS: number; fcMedia: number | null; inicio: number };

export type SessaoCorrida = {
  id: number;
  data: string;
  nome: string;
  /** Teste ou prova (esforço máximo): serve para derivar a FC de prova. */
  esforcoMaximo: boolean;
  distanciaM: number;
  duracaoMovimentoS: number;
  amostras: AmostrasCorrida;
  janelas: JanelaEstavel[];
  esforcos: EsforcoCorrida[];
};

export type ParametrosCorrida = {
  semanasHistorico: number;
  meiaVidaDias: number;
  minJanelas: number;
  diasEsforcos: number;
  meiaVidaEsforcosDias: number;
  riegel: number;
  fcProvaDefault: number;
  fcProvaDesconto: number;
  extrapolacaoBpm: number;
  fatorIcExtrapolacao: number;
  divergencia: number;
  durabilidadeLongaMin: number;
  durabilidadeVolumeKm: number;
  penalizacaoDurabilidade: number;
  fcEficiencia: number;
  semanasTendencia: number;
  tauSemanas: number;
  ganhoMax: number;
  bootstrapN: number;
  sensibilidadeFc: number[];
};

export const DISTANCIAS_ESFORCO = [3000, 5000, 10000];

/**
 * Menor tempo (s, a 1 Hz, paragens incluídas) para cobrir `distanciaM` em distância GAP,
 * com a FC média nesse troço.
 */
export function melhorEsforcoGap(
  gap1Hz: number[],
  fc1Hz: (number | null)[],
  distanciaM: number,
): EsforcoCorrida | null {
  let melhor: EsforcoCorrida | null = null;
  let i = 0;
  let soma = 0;
  for (let j = 0; j < gap1Hz.length; j++) {
    soma += gap1Hz[j];
    while (i <= j && soma - gap1Hz[i] >= distanciaM) soma -= gap1Hz[i++];
    if (soma >= distanciaM) {
      const tempo = j - i + 1;
      if (!melhor || tempo < melhor.tempoS) melhor = { distanciaM, tempoS: tempo, fcMedia: null, inicio: i };
    }
  }
  if (melhor) {
    const fc = fc1Hz.slice(melhor.inicio, melhor.inicio + melhor.tempoS).filter((x): x is number => x != null);
    melhor.fcMedia = fc.length > melhor.tempoS / 2 ? media(fc) : null;
  }
  return melhor;
}

export function esforcosSessao(a: AmostrasCorrida, distancias = DISTANCIAS_ESFORCO): EsforcoCorrida[] {
  return distancias
    .map((d) => melhorEsforcoGap(a.gap1Hz, a.fc1Hz, d))
    .filter((e): e is EsforcoCorrida => e != null);
}

// ---------------------------------------------------------------------------
// Modelo A
// ---------------------------------------------------------------------------

export type ModeloA = { a: number; b: number; c: number; n: number; nSessoes: number; fcMin: number; fcMax: number };

type JanelaPonderada = { v: number; fc: number; tH: number; w: number; sessao: number };

function ajustarA(janelas: JanelaPonderada[], pesosSessao?: number[]): ModeloA | null {
  const js = pesosSessao ? janelas.filter((j) => pesosSessao[j.sessao] > 0) : janelas;
  if (js.length < 5) return null;
  const w = js.map((j) => j.w * (pesosSessao ? pesosSessao[j.sessao] : 1));
  const r = regressaoHuber(
    js.map((j) => [1, j.fc, j.tH]),
    js.map((j) => j.v),
    w,
  );
  if (!r || !(r.beta[1] > 0)) return null;
  const fcs = js.map((j) => j.fc);
  return {
    a: r.beta[0],
    b: r.beta[1],
    c: r.beta[2],
    n: js.length,
    nSessoes: new Set(js.map((j) => j.sessao)).size,
    fcMin: Math.min(...fcs),
    fcMax: Math.max(...fcs),
  };
}

/** Tempo para `distanciaM` à FC `fc`: a velocidade média inclui a deriva c·t até meio da prova. */
export function tempoModeloA(m: ModeloA, distanciaM: number, fc: number): number | null {
  let tempo = distanciaM / Math.max(0.5, m.a + m.b * fc);
  for (let i = 0; i < 20; i++) {
    const v = m.a + m.b * fc + m.c * (tempo / 2 / 3600);
    if (!(v > 0.5)) return null;
    tempo = distanciaM / v;
  }
  return tempo;
}

// ---------------------------------------------------------------------------
// Modelo B
// ---------------------------------------------------------------------------

type EsforcoDatado = EsforcoCorrida & { idadeDias: number; sessao: number };

/** O esforço que dá o tempo mais rápido na distância-alvo (Riegel) e a sua qualidade. */
function estimarB(esforcos: EsforcoDatado[], distanciaM: number, p: ParametrosCorrida, pesosSessao?: number[]) {
  let melhor: { tempoS: number; qualidade: number; esforco: EsforcoDatado } | null = null;
  for (const e of esforcos) {
    if (pesosSessao && !(pesosSessao[e.sessao] > 0)) continue;
    const t = e.tempoS * Math.pow(distanciaM / e.distanciaM, p.riegel);
    if (!melhor || t < melhor.tempoS) {
      const q = pesoRecencia(e.idadeDias, p.meiaVidaEsforcosDias) * Math.sqrt(Math.min(1, e.distanciaM / distanciaM));
      melhor = { tempoS: t, qualidade: q, esforco: e };
    }
  }
  return melhor;
}

// ---------------------------------------------------------------------------
// Previsão
// ---------------------------------------------------------------------------

type Contexto = {
  sessoes: SessaoCorrida[];
  janelas: JanelaPonderada[];
  esforcos: EsforcoDatado[];
};

/** Dados disponíveis antes de `ate` (exclusivo): janelas das últimas N semanas e esforços dos últimos N dias. */
function contexto(todas: SessaoCorrida[], ate: string, p: ParametrosCorrida): Contexto {
  const sessoes = todas.filter((s) => s.data < ate);
  const janelas: JanelaPonderada[] = [];
  const esforcos: EsforcoDatado[] = [];
  sessoes.forEach((s, i) => {
    const idade = diasDesde(s.data, ate);
    if (idade <= p.semanasHistorico * 7) {
      const w = pesoRecencia(idade, p.meiaVidaDias);
      for (const j of s.janelas) janelas.push({ v: j.v, fc: j.fc, tH: (j.t ?? 0) / 3600, w, sessao: i });
    }
    if (idade <= p.diasEsforcos) for (const e of s.esforcos) esforcos.push({ ...e, idadeDias: idade, sessao: i });
  });
  return { sessoes, janelas, esforcos };
}

function combinar(
  tA: number | null,
  qA: number,
  b: { tempoS: number; qualidade: number } | null,
): number | null {
  const wA = tA != null ? qA : 0;
  const wB = b ? b.qualidade : 0;
  if (wA + wB <= 0) return null;
  return ((tA ?? 0) * wA + (b?.tempoS ?? 0) * wB) / (wA + wB);
}

function qualidadeA(m: ModeloA, extrapolado: boolean, p: ParametrosCorrida) {
  return Math.min(1, m.n / p.minJanelas) * (extrapolado ? 0.5 : 1);
}

/** Previsão de um esforço com distância e FC dadas, só com dados anteriores a `ate`. */
export function preverEsforco(todas: SessaoCorrida[], ate: string, distanciaM: number, fc: number, p: ParametrosCorrida) {
  const ctx = contexto(todas, ate, p);
  const mA = ctx.janelas.length >= p.minJanelas ? ajustarA(ctx.janelas) : null;
  const tA = mA ? tempoModeloA(mA, distanciaM, fc) : null;
  const extrapolado = mA ? mA.fcMax < fc - p.extrapolacaoBpm : false;
  const b = estimarB(ctx.esforcos, distanciaM, p);
  const tempoS = combinar(tA, mA ? qualidadeA(mA, extrapolado, p) : 0, b);
  return {
    tempoS,
    a: tA != null && mA ? { tempoS: tA, janelas: mA.n, sessoes: mA.nSessoes, extrapolado } : null,
    b: b ? { tempoS: b.tempoS, esforcoM: b.esforco.distanciaM, idadeDias: b.esforco.idadeDias } : null,
    janelasDisponiveis: ctx.janelas.length,
  };
}

export type PrevisaoCorrida = Awaited<ReturnType<typeof preverCorrida>>;

/**
 * Previsão de uma prova de `distanciaM` em `dataProva`, com os dados anteriores a `ate`
 * ("se a prova fosse hoje" e projeção para o dia da prova).
 */
export function preverCorrida(
  todas: SessaoCorrida[],
  ate: string,
  distanciaM: number,
  alvoS: number,
  dataProva: string,
  p: ParametrosCorrida,
) {
  const ctx = contexto(todas, ate, p);
  const falta: string[] = [];
  const avisos: string[] = [];

  // FC de prova: do teste/prova mais recente (FC média no melhor 5 km − desconto), senão o default.
  let fcProva = { valor: p.fcProvaDefault, origem: "parametro" as "parametro" | "dados", sessao: null as string | null };
  const maximos = ctx.sessoes
    .filter((s) => s.esforcoMaximo && diasDesde(s.data, ate) <= p.diasEsforcos)
    .map((s) => ({ s, e: s.esforcos.find((e) => e.distanciaM === 5000) }))
    .filter((x) => x.e?.fcMedia != null);
  if (maximos.length) {
    const ult = maximos[maximos.length - 1];
    fcProva = { valor: (ult.e!.fcMedia as number) - p.fcProvaDesconto, origem: "dados", sessao: `${ult.s.nome} (${ult.s.data})` };
  }

  const mA = ctx.janelas.length >= p.minJanelas ? ajustarA(ctx.janelas) : null;
  if (!mA) {
    falta.push(
      `Modelo A: ${ctx.janelas.length} janelas estáveis nas últimas ${p.semanasHistorico} semanas (são precisas ${p.minJanelas}).`,
    );
  }
  const extrapolado = mA ? mA.fcMax < fcProva.valor - p.extrapolacaoBpm : false;
  if (mA && extrapolado) {
    avisos.push(
      `Extrapolação: a FC mais alta nos dados é ${Math.round(mA.fcMax)} bpm, mais de ${p.extrapolacaoBpm} abaixo da FC de prova (${Math.round(fcProva.valor)}). Intervalo alargado.`,
    );
  }
  const tA = mA ? tempoModeloA(mA, distanciaM, fcProva.valor) : null;
  const qA = mA ? qualidadeA(mA, extrapolado, p) : 0;
  const b = estimarB(ctx.esforcos, distanciaM, p);
  if (!b) falta.push(`Modelo B: nenhum esforço ≥ ${DISTANCIAS_ESFORCO[0] / 1000} km nos últimos ${p.diasEsforcos} dias.`);
  const central = combinar(tA, qA, b);

  // Durabilidade (heurística): corrida contínua mais longa em 21 dias e volume semanal (4 semanas).
  const recentes21 = ctx.sessoes.filter((s) => diasDesde(s.data, ate) <= 21);
  const longaMin = Math.max(0, ...recentes21.map((s) => s.duracaoMovimentoS / 60));
  const kmSemana = ctx.sessoes.filter((s) => diasDesde(s.data, ate) <= 28).reduce((t, s) => t + s.distanciaM, 0) / 1000 / 4;
  let penalizacao = 0;
  const durabilidade: string[] = [];
  if (distanciaM >= 8000) {
    if (longaMin < p.durabilidadeLongaMin) {
      penalizacao += p.penalizacaoDurabilidade;
      durabilidade.push(`Corrida mais longa em 21 dias: ${Math.round(longaMin)} min (< ${p.durabilidadeLongaMin}).`);
    }
    if (kmSemana < p.durabilidadeVolumeKm) {
      penalizacao += p.penalizacaoDurabilidade;
      durabilidade.push(`Volume médio: ${kmSemana.toFixed(1).replace(".", ",")} km/semana (< ${p.durabilidadeVolumeKm}).`);
    }
  }

  if (tA != null && b && Math.abs(tA - b.tempoS) / Math.min(tA, b.tempoS) > p.divergencia) {
    avisos.push(`Os modelos A e B divergem ${Math.round((Math.abs(tA - b.tempoS) / Math.min(tA, b.tempoS)) * 100)}%.`);
  }

  // Sensibilidade à FC de prova.
  const sensibilidade = p.sensibilidadeFc.map((fc) => {
    const t = mA ? tempoModeloA(mA, distanciaM, fc) : null;
    const c = combinar(t, mA ? qualidadeA(mA, mA.fcMax < fc - p.extrapolacaoBpm, p) : 0, b);
    return { fc, tempoS: c != null ? c * (1 + penalizacao) : null };
  });

  // Eficiência por sessão (velocidade GAP a X bpm, com o declive b do modelo) e tendência.
  const bEf = mA?.b ?? null;
  const eficiencia = bEf
    ? ctx.sessoes
        .filter((s) => s.janelas.length >= 3 && diasDesde(s.data, ate) <= p.semanasTendencia * 7)
        .map((s) => ({ data: s.data, valor: media(s.janelas.map((j) => j.v + bEf * (p.fcEficiencia - j.fc))) }))
    : [];
  const tend = eficiencia.length >= 4 ? tendencia(eficiencia, true) : null;
  const semanasAteProva = Math.max(0, diasDesde(ate, dataProva) / 7);
  const ref = eficiencia.length ? media(eficiencia.slice(-3).map((e) => e.valor)) : null;
  const rel = (d: number | null | undefined) => (d != null && ref ? d / ref : 0);
  const ganho = ganhoProjetado(rel(tend?.declivePorSemana), semanasAteProva, p.tauSemanas, p.ganhoMax);
  const ganhoBaixo = tend?.ic95 ? ganhoProjetado(rel(tend.ic95[0]), semanasAteProva, p.tauSemanas, p.ganhoMax) : ganho;
  const ganhoAlto = tend?.ic95 ? ganhoProjetado(rel(tend.ic95[1]), semanasAteProva, p.tauSemanas, p.ganhoMax) : ganho;

  // Bootstrap por sessão.
  const amostras: number[] = [];
  if (central != null) {
    for (const contagens of reamostragens(ctx.sessoes.length, p.bootstrapN, 2627)) {
      const m = ctx.janelas.length >= p.minJanelas ? ajustarA(ctx.janelas, contagens) : null;
      const t = m ? tempoModeloA(m, distanciaM, fcProva.valor) : null;
      const bb = estimarB(ctx.esforcos, distanciaM, p, contagens);
      const c = combinar(t, m ? qualidadeA(m, m.fcMax < fcProva.valor - p.extrapolacaoBpm, p) : 0, bb);
      if (c != null) amostras.push(c * (1 + penalizacao));
    }
  }
  const alargar = extrapolado ? p.fatorIcExtrapolacao : 1;
  const hojeResumo = resumoTempos(amostras, alvoS, alargar);
  // Sem bootstrap (n = 0) fica só o valor central.
  const semIntervalo = { p10: NaN, p50: NaN, p90: NaN, probAlvo: NaN };
  const hoje = central != null ? { ...(hojeResumo ?? semIntervalo), centralS: central * (1 + penalizacao) } : null;
  const projecaoResumo = resumoTempos(
    amostras.map((x) => x / (1 + ganho)),
    alvoS,
    alargar,
  );
  const projecao =
    hoje && !projecaoResumo
      ? { ...semIntervalo, centralS: hoje.centralS / (1 + ganho) }
      : hoje && projecaoResumo
      ? {
          ...projecaoResumo,
          centralS: hoje.centralS / (1 + ganho),
          p10: Math.min(projecaoResumo.p10, hoje.p10 / (1 + ganhoAlto)),
          p90: Math.max(projecaoResumo.p90, hoje.p90 / (1 + ganhoBaixo)),
        }
      : null;

  return {
    suficiente: central != null,
    falta,
    avisos,
    ate,
    fcProva,
    hoje,
    projecao,
    ganho: { central: ganho, baixo: ganhoBaixo, alto: ganhoAlto, semanasAteProva },
    a: mA && tA != null ? { tempoS: tA, peso: qA, extrapolado, modelo: mA } : null,
    b: b
      ? {
          tempoS: b.tempoS,
          peso: b.qualidade,
          esforco: {
            distanciaM: b.esforco.distanciaM,
            tempoS: b.esforco.tempoS,
            fcMedia: b.esforco.fcMedia,
            data: somarDias(ate, -Math.round(b.esforco.idadeDias)),
          },
        }
      : null,
    durabilidade: { penalizacao, motivos: durabilidade, longaMin, kmSemana },
    sensibilidade,
    eficiencia: { pontos: eficiencia, tendencia: tend ? { veredicto: tend.veredicto, declivePorSemana: tend.declivePorSemana, ic95: tend.ic95 } : null },
    dados: { sessoes: ctx.sessoes.length, janelas: ctx.janelas.length, esforcos: ctx.esforcos.length },
  };
}

// ---------------------------------------------------------------------------
// Backtest (aceitação da fase 3)
// ---------------------------------------------------------------------------

/**
 * Prevê cada esforço forte (FC média ≥ `fcMin` no melhor troço GAP de 5 km, ou 3 km)
 * só com dados anteriores ao dia desse esforço, e mede o erro.
 */
export function backtestCorrida(todas: SessaoCorrida[], fcMin: number, p: ParametrosCorrida) {
  const casos = [];
  for (const s of todas) {
    const e =
      s.esforcos.find((x) => x.distanciaM === 5000 && (x.fcMedia ?? 0) >= fcMin) ??
      s.esforcos.find((x) => x.distanciaM === 3000 && (x.fcMedia ?? 0) >= fcMin);
    if (!e || e.fcMedia == null) continue;
    const r = preverEsforco(todas, s.data, e.distanciaM, e.fcMedia, p);
    casos.push({
      sessao: { id: s.id, data: s.data, nome: s.nome },
      distanciaM: e.distanciaM,
      fcMedia: e.fcMedia,
      realS: e.tempoS,
      previstoS: r.tempoS,
      erro: r.tempoS != null ? (r.tempoS - e.tempoS) / e.tempoS : null,
      a: r.a,
      b: r.b,
      janelasDisponiveis: r.janelasDisponiveis,
    });
  }
  const erros = casos.map((c) => c.erro).filter((x): x is number => x != null);
  const abs = erros.map(Math.abs).sort((x, y) => x - y);
  const medianaAbs = abs.length ? (abs.length % 2 ? abs[(abs.length - 1) / 2] : (abs[abs.length / 2 - 1] + abs[abs.length / 2]) / 2) : null;
  return { casos, avaliados: erros.length, semDados: casos.length - erros.length, erroMedianoAbs: medianaAbs };
}
