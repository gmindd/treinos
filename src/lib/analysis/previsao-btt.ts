// Motor de previsão BTT (brief §7.2), funções puras.
// Estimador A: velocidade empírica por segmento (mesmo troço geográfico → mesma classe de
// declive → classes vizinhas → B). Estimador B: física calibrada com a relação FC → W do
// Zwift e um Crr efetivo por classe. Combinação pela cobertura de A.
import {
  casarTroco,
  estatisticasTroco,
  grelhaDistancia,
  indiceEspacial,
  rotuloClasse,
  segmentar,
  type Grelha,
  type OpcoesGrelha,
  type Segmento,
  type StreamsBtt,
} from "./btt";
import { diasDesde, ganhoProjetado, pesoRecencia, reamostragens, resumoTempos } from "./estatistica";
import { mediana } from "./series";
import { relacaoFcPotencia, tendencia, type JanelaPotencia } from "./zwift";

export type ParametrosBtt = OpcoesGrelha & {
  classes: number[];
  segmentoMinM: number;
  fcEsforcoMin: number;
  fcEsforcoLimiar: number;
  fracAcimaLimiar: number;
  fracVoltaEsforco: number;
  excluirZ1: boolean;
  fcZ1Max: number;
  sportTypesExcluidos: string[];
  bufferM: number;
  sobreposicao: number;
  pesoMesmoTroco: number;
  meiaVidaDias: number;
  eta: number;
  rho: number;
  cda: number;
  zwiftSemanas: number;
  fcArranque: number;
  kmArranque: number;
  divergencia: number;
  fcProvaDefault: number;
  semanasTendencia: number;
  tauSemanas: number;
  ganhoMax: number;
  bootstrapN: number;
  marcoSubidaMin: number;
  declSubidaMin: number;
};

const G = 9.81;

export type VoltaBtt = {
  id: number;
  data: string;
  nome: string;
  sportType: string | null;
  comCriancas: boolean;
  duracaoMovimentoS: number;
  grelha: Grelha;
  segmentos: Segmento[];
  fcMedia: number | null;
  /** Fração do tempo em movimento acima de `fcEsforcoMin`. */
  fracEsforco: number;
  excluida: string | null;
  descidasValidas: boolean;
  temGps: boolean;
};

export type SessaoZwift = { id: number; data: string; janelas: JanelaPotencia[] };

export function prepararVolta(
  info: Omit<VoltaBtt, "grelha" | "segmentos" | "fcMedia" | "fracEsforco" | "excluida" | "descidasValidas" | "temGps">,
  s: StreamsBtt,
  p: ParametrosBtt,
): VoltaBtt | null {
  const g = grelhaDistancia(s, p);
  if (!g) return null;
  const segmentos = segmentar(g, p.classes, p.segmentoMinM, p.fcEsforcoLimiar);
  const toda = estatisticasTroco(g, 0, g.d.length - 1, p.fcEsforcoMin);
  let excluida: string | null = null;
  if (info.sportType && p.sportTypesExcluidos.includes(info.sportType)) excluida = `Outra bicicleta (${info.sportType})`;
  else if (toda.fcMedia == null) excluida = "Sem FC";
  else if (p.excluirZ1 && toda.fcMedia <= p.fcZ1Max) excluida = "FC média em Z1";
  return {
    ...info,
    grelha: g,
    segmentos,
    fcMedia: toda.fcMedia,
    fracEsforco: toda.fracAcima,
    excluida,
    descidasValidas: !info.comCriancas && toda.fracAcima >= p.fracVoltaEsforco,
    temGps: g.lat.some((x) => x != null),
  };
}

/** Filtro de esforço (regra central do §7.2). */
function trocoValido(
  t: { v: number | null; tempoMovS: number; fcMedia: number | null; fracAcima: number },
  declive: number,
  volta: VoltaBtt,
  p: ParametrosBtt,
) {
  if (t.v == null || t.tempoMovS < 10) return false;
  if (declive >= -0.01) return (t.fcMedia ?? 0) >= p.fcEsforcoMin && t.fracAcima >= p.fracAcimaLimiar;
  return volta.descidasValidas;
}

// ---------------------------------------------------------------------------
// Preparação (independente da data de corte)
// ---------------------------------------------------------------------------

type Contrib = { volta: number; pace: number; peso: number; fc: number | null };

