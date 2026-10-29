// Séries temporais a partir dos streams brutos (funções puras).

export type Streams = Record<string, unknown[]>;

/** Stream numérico (null onde falta ou não é número). */
export function numeros(s: Streams, tipo: string): (number | null)[] | null {
  const d = s[tipo];
  if (!Array.isArray(d) || d.length === 0) return null;
  return d.map((v) => (typeof v === "number" && Number.isFinite(v) ? v : null));
}

/**
 * Duração (s) que cada amostra representa: até à amostra seguinte. Lacunas maiores que
 * `maxLacuna` são pausas e valem 0; a última amostra vale 1 s.
 */
export function duracoes(time: number[], maxLacuna = 10): number[] {
  return time.map((t, i) => {
    if (i === time.length - 1) return 1;
    const dt = time[i + 1] - t;
    return dt > 0 && dt <= maxLacuna ? dt : 0;
  });
}

/**
 * Reamostra para 1 Hz mantendo o último valor. Dentro de lacunas maiores que `maxLacuna`
 * usa `vazio` (ex.: 0 W numa pausa), e o mesmo para amostras em falta.
 */
export function reamostrar1Hz(
  time: number[],
  valores: (number | null)[],
  maxLacuna = 10,
  vazio: number | null = 0,
): (number | null)[] {
  if (time.length === 0) return [];
  const t0 = time[0];
  const n = Math.floor(time[time.length - 1] - t0) + 1;
  const out = new Array<number | null>(n).fill(vazio);
  for (let i = 0; i < time.length; i++) {
    const inicio = Math.floor(time[i] - t0);
    const fim = i < time.length - 1 ? Math.floor(time[i + 1] - t0) : inicio + 1;
    const dentro = fim - inicio <= maxLacuna;
    const v = valores[i] ?? vazio;
    out[inicio] = v;
    if (dentro) for (let k = inicio + 1; k < fim && k < n; k++) out[k] = v;
  }
  return out;
}

/** Média móvel simples (janela à esquerda, inclui o próprio ponto). */
export function mediaMovel(v: number[], janela: number): number[] {
  const out = new Array<number>(v.length);
  let soma = 0;
  for (let i = 0; i < v.length; i++) {
    soma += v[i];
    if (i >= janela) soma -= v[i - janela];
    out[i] = soma / Math.min(i + 1, janela);
  }
  return out;
}

/** Maior média de `janela` amostras consecutivas (null se a série for mais curta). */
export function melhorMedia(v: number[], janela: number): number | null {
  if (janela <= 0 || v.length < janela) return null;
  let soma = 0;
  for (let i = 0; i < janela; i++) soma += v[i];
  let melhor = soma;
  for (let i = janela; i < v.length; i++) {
    soma += v[i] - v[i - janela];
    if (soma > melhor) melhor = soma;
  }
  return melhor / janela;
}

export function media(v: number[]): number {
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN;
}

export function desvioPadrao(v: number[]): number {
  if (v.length < 2) return 0;
  const m = media(v);
  return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1));
}

export function mediana(v: number[]): number {
  if (!v.length) return NaN;
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Regressão linear simples y = a + b·x, com erro-padrão do declive. */
export function regressaoLinear(x: number[], y: number[]) {
  const n = x.length;
  if (n < 2) return null;
  const mx = media(x);
  const my = media(y);
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (x[i] - mx) ** 2;
    sxy += (x[i] - mx) * (y[i] - my);
  }
  if (sxx === 0) return null;
  const b = sxy / sxx;
  const a = my - b * mx;
  let sse = 0;
  for (let i = 0; i < n; i++) sse += (y[i] - (a + b * x[i])) ** 2;
  const erroDeclive = n > 2 ? Math.sqrt(sse / (n - 2) / sxx) : Infinity;
  const syy = y.reduce((s, v) => s + (v - my) ** 2, 0);
  return { a, b, erroDeclive, r2: syy > 0 ? 1 - sse / syy : 1, n };
}

/** Quantil t de Student bilateral a 95% (aproximação suficiente para n ≥ 3). */
export function t95(grausLiberdade: number): number {
  const tabela = [12.71, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228];
  if (grausLiberdade < 1) return Infinity;
  if (grausLiberdade <= 10) return tabela[grausLiberdade - 1];
  if (grausLiberdade <= 20) return 2.086 + (20 - grausLiberdade) * 0.0142;
  if (grausLiberdade <= 30) return 2.042 + (30 - grausLiberdade) * 0.0044;
  return 1.96 + 0.082 * (30 / grausLiberdade);
}
