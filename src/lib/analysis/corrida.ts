// Corrida: ritmo ajustado ao declive (GAP), rTSS e ritmo de limiar (funções puras).
import { desvioPadrao, media, mediaMovel, reamostrar1Hz, regressaoLinear } from "./series";

/** Custo energético da corrida (J/kg/m) em função do declive em fração (Minetti 2002). */
export function custoMinetti(i: number): number {
  const g = Math.max(-0.45, Math.min(0.45, i));
  return 155.4 * g ** 5 - 30.4 * g ** 4 - 43.3 * g ** 3 + 46.3 * g ** 2 + 19.5 * g + 3.6;
}

/**
 * Declive em cada amostra, medido entre os pontos que distam pelo menos `janelaM`
 * (metade para cada lado). Sem altitude: plano.
 */
export function declives(dist: number[], alt: (number | null)[] | null, janelaM = 30): number[] {
  const n = dist.length;
  if (!alt) return new Array(n).fill(0);
  const out = new Array<number>(n).fill(0);
  let a = 0;
  let b = 0;
  for (let i = 0; i < n; i++) {
    while (a < i && dist[i] - dist[a + 1] >= janelaM / 2) a++;
    if (b < i) b = i;
    while (b < n - 1 && dist[b] - dist[i] < janelaM / 2) b++;
    const dd = dist[b] - dist[a];
    const za = alt[a];
    const zb = alt[b];
    out[i] = dd >= janelaM * 0.8 && za != null && zb != null ? (zb - za) / dd : i > 0 ? out[i - 1] : 0;
  }
  return out;
}

/** Velocidade ajustada ao declive: v · C(i) / C(0). */
export function velocidadeGap(v: number, declive: number): number {
  return (v * custoMinetti(declive)) / custoMinetti(0);
}

export type AmostrasCorrida = {
  /** Série a 1 Hz da velocidade GAP (m/s), 0 em paragens. */
  gap1Hz: number[];
  /** FC a 1 Hz (null onde falta). */
  fc1Hz: (number | null)[];
  /** Segundos em movimento. */
  duracaoMovimentoS: number;
};

/** Prepara as séries de uma corrida. Devolve null sem distância/tempo. */
export function amostrasCorrida(
  time: number[],
  dist: (number | null)[] | null,
  alt: (number | null)[] | null,
  fc: (number | null)[] | null,
  opcoes: { vParagem: number; janelaDecliveM: number; maxLacuna?: number; vMax?: number },
): AmostrasCorrida | null {
  if (!dist || dist.length !== time.length || time.length < 60) return null;
  const d = dist.map((v, i) => v ?? (i > 0 ? (dist[i - 1] ?? 0) : 0));
  const dec = declives(d, alt, opcoes.janelaDecliveM);
  const maxLacuna = opcoes.maxLacuna ?? 10;
  // Saltos do GPS (ex.: 64 m no 1.º segundo) contam como paragem, não como sprint.
  const vMax = opcoes.vMax ?? 8;
  const gap: (number | null)[] = time.map((t, i) => {
    if (i === time.length - 1) return 0;
    const dt = time[i + 1] - t;
    if (dt <= 0 || dt > maxLacuna) return 0;
    const v = (d[i + 1] - d[i]) / dt;
    return v < opcoes.vParagem || v > vMax ? 0 : velocidadeGap(v, dec[i]);
  });
  const gap1Hz = reamostrar1Hz(time, gap, maxLacuna, 0) as number[];
  const fc1Hz = fc ? reamostrar1Hz(time, fc, maxLacuna, null) : new Array(gap1Hz.length).fill(null);
  return { gap1Hz, fc1Hz, duracaoMovimentoS: gap1Hz.filter((v) => v > 0).length };
}

/**
 * Velocidade GAP "normalizada": como a NP, 4.ª potência da média de 30 s, só em movimento.
 * Só entram médias de 30 s completas, para uma amostra isolada no início não pesar sozinha.
 */
export function velocidadeNormalizada(gap1Hz: number[]): number | null {
  const m30 = mediaMovel(gap1Hz, 30).filter((_, i) => i >= 29 && gap1Hz[i] > 0);
  if (m30.length < 60) return null;
  return Math.pow(m30.reduce((s, v) => s + v ** 4, 0) / m30.length, 0.25);
}

/** rTSS = duração em movimento (h) × IF² × 100, com IF = velocidade normalizada / velocidade de limiar. */
export function rTss(vNormalizada: number, duracaoMovimentoS: number, vLimiar: number) {
  const intensidade = vNormalizada / vLimiar;
  return { tss: (duracaoMovimentoS / 3600) * intensidade ** 2 * 100, intensidade };
}

export type JanelaEstavel = { v: number; fc: number };

/**
 * Janelas estáveis (brief §7.1): depois do aquecimento, janelas seguidas de `janelaS` com
 * CV da velocidade < `cvMax`, todas em movimento. A FC é lida `atrasoFcS` mais à frente.
 */
export function janelasEstaveis(
  a: AmostrasCorrida,
  o: { aquecimentoS: number; janelaS: number; cvMax: number; atrasoFcS: number },
): JanelaEstavel[] {
  const out: JanelaEstavel[] = [];
  for (let i = o.aquecimentoS; i + o.janelaS + o.atrasoFcS <= a.gap1Hz.length; i += o.janelaS) {
    const v = a.gap1Hz.slice(i, i + o.janelaS);
    if (v.some((x) => x <= 0)) continue;
    const mv = media(v);
    if (desvioPadrao(v) / mv >= o.cvMax) continue;
    const fc = a.fc1Hz.slice(i + o.atrasoFcS, i + o.janelaS + o.atrasoFcS);
    if (fc.some((x) => x == null || x < 60 || x > 230)) continue;
    out.push({ v: mv, fc: media(fc as number[]) });
  }
  return out;
}

/**
 * Velocidade de limiar (≈ a que se aguenta 1 h) a partir de duas fontes; usa-se a maior:
 * - velocidade à FC de limiar na regressão FC → velocidade das janelas estáveis;
 * - melhores esforços (≥ 12 min) convertidos para 60 min com Riegel.
 */
export function velocidadeLimiar(
  janelas: JanelaEstavel[],
  esforcos: { distanciaM: number; tempoS: number }[],
  lthr: number,
  o: { minJanelas: number; riegel: number },
) {
  let porFc: number | null = null;
  if (janelas.length >= o.minJanelas) {
    const r = regressaoLinear(
      janelas.map((j) => j.fc),
      janelas.map((j) => j.v),
    );
    if (r && r.b > 0) porFc = r.a + r.b * lthr;
  }
  let porEsforcos: number | null = null;
  for (const e of esforcos) {
    if (e.tempoS < 720) continue;
    const v60 = (e.distanciaM / e.tempoS) * Math.pow(e.tempoS / 3600, 1 - 1 / o.riegel);
    if (porEsforcos === null || v60 > porEsforcos) porEsforcos = v60;
  }
  const v = Math.max(porFc ?? 0, porEsforcos ?? 0);
  return { v: v > 0 ? v : null, porFc, porEsforcos };
}