export type Preparacao = {
  alvo: VoltaBtt;
  voltas: VoltaBtt[];
  /** Nível 1: o mesmo troço geográfico noutras voltas, por segmento-alvo. */
  mesmoTroco: Contrib[][];
  /** Nível 2: segmentos válidos por classe de declive. */
  porClasse: Contrib[][];
};

export function preparar(alvo: VoltaBtt, voltas: VoltaBtt[], p: ParametrosBtt): Preparacao {
  const usaveis = voltas.filter((v) => !v.excluida);
  const latRef = alvo.grelha.lat.find((x) => x != null) ?? 41.7;
  const mesmoTroco: Contrib[][] = alvo.segmentos.map(() => []);
  const porClasse: Contrib[][] = Array.from({ length: p.classes.length + 1 }, () => []);
  usaveis.forEach((v, iv) => {
    for (const s of v.segmentos) {
      if (trocoValido(s, s.declive, v, p)) porClasse[s.classe].push({ volta: iv, pace: s.tempoMovS / s.comp, peso: s.comp, fc: s.fcMedia });
    }
    if (!v.temGps || !alvo.temGps) return;
    const indice = indiceEspacial(v.grelha, p.bufferM, latRef);
    alvo.segmentos.forEach((sa, k) => {
      const c = casarTroco(alvo.grelha, sa.i0, sa.i1, indice, p.bufferM, p.sobreposicao);
      if (!c) return;
      const t = estatisticasTroco(v.grelha, c.j0, c.j1, p.fcEsforcoLimiar);
      if (t.comp > 0 && trocoValido(t, sa.declive, v, p)) {
        mesmoTroco[k].push({ volta: iv, pace: t.tempoMovS / t.comp, peso: t.comp * p.pesoMesmoTroco, fc: t.fcMedia });
      }
    });
  });
  return { alvo, voltas: usaveis, mesmoTroco, porClasse };
}

// ---------------------------------------------------------------------------
// Estimador A
// ---------------------------------------------------------------------------

type SegA = { v: number | null; nivel: 1 | 2 | 3 | 4; fc: number | null; n: number };

function estimadorA(prep: Preparacao, ate: string, p: ParametrosBtt, contagens?: number[]) {
  const peso = (c: Contrib) => {
    const v = prep.voltas[c.volta];
    if (v.data >= ate) return 0;
    return c.peso * pesoRecencia(diasDesde(v.data, ate), p.meiaVidaDias) * (contagens ? contagens[c.volta] : 1);
  };
  const juntar = (cs: Contrib[]) => {
    let sw = 0;
    let sp = 0;
    let swf = 0;
    let sf = 0;
    let n = 0;
    for (const c of cs) {
      const w = peso(c);
      if (w <= 0) continue;
      sw += w;
      sp += w * c.pace;
      n++;
      if (c.fc != null) {
        swf += w;
        sf += w * c.fc;
      }
    }
    return sw > 0 ? { v: sw / sp, fc: swf > 0 ? sf / swf : null, n, sw } : null;
  };
  const porSeg: SegA[] = prep.alvo.segmentos.map((s, k) => {
    const c1 = juntar(prep.mesmoTroco[k]);
    const c12 = juntar([...prep.mesmoTroco[k], ...prep.porClasse[s.classe]]);
    if (c12) return { v: c12.v, nivel: c1 ? 1 : 2, fc: c12.fc, n: c12.n };
    for (const off of [1, 2]) {
      const viz = juntar([...(prep.porClasse[s.classe - off] ?? []), ...(prep.porClasse[s.classe + off] ?? [])]);
      if (viz) return { v: viz.v, nivel: 3, fc: viz.fc, n: viz.n };
    }
    return { v: null, nivel: 4, fc: null, n: 0 };
  });
  const total = prep.alvo.segmentos.reduce((t, s) => t + s.comp, 0);
  const coberto = prep.alvo.segmentos.reduce((t, s, k) => t + (porSeg[k].nivel <= 2 ? s.comp : 0), 0);
  return { porSeg, cobertura: total > 0 ? coberto / total : 0 };
}

// ---------------------------------------------------------------------------
// Estimador B (física)
// ---------------------------------------------------------------------------

export type Relacao = { alfa: number; beta: number; n: number; r2: number; gamaW: [number, number] };

