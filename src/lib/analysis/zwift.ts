// Análise Zwift (brief §8): blocos estáveis, FC/W, EF, desacoplamento, CP/W', tendências.
import { desvioPadrao, media, mediaMovel, mediana, regressaoLinear, t95 } from "./series";

export type JanelaPotencia = { p: number; fc: number };

/**
 * Blocos de potência estável: um bloco começa quando a média de 30 s se afasta mais de
 * `variacaoBloco` da média do bloco. Em cada bloco descartam-se os primeiros
 * `descartarInicioS` (cinética da FC) e o resto é cortado em janelas de `janelaS` com
 * CV da potência < `cvMax`, medido na média móvel de `suavizarS` (fora do modo ERG a
 * potência segundo a segundo varia muito mais do que a FC acompanha).
 */
export function janelasPotencia(
  watts1Hz: number[],
  fc1Hz: (number | null)[],
  o: { janelaS: number; cvMax: number; descartarInicioS: number; variacaoBloco?: number; minW?: number; suavizarS?: number },
): JanelaPotencia[] {
  const variacao = o.variacaoBloco ?? 0.075;
  const minW = o.minW ?? 50;
  const m30 = mediaMovel(watts1Hz, 30);
  const suave = mediaMovel(watts1Hz, Math.max(1, o.suavizarS ?? 1));
  const blocos: [number, number][] = [];
  let inicio = 0;
  let soma = 0;
  for (let i = 0; i < m30.length; i++) {
    const mBloco = i > inicio ? soma / (i - inicio) : m30[i];
    if (i > inicio && Math.abs(m30[i] - mBloco) > variacao * Math.max(mBloco, 1)) {
      blocos.push([inicio, i]);
      inicio = i;
      soma = 0;
    }
    soma += m30[i];
  }
  blocos.push([inicio, m30.length]);

  const out: JanelaPotencia[] = [];
  for (const [a, b] of blocos) {
    for (let i = a + o.descartarInicioS; i + o.janelaS <= b; i += o.janelaS) {
      const w = watts1Hz.slice(i, i + o.janelaS);
      const mw = media(w);
      const ws = suave.slice(i, i + o.janelaS);
      if (mw < minW || desvioPadrao(ws) / media(ws) >= o.cvMax) continue;
      const fc = fc1Hz.slice(i, i + o.janelaS);
      if (fc.some((x) => x == null || x < 60 || x > 230)) continue;
      out.push({ p: mw, fc: media(fc as number[]) });
    }
  }
  return out;
}

/**
 * Regressão FC = α + β·P sobre as janelas estáveis. Devolve FC a 150/180/200 W e W a
 * 150/160 bpm, marcando como extrapolado o que cai fora da gama de potências observada.
 */
export function relacaoFcPotencia(janelas: JanelaPotencia[]) {
  if (janelas.length < 3) return null;
  const ps = janelas.map((j) => j.p);
  const pMin = Math.min(...ps);
  const pMax = Math.max(...ps);
  if (pMax - pMin < 30) return null;
  const r = regressaoLinear(
    ps,
    janelas.map((j) => j.fc),
  );
  if (!r || r.b <= 0) return null;
  const fcA = (w: number) => ({ valor: r.a + r.b * w, extrapolado: w < pMin - 10 || w > pMax + 10 });
  const wA = (bpm: number) => {
    const w = (bpm - r.a) / r.b;
    return { valor: w, extrapolado: w < pMin - 10 || w > pMax + 10 };
  };
  return {
    alfa: r.a,
    beta: r.b,
    r2: r.r2,
    n: janelas.length,
    gamaW: [pMin, pMax] as [number, number],
    fc150W: fcA(150),
    fc180W: fcA(180),
    fc200W: fcA(200),
    w150bpm: wA(150),
    w160bpm: wA(160),
  };
}

/**
 * Desacoplamento Pa:HR: variação do rácio potência/FC da 1.ª para a 2.ª metade
 * (positivo = a FC subiu para a mesma potência). Só em sessões estáveis: ≥ `minS` de
 * dados e potência média das metades a menos de `maxDiferencaP` uma da outra.
 */
