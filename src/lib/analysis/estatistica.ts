// Estatística comum aos motores de previsão (funções puras): regressão ponderada e
// robusta, bootstrap determinístico, percentis e projeção com rendimentos decrescentes.

/** Gerador pseudo-aleatório determinístico (mulberry32): o mesmo seed dá o mesmo bootstrap. */
export function gerador(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Percentil p ∈ [0, 1] com interpolação linear. */
export function percentil(xs: number[], p: number): number {
  if (xs.length === 0) return NaN;
  const o = [...xs].sort((a, b) => a - b);
  const pos = (o.length - 1) * Math.min(1, Math.max(0, p));
  const i = Math.floor(pos);
  return i + 1 < o.length ? o[i] + (o[i + 1] - o[i]) * (pos - i) : o[i];
}

/** Peso por recência: 1 hoje, ½ ao fim de uma meia-vida. */
export function pesoRecencia(idadeDias: number, meiaVidaDias: number): number {
  return Math.pow(0.5, Math.max(0, idadeDias) / meiaVidaDias);
}

/** Dias entre duas datas ISO (b − a). */
export function diasDesde(a: string, b: string): number {
  return (Date.parse(`${b.slice(0, 10)}T00:00:00Z`) - Date.parse(`${a.slice(0, 10)}T00:00:00Z`)) / 86_400_000;
}

/** Soma `dias` a uma data ISO. */
export function somarDias(data: string, dias: number): string {
  const d = new Date(`${data.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Resolve A·x = b por eliminação de Gauss com pivotagem parcial (null se singular). */
function resolver(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((l, i) => [...l, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let l = c + 1; l < n; l++) if (Math.abs(M[l][c]) > Math.abs(M[p][c])) p = l;
    if (Math.abs(M[p][c]) < 1e-12) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let l = c + 1; l < n; l++) {
      const f = M[l][c] / M[c][c];
      for (let k = c; k <= n; k++) M[l][k] -= f * M[c][k];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let l = n - 1; l >= 0; l--) {
    let s = M[l][n];
    for (let k = l + 1; k < n; k++) s -= M[l][k] * x[k];
    x[l] = s / M[l][l];
  }
  return x;
}

/** Mínimos quadrados ponderados: y ≈ X·β (X já inclui a coluna de 1). */
export function mmqPonderados(X: number[][], y: number[], w: number[]): number[] | null {
  const k = X[0]?.length ?? 0;
  if (k === 0 || X.length < k) return null;
  const A = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const b = new Array<number>(k).fill(0);
  for (let i = 0; i < X.length; i++) {
    for (let r = 0; r < k; r++) {
      b[r] += w[i] * X[i][r] * y[i];
      for (let c = 0; c < k; c++) A[r][c] += w[i] * X[i][r] * X[i][c];
    }
  }
  return resolver(A, b);
}

/**
 * Regressão robusta de Huber (IRLS) com pesos à priori (ex.: recência). Escala dos
 * resíduos pela MAD; `k` = 1,345 dá 95% de eficiência com erros normais.
 */
export function regressaoHuber(X: number[][], y: number[], w: number[], k = 1.345, iteracoes = 30) {
  let beta = mmqPonderados(X, y, w);
  if (!beta) return null;
  let escala = 0;
  for (let it = 0; it < iteracoes; it++) {
    const b = beta;
    const res = X.map((x, i) => y[i] - x.reduce((s, v, j) => s + v * b[j], 0));
    const absOrd = res.map(Math.abs).sort((p, q) => p - q);
    escala = (absOrd[Math.floor(absOrd.length / 2)] ?? 0) / 0.6745;
    if (escala < 1e-9) break;
    const wr = res.map((r, i) => {
      const u = Math.abs(r) / (k * escala);
      return w[i] * (u <= 1 ? 1 : 1 / u);
    });
    const novo = mmqPonderados(X, y, wr);
    if (!novo) break;
    const mudou = novo.some((v, j) => Math.abs(v - b[j]) > 1e-9 * (1 + Math.abs(b[j])));
    beta = novo;
    if (!mudou) break;
  }
  return { beta, escala };
}

/**
 * Bootstrap por sessão: reamostra as sessões com reposição e devolve as contagens de
 * cada uma (o motor recalcula com pesos multiplicados pelas contagens).
 */
export function reamostragens(nSessoes: number, n: number, seed: number): number[][] {
  const r = gerador(seed);
  return Array.from({ length: n }, () => {
    const c = new Array<number>(nSessoes).fill(0);
    for (let i = 0; i < nSessoes; i++) c[Math.floor(r() * nSessoes)]++;
    return c;
  });
}

/**
 * Ganho relativo projetado até à prova, com rendimentos decrescentes: a melhoria por
 * semana atual vai-se esgotando com constante de tempo `tau` e nunca passa de `limite`.
 */
export function ganhoProjetado(declivePorSemana: number, semanas: number, tau: number, limite: number): number {
  if (semanas <= 0) return 0;
  const g = declivePorSemana * tau * (1 - Math.exp(-semanas / tau));
  return Math.max(-limite, Math.min(limite, g));
}

/** Resumo de uma distribuição de tempos: P10/P50/P90 e probabilidade de ficar ≤ alvo. */
export function resumoTempos(amostras: number[], alvoS: number, alargar = 1) {
  const xs = amostras.filter(Number.isFinite);
  if (xs.length === 0) return null;
  const p50 = percentil(xs, 0.5);
  const esc = xs.map((x) => p50 + (x - p50) * alargar);
  return {
    p10: percentil(esc, 0.1),
    p50,
    p90: percentil(esc, 0.9),
    probAlvo: esc.filter((x) => x <= alvoS).length / esc.length,
  };
}