/**
 * Controlo de qualidade da relação FC → W: poucas janelas, declive fora do fisiológico ou
 * r² quase nulo dão potências absurdas (ex.: 4 janelas com β = 0,006 → 4700 W a 165 bpm).
 */
export const RELACAO_MIN = { janelas: 5, r2: 0.3, betaMin: 0.1, betaMax: 1 };

function relacaoAte(zwift: SessaoZwift[], ate: string, semanas: number, contagens?: number[]): Relacao | null {
  const js: JanelaPotencia[] = [];
  zwift.forEach((z, i) => {
    const idade = diasDesde(z.data, ate);
    if (idade <= 0 || idade > semanas * 7) return;
    const c = contagens ? contagens[i] : 1;
    for (let k = 0; k < c; k++) js.push(...z.janelas);
  });
  const r = relacaoFcPotencia(js);
  if (!r || r.n < RELACAO_MIN.janelas || r.r2 < RELACAO_MIN.r2 || r.beta < RELACAO_MIN.betaMin || r.beta > RELACAO_MIN.betaMax) return null;
  return { alfa: r.alfa, beta: r.beta, n: r.n, r2: r.r2, gamaW: r.gamaW };
}

const potencia = (r: Relacao, fc: number) => Math.max(0, (fc - r.alfa) / r.beta);

/** Velocidade (m/s) que a potência P mantém: P·η = v·m·g·(sin θ + Crr·cos θ) + ½·ρ·CdA·v³. */
export function velocidadeFisica(P: number, declive: number, crr: number, massa: number, p: Pick<ParametrosBtt, "eta" | "rho" | "cda">) {
  const th = Math.atan(declive);
  const f = (v: number) => v * massa * G * (Math.sin(th) + crr * Math.cos(th)) + 0.5 * p.rho * p.cda * v ** 3 - p.eta * P;
  let lo = 0.3;
  let hi = 30;
  if (f(lo) >= 0) return lo;
  if (f(hi) <= 0) return hi;
  for (let i = 0; i < 60; i++) {
    const m = (lo + hi) / 2;
    if (f(m) > 0) hi = m;
    else lo = m;
  }
  return (lo + hi) / 2;
}

/** Crr efetivo que reproduz a velocidade real com a potência estimada pela FC. */
function crrEfetivo(P: number, v: number, declive: number, massa: number, p: ParametrosBtt) {
  const th = Math.atan(declive);
  return (p.eta * P / v - massa * G * Math.sin(th) - 0.5 * p.rho * p.cda * v ** 2) / (massa * G * Math.cos(th));
}

function medianaPonderada(xs: { x: number; w: number }[]): number | null {
  const o = xs.filter((a) => a.w > 0 && Number.isFinite(a.x)).sort((a, b) => a.x - b.x);
  const total = o.reduce((t, a) => t + a.w, 0);
  if (total <= 0) return null;
  let acc = 0;
  for (const a of o) {
    acc += a.w;
    if (acc >= total / 2) return a.x;
  }
  return o[o.length - 1].x;
}

/**
 * Crr efetivo por classe de declive. Calibra nas edições anteriores do mesmo percurso
 * (`refIds`) quando existem antes da data de corte; senão em todos os segmentos válidos
 * das voltas anteriores. Cada volta usa a relação FC → W do Zwift da sua data.
 */