export function desacoplamento(
  watts1Hz: number[],
  fc1Hz: (number | null)[],
  minS = 3600,
  maxDiferencaP = 0.05,
): number | null {
  const pares = watts1Hz
    .map((w, i) => [w, fc1Hz[i]] as const)
    .filter((x): x is readonly [number, number] => x[1] != null && x[1] > 0);
  if (pares.length < minS) return null;
  const meio = Math.floor(pares.length / 2);
  const [a, b] = [pares.slice(0, meio), pares.slice(meio)];
  const p1 = media(a.map((x) => x[0]));
  const p2 = media(b.map((x) => x[0]));
  if (p1 <= 0 || Math.abs(p2 - p1) / p1 > maxDiferencaP) return null;
  const ef = (xs: (readonly [number, number])[]) => media(xs.map((x) => x[0])) / media(xs.map((x) => x[1]));
  const ef1 = ef(a);
  const ef2 = ef(b);
  return ef1 > 0 ? (ef1 - ef2) / ef1 : null;
}

/**
 * CP / W' (modelo de 2 parâmetros): trabalho = CP·t + W', ajustado à curva de potência
 * entre 3 e 20 min.
 */
export function cpWLinha(curva: Record<number, number | null>) {
  const pontos = Object.entries(curva)
    .map(([t, p]) => [Number(t), p] as const)
    .filter((x): x is readonly [number, number] => x[1] != null && x[0] >= 180 && x[0] <= 1200);
  if (pontos.length < 3) return null;
  const r = regressaoLinear(
    pontos.map(([t]) => t),
    pontos.map(([t, p]) => p * t),
  );
  if (!r || r.b <= 0) return null;
  return { cp: r.b, wLinha: r.a, r2: r.r2, n: pontos.length };
}

/** Curva com o máximo de cada duração entre várias sessões. */
export function curvaMaxima(curvas: Record<number, number | null>[]): Record<number, number | null> {
  const out: Record<number, number | null> = {};
  for (const c of curvas) {
    for (const [d, p] of Object.entries(c)) {
      const k = Number(d);
      if (p != null && (out[k] == null || p > (out[k] as number))) out[k] = p;
    }
  }
  return out;
}

export type Veredicto = "melhorou" | "piorou" | "inconclusivo";

/**
 * Tendência de uma métrica por sessão: mediana móvel de 4 semanas e declive (por semana)
 * com IC 95%. Só diz "melhorou"/"piorou" se o IC não incluir zero.
 */
export function tendencia(
  pontos: { data: string; valor: number }[],
  maiorEMelhor: boolean,
): {
  veredicto: Veredicto;
  declivePorSemana: number | null;
  ic95: [number, number] | null;
  n: number;
  medianaMovel: { data: string; valor: number }[];
} {
  const ord = [...pontos].sort((a, b) => a.data.localeCompare(b.data));
  const dia = (d: string) => new Date(`${d}T00:00:00Z`).getTime() / 86_400_000;
  const medianaMovel = ord.map((p) => ({
    data: p.data,
    valor: mediana(ord.filter((q) => dia(q.data) > dia(p.data) - 28 && q.data <= p.data).map((q) => q.valor)),
  }));
  const r =
    ord.length >= 4
      ? regressaoLinear(
          ord.map((p) => dia(p.data) / 7),
          ord.map((p) => p.valor),
        )
      : null;
  if (!r || !Number.isFinite(r.erroDeclive)) {
    return { veredicto: "inconclusivo", declivePorSemana: r?.b ?? null, ic95: null, n: ord.length, medianaMovel };
  }
  const margem = t95(r.n - 2) * r.erroDeclive;
  const ic95: [number, number] = [r.b - margem, r.b + margem];
  let veredicto: Veredicto = "inconclusivo";
  if (ic95[0] > 0) veredicto = maiorEMelhor ? "melhorou" : "piorou";
  else if (ic95[1] < 0) veredicto = maiorEMelhor ? "piorou" : "melhorou";
  return { veredicto, declivePorSemana: r.b, ic95, n: ord.length, medianaMovel };
}