function calibrar(
  prep: Preparacao,
  zwift: SessaoZwift[],
  ate: string,
  refIds: number[],
  massa: (data: string) => number,
  p: ParametrosBtt,
  contagensVoltas?: number[],
  contagensZwift?: number[],
) {
  const doPercurso = prep.voltas.map((v, i) => ({ v, i })).filter(({ v }) => refIds.includes(v.id) && v.data < ate);
  const fonte = doPercurso.length ? doPercurso : prep.voltas.map((v, i) => ({ v, i })).filter(({ v }) => v.data < ate);
  const porClasse: { x: number; w: number }[][] = Array.from({ length: p.classes.length + 1 }, () => []);
  const cache = new Map<string, Relacao | null>();
  let usadas = 0;
  for (const { v, i } of fonte) {
    const c = contagensVoltas ? contagensVoltas[i] : 1;
    if (c <= 0) continue;
    if (!cache.has(v.data)) cache.set(v.data, relacaoAte(zwift, v.data, p.zwiftSemanas, contagensZwift));
    const rel = cache.get(v.data);
    if (!rel) continue;
    usadas++;
    const m = massa(v.data);
    const rec = pesoRecencia(diasDesde(v.data, ate), p.meiaVidaDias);
    for (const s of v.segmentos) {
      if (s.v == null || s.fcMedia == null) continue;
      if (!doPercurso.length && !trocoValido(s, s.declive, v, p)) continue;
      const crr = crrEfetivo(potencia(rel, s.fcMedia), s.v, s.declive, m, p);
      porClasse[s.classe].push({ x: Math.max(-0.3, Math.min(0.8, crr)), w: s.comp * rec * c });
    }
  }
  const crr = porClasse.map((xs) => medianaPonderada(xs));
  // Classes sem dados: a classe mais próxima que tenha.
  const preenchido = crr.map((x, c) => {
    if (x != null) return x;
    for (let off = 1; off < crr.length; off++) {
      const viz = crr[c - off] ?? crr[c + off];
      if (viz != null) return viz;
    }
    return null;
  });
  return { crr: preenchido, fonte: doPercurso.length ? "percurso" : "voltas", voltas: usadas };
}

// ---------------------------------------------------------------------------
// Previsão
// ---------------------------------------------------------------------------

export type Perfil = { nome: string; fc: (number | null)[] };

/** Perfis de FC: o da edição de referência ("como em 2026") e o de arranque controlado. */
export function perfisPacing(alvo: VoltaBtt, p: ParametrosBtt, nomeRef: string): Perfil[] {
  const ref = alvo.segmentos.map((s) => s.fcMedia ?? p.fcProvaDefault);
  return [
    { nome: nomeRef, fc: ref },
    {
      nome: `Arranque controlado (≤ ${p.fcArranque} bpm até ao km ${p.kmArranque})`,
      fc: alvo.segmentos.map((s, k) => (s.dIni < p.kmArranque * 1000 ? Math.min(ref[k], p.fcArranque) : ref[k])),
    },
  ];
}

type Calculo = {
  tA: number | null;
  /** A sem o ajuste ao perfil de FC (diagnóstico). */
  tABruto: number | null;
  tB: number | null;
  tempoS: number | null;
  porSeg: { tA: number | null; tB: number | null; t: number | null; nivel: number }[];
};

function calcularCenario(
  prep: Preparacao,
  a: ReturnType<typeof estimadorA>,
  rel: Relacao | null,
  crr: (number | null)[],
  massa: number,
  perfil: Perfil,
  multP: number,
  p: ParametrosBtt,
): Calculo {
  const segs = prep.alvo.segmentos;
  const vB = (k: number, fc: number, mult = multP) => {
    const c = crr[segs[k].classe];
    if (!rel || c == null) return null;
    return velocidadeFisica(potencia(rel, fc) * mult, segs[k].declive, c, massa, p);
  };
  let tA = 0;
  let tB = 0;
  let tABruto = 0;
  let aCompleto = true;
  let bCompleto = !!rel;
  const parciais = segs.map((s, k) => {
    const fc = perfil.fc[k] ?? p.fcProvaDefault;
    const b = vB(k, fc);
    const sa = a.porSeg[k];
    let va: number | null = sa.v;
    tABruto += s.comp / (sa.v ?? b ?? Infinity);
    // A vem de segmentos em esforço com outra FC: ajusta-se ao perfil pela sensibilidade do
    // modelo físico (só em plano e subida; nas descidas manda a técnica).
    if (va != null && s.declive >= -0.01 && sa.fc != null && b != null) {
      const bDados = vB(k, sa.fc, 1);
      if (bDados) va *= b / bDados;
    }
    if (va == null) va = b;
    const tAk = va ? s.comp / va : null;
    const tBk = b ? s.comp / b : null;
    if (tAk == null) aCompleto = false;
    else tA += tAk;
    if (tBk == null) bCompleto = false;
    else tB += tBk;
    return { tA: tAk, tB: tBk, nivel: sa.nivel };
  });
  const tAf = aCompleto ? tA : null;
  const tBf = bCompleto ? tB : null;
  const wA = tBf == null ? 1 : tAf == null ? 0 : a.cobertura;
  const tempoS = tAf == null && tBf == null ? null : wA * (tAf ?? 0) + (1 - wA) * (tBf ?? 0);
  return {
    tA: tAf,
    tABruto: Number.isFinite(tABruto) ? tABruto : null,
    tB: tBf,
    tempoS,
    porSeg: parciais.map((x) => ({
      ...x,
      t: x.tA == null && x.tB == null ? null : wA * (x.tA ?? x.tB ?? 0) + (1 - wA) * (x.tB ?? x.tA ?? 0),
    })),
  };
}

/** Tendência da potência a 160 bpm no Zwift → ganho relativo projetado até à prova. */
function ganhoPotencia(zwift: SessaoZwift[], ate: string, dataProva: string, p: ParametrosBtt) {
  const pontos = zwift
    .filter((z) => z.data < ate && diasDesde(z.data, ate) <= p.semanasTendencia * 7)
    .map((z) => ({ data: z.data, r: relacaoFcPotencia(z.janelas) }))
    .filter((x) => x.r && !x.r.w160bpm.extrapolado)
    .map((x) => ({ data: x.data, valor: x.r!.w160bpm.valor }));
  const semanas = Math.max(0, diasDesde(ate, dataProva) / 7);
  if (pontos.length < 4) return { central: 0, baixo: 0, alto: 0, pontos, tendencia: null, semanas };
  const t = tendencia(pontos, true);
  const ref = mediana(pontos.slice(-3).map((x) => x.valor));
  const g = (d: number | null | undefined) => ganhoProjetado(d != null && ref > 0 ? d / ref : 0, semanas, p.tauSemanas, p.ganhoMax);
  return {
    central: g(t.declivePorSemana),
    baixo: t.ic95 ? g(t.ic95[0]) : g(t.declivePorSemana),
    alto: t.ic95 ? g(t.ic95[1]) : g(t.declivePorSemana),
    pontos,
    tendencia: { veredicto: t.veredicto, declivePorSemana: t.declivePorSemana, ic95: t.ic95 },
    semanas,
  };
}

/** Subida mais importante do percurso (maior desnível em segmentos seguidos ≥ `declSubidaMin`). */
function maiorSubida(alvo: VoltaBtt, p: ParametrosBtt) {
  let melhor: { k0: number; k1: number; desnivel: number } | null = null;
  let k0 = -1;
  const segs = alvo.segmentos;
  for (let k = 0; k <= segs.length; k++) {
    const sobe = k < segs.length && segs[k].declive >= p.declSubidaMin;
    if (sobe && k0 < 0) k0 = k;
    if (!sobe && k0 >= 0) {
      const desnivel = segs.slice(k0, k).reduce((t, s) => t + s.declive * s.comp, 0);
      if (!melhor || desnivel > melhor.desnivel) melhor = { k0, k1: k - 1, desnivel };
      k0 = -1;
    }
  }
  return melhor;
}

export type OpcoesPrevisaoBtt = {
  ate: string;
  dataProva: string;
  alvoS: number | null;
  perfis: Perfil[];
  /** Edições anteriores do mesmo percurso (calibração do B). */
  refIds: number[];
  /**
   * Edição de referência: tempo em movimento do Strava (resumo do aparelho) e tempos por
   * segmento medidos nos streams. Os dois não coincidem (o aparelho conta como movimento
   * troços lentos que os streams marcam como paragem), por isso os resultados passam a
   * "segundos do Strava" com o fator tempoS / Σ porSeg desta edição.
   */
  referencia: { tempoS: number; porSeg: number[] } | null;
  massa: (data: string) => number;
  bootstrap: boolean;
};

export function preverBtt(prep: Preparacao, zwift: SessaoZwift[], o: OpcoesPrevisaoBtt, p: ParametrosBtt) {
  const falta: string[] = [];
  const avisos: string[] = [];
  const a = estimadorA(prep, o.ate, p);
  const rel = relacaoAte(zwift, o.ate, p.zwiftSemanas);
  if (!rel) falta.push(`Estimador B: sem relação FC → W do Zwift nas ${p.zwiftSemanas} semanas anteriores.`);
  const cal = calibrar(prep, zwift, o.ate, o.refIds, o.massa, p);
  if (rel && cal.crr.every((x) => x == null)) falta.push("Estimador B: nenhuma volta para calibrar o Crr (sem Zwift na altura).");
  const massa = o.massa(o.ate);
  const ganho = ganhoPotencia(zwift, o.ate, o.dataProva, p);
  const ref = o.referencia;
  const somaRef = ref ? ref.porSeg.reduce((t, x) => t + x, 0) : 0;
  const fator = ref && somaRef > 0 ? ref.tempoS / somaRef : 1;
  const S = (x: number | null | undefined) => (x == null ? null : x * fator);

  const cenarios = o.perfis.map((perfil) => {
    const hoje = calcularCenario(prep, a, rel, cal.crr, massa, perfil, 1, p);
    const proj = calcularCenario(prep, a, rel, cal.crr, massa, perfil, 1 + ganho.central, p);
    return { nome: perfil.nome, hoje, projecao: proj };
  });
  const principal = cenarios[0];
  if (principal.hoje.tempoS == null) falta.push("Estimador A: há segmentos sem dados e o B não está disponível.");
  const segsSemDados = a.porSeg.filter((s) => s.nivel === 4).length;
  if (segsSemDados) avisos.push(`${segsSemDados} segmentos sem dados empíricos (usam o estimador B).`);
  const { tA, tB } = principal.hoje;
  if (tA != null && tB != null && Math.abs(tA - tB) / Math.min(tA, tB) > p.divergencia) {
    avisos.push(`Os estimadores A e B divergem ${Math.round((Math.abs(tA - tB) / Math.min(tA, tB)) * 100)}%.`);
  }

  // Bootstrap por sessão (voltas e sessões Zwift).
  let hoje = null;
  let projecao = null;
  if (principal.hoje.tempoS != null && o.alvoS != null && o.bootstrap) {
    const cv = reamostragens(prep.voltas.length, p.bootstrapN, 7);
    const cz = reamostragens(zwift.length, p.bootstrapN, 11);
    const xs: number[] = [];
    for (let i = 0; i < p.bootstrapN; i++) {
      const aa = estimadorA(prep, o.ate, p, cv[i]);
      const rr = relacaoAte(zwift, o.ate, p.zwiftSemanas, cz[i]);
      const cc = calibrar(prep, zwift, o.ate, o.refIds, o.massa, p, cv[i], cz[i]);
      const r = calcularCenario(prep, aa, rr, cc.crr, massa, o.perfis[0], 1, p);
      if (r.tempoS != null) xs.push(r.tempoS * fator);
    }
    const h = resumoTempos(xs, o.alvoS);
    const pr = resumoTempos(xs.map((x) => (x * (principal.projecao.tempoS ?? x)) / (principal.hoje.tempoS ?? x)), o.alvoS);
    if (h) hoje = { ...h, centralS: principal.hoje.tempoS * fator };
    if (pr && principal.projecao.tempoS != null) projecao = { ...pr, centralS: principal.projecao.tempoS * fator };
  }

  // Tabela por segmento (em segundos do Strava): referência · previsto · necessário para o
  // alvo. O necessário mantém as descidas e distribui a poupança pelo plano e pelas subidas.
  const refSeg = ref ? ref.porSeg.map((x) => x * fator) : null;
  let necessario: (number | null)[] | null = null;
  if (ref && refSeg && o.alvoS != null) {
    const desc = prep.alvo.segmentos.reduce((t, s, k) => t + (s.declive < -0.01 ? refSeg[k] : 0), 0);
    const k = ref.tempoS - desc > 0 ? (o.alvoS - desc) / (ref.tempoS - desc) : 1;
    necessario = prep.alvo.segmentos.map((s, i) => (s.declive < -0.01 ? refSeg[i] : refSeg[i] * k));
  }
  const segmentos = prep.alvo.segmentos.map((s, k) => ({
    dIni: s.dIni,
    comp: s.comp,
    declive: s.declive,
    classe: rotuloClasse(s.classe, p.classes),
    nivel: a.porSeg[k].nivel,
    referenciaS: refSeg ? refSeg[k] : null,
    previstoS: S(principal.hoje.porSeg[k].t),
    necessarioS: necessario ? necessario[k] : null,
    fcPerfil: o.perfis[0].fc[k],
    pontos: [s.i0, s.i1] as [number, number],
  }));

  const sub = maiorSubida(prep.alvo, p);
  const marco = sub
    ? {
        dIni: prep.alvo.segmentos[sub.k0].dIni,
        comp: prep.alvo.segmentos.slice(sub.k0, sub.k1 + 1).reduce((t, s) => t + s.comp, 0),
        desnivel: sub.desnivel,
        referenciaS: refSeg ? refSeg.slice(sub.k0, sub.k1 + 1).reduce((t, x) => t + x, 0) : null,
        previstoS: principal.hoje.porSeg.slice(sub.k0, sub.k1 + 1).reduce((t, x) => t + (x.t ?? 0), 0) * fator,
        alvoS: p.marcoSubidaMin > 0 ? p.marcoSubidaMin * 60 : null,
      }
    : null;

  const progresso =
    ref && o.alvoS != null && principal.hoje.tempoS != null && ref.tempoS !== o.alvoS
      ? (ref.tempoS - principal.hoje.tempoS * fator) / (ref.tempoS - o.alvoS)
      : null;

  return {
    suficiente: principal.hoje.tempoS != null,
    falta,
    avisos,
    ate: o.ate,
    cobertura: a.cobertura,
    niveis: [1, 2, 3, 4].map((n) => a.porSeg.filter((s) => s.nivel === n).length),
    relacao: rel,
    calibracao: { fonte: cal.fonte, voltas: cal.voltas, crr: cal.crr.map((c, i) => ({ classe: rotuloClasse(i, p.classes), crr: c })) },
    massaKg: massa,
    ganho,
    fatorMovimento: fator,
    cenarios: cenarios.map((c) => ({
      nome: c.nome,
      hojeS: S(c.hoje.tempoS),
      projecaoS: S(c.projecao.tempoS),
      aS: S(c.hoje.tA),
      aBrutoS: S(c.hoje.tABruto),
      bS: S(c.hoje.tB),
    })),
    hoje,
    projecao,
    segmentos,
    marco,
    progresso,
    dados: { voltas: prep.voltas.filter((v) => v.data < o.ate).length, zwift: zwift.filter((z) => z.data < o.ate).length },
  };
}

export type PrevisaoBtt = ReturnType<typeof preverBtt>;

/**
 * Backtest (aceitação da fase 4): prevê uma prova real só com dados anteriores a `ate`,
 * usando o perfil de FC real dessa prova, e compara com o tempo em movimento real.
 */
export function backtestBtt(
  alvo: VoltaBtt,
  voltas: VoltaBtt[],
  zwift: SessaoZwift[],
  ate: string,
  massa: (data: string) => number,
  p: ParametrosBtt,
) {
  const prep = preparar(alvo, voltas, p);
  const perfil: Perfil = { nome: "FC real da prova", fc: alvo.segmentos.map((s) => s.fcMedia) };
  const r = preverBtt(
    prep,
    zwift,
    { ate, dataProva: alvo.data, alvoS: null, perfis: [perfil], refIds: [], referencia: null, massa, bootstrap: false },
    p,
  );
  const c = r.cenarios[0];
  // Compara-se com o tempo em movimento da prova medido da mesma forma (nos streams);
  // o do resumo do Strava fica ao lado, com o fator entre os dois.
  const real = alvo.segmentos.reduce((t, s) => t + s.tempoMovS, 0);
  const erro = (t: number | null) => (t != null ? (t - real) / real : null);
  return {
    prova: { id: alvo.id, nome: alvo.nome, data: alvo.data, distanciaM: alvo.grelha.d[alvo.grelha.d.length - 1] },
    ate,
    realS: real,
    realStravaS: alvo.duracaoMovimentoS,
    fatorMovimento: real > 0 ? alvo.duracaoMovimentoS / real : null,
    previstoS: c.hojeS,
    aS: c.aS,
    aBrutoS: c.aBrutoS,
    bS: c.bS,
    erro: erro(c.hojeS),
    erroABruto: erro(c.aBrutoS),
    erroA: erro(c.aS),
    erroB: erro(c.bS),
    cobertura: r.cobertura,
    niveis: r.niveis,
    falta: r.falta,
    calibracao: r.calibracao,
    relacao: r.relacao,
    segmentos: r.segmentos.map((s, k) => ({
      dIni: s.dIni,
      comp: s.comp,
      declive: s.declive,
      classe: s.classe,
      nivel: s.nivel,
      fc: alvo.segmentos[k].fcMedia,
      realS: alvo.segmentos[k].tempoMovS,
      previstoS: s.previstoS,
    })),
  };
}
