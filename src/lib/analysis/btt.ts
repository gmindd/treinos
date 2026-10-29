// BTT (brief §7.2), funções puras: grelha de distância, segmentação por declive e
// correspondência geográfica de troços entre voltas.

export type StreamsBtt = {
  time: number[];
  distance: (number | null)[];
  altitude: (number | null)[] | null;
  heartrate: (number | null)[] | null;
  latlng: ([number, number] | null)[] | null;
  cadence: (number | null)[] | null;
};

export type OpcoesGrelha = {
  passoM: number;
  atrasoFcS: number;
  vParagemMs: number;
  vAPeMs: number;
  maxLacunaS: number;
  medianaAltitudeM: number;
  janelaDecliveM: number;
  /** Metros de subida que valem 1 km no "km-esforço" (omissão: 100, como no trail). */
  dPlusPorKmEsforco?: number;
};

/** Grelha de distância: um ponto a cada `passoM`, e para cada passo k → k+1 o tempo em movimento e a FC. */
export type Grelha = {
  passoM: number;
  d: number[];
  /** Altitude suavizada (mediana móvel). */
  alt: number[];
  lat: (number | null)[];
  lon: (number | null)[];
  /** Declive (fração) em cada ponto, numa janela centrada. */
  declive: number[];
  /** Tempo em movimento acumulado até cada ponto (s). */
  tMov: number[];
  /** FC (com atraso) de cada passo; null sem dados. */
  fcPasso: (number | null)[];
  /** Passo feito a pé (cadência 0 e velocidade baixa). */
  aPe: boolean[];
  /** Km-esforço acumulado até cada ponto: km + D+ / dPlusPorKmEsforco. */
  kmEsforco: number[];
};

function interpolar(xs: number[], ys: (number | null)[], x: number, desde: { i: number }): number | null {
  while (desde.i < xs.length - 2 && xs[desde.i + 1] <= x) desde.i++;
  const i = desde.i;
  const [x0, x1] = [xs[i], xs[i + 1] ?? xs[i]];
  const [y0, y1] = [ys[i], ys[i + 1] ?? ys[i]];
  if (y0 == null && y1 == null) return null;
  if (y0 == null) return y1;
  if (y1 == null || x1 <= x0) return y0;
  const f = Math.min(1, Math.max(0, (x - x0) / (x1 - x0)));
  return y0 + (y1 - y0) * f;
}

function medianaMovel(v: number[], meia: number): number[] {
  return v.map((_, i) => {
    const w = v.slice(Math.max(0, i - meia), i + meia + 1).sort((a, b) => a - b);
    return w[Math.floor(w.length / 2)];
  });
}

/** Reamostra uma volta para a grelha de distância. Null sem distância/tempo suficientes. */
export function grelhaDistancia(s: StreamsBtt, o: OpcoesGrelha): Grelha | null {
  const n = s.time.length;
  if (n < 30 || s.distance.length !== n) return null;
  // Distância monotónica (o GPS às vezes recua uns centímetros).
  const dist: number[] = [];
  for (let i = 0; i < n; i++) dist.push(Math.max(dist[i - 1] ?? 0, s.distance[i] ?? dist[i - 1] ?? 0));
  // Tempo em movimento acumulado por amostra.
  const mov = new Array<number>(n).fill(0);
  for (let i = 1; i < n; i++) {
    const dt = s.time[i] - s.time[i - 1];
    const v = dt > 0 ? (dist[i] - dist[i - 1]) / dt : 0;
    mov[i] = mov[i - 1] + (dt > 0 && dt <= o.maxLacunaS && v >= o.vParagemMs ? dt : 0);
  }
  const total = dist[n - 1];
  const K = Math.floor(total / o.passoM) + 1;
  if (K < 4) return null;

  const d: number[] = [];
  const tAbs: number[] = [];
  const tMov: number[] = [];
  const altBruta: number[] = [];
  const lat: (number | null)[] = [];
  const lon: (number | null)[] = [];
  const pT = { i: 0 };
  const pM = { i: 0 };
  const pA = { i: 0 };
  const latS = s.latlng ? s.latlng.map((x) => (x ? x[0] : null)) : null;
  const lonS = s.latlng ? s.latlng.map((x) => (x ? x[1] : null)) : null;
  const pLa = { i: 0 };
  const pLo = { i: 0 };
  let ultimaAlt = 0;
  for (let k = 0; k < K; k++) {
    const x = k * o.passoM;
    d.push(x);
    tAbs.push(interpolar(dist, s.time, x, pT) ?? 0);
    tMov.push(interpolar(dist, mov, x, pM) ?? 0);
    const a = s.altitude ? interpolar(dist, s.altitude, x, pA) : null;
    ultimaAlt = a ?? ultimaAlt;
    altBruta.push(ultimaAlt);
    lat.push(latS ? interpolar(dist, latS, x, pLa) : null);
    lon.push(lonS ? interpolar(dist, lonS, x, pLo) : null);
  }
  const alt = medianaMovel(altBruta, Math.max(1, Math.round(o.medianaAltitudeM / o.passoM / 2)));
  const meia = Math.max(1, Math.round(o.janelaDecliveM / o.passoM / 2));
  const declive = alt.map((_, k) => {
    const a = Math.max(0, k - meia);
    const b = Math.min(K - 1, k + meia);
    return b > a ? (alt[b] - alt[a]) / (d[b] - d[a]) : 0;
  });

  // FC e cadência a meio de cada passo; a FC lida `atrasoFcS` mais à frente.
  const fcPasso: (number | null)[] = [];
  const aPe: boolean[] = [];
  const pF = { i: 0 };
  const pC = { i: 0 };
  for (let k = 0; k < K - 1; k++) {
    const tm = (tAbs[k] + tAbs[k + 1]) / 2;
    fcPasso.push(s.heartrate ? interpolar(s.time, s.heartrate, tm + o.atrasoFcS, pF) : null);
    const dtMov = tMov[k + 1] - tMov[k];
    const v = dtMov > 0 ? o.passoM / dtMov : 0;
    const cad = s.cadence ? interpolar(s.time, s.cadence, tm, pC) : null;
    aPe.push(cad != null && cad < 1 && v > 0 && v < o.vAPeMs);
  }
  const porKm = o.dPlusPorKmEsforco ?? 100;
  const kmEsforco = [0];
  for (let k = 1; k < K; k++) kmEsforco.push(kmEsforco[k - 1] + (d[k] - d[k - 1]) / 1000 + Math.max(0, alt[k] - alt[k - 1]) / porKm);
  return { passoM: o.passoM, d, alt, lat, lon, declive, tMov, fcPasso, aPe, kmEsforco };
}

/** Índice da classe de declive: 0 = "≤ limite[0]", …, limites.length = "> último". */
export function classeDeclive(declive: number, limitesPct: number[]): number {
  const pct = declive * 100;
  return limitesPct.filter((l) => pct > l).length;
}

export function rotuloClasse(c: number, limitesPct: number[]): string {
  const f = (x: number) => (x > 0 ? `+${x}` : `${x}`);
  if (c === 0) return `≤ ${limitesPct[0]}%`;
  if (c === limitesPct.length) return `> ${f(limitesPct[limitesPct.length - 1])}%`;
  return `${f(limitesPct[c - 1])} a ${f(limitesPct[c])}%`;
}

export type Segmento = {
  /** Pontos da grelha [i0, i1]. */
  i0: number;
  i1: number;
  dIni: number;
  comp: number;
  declive: number;
  classe: number;
  tempoMovS: number;
  v: number | null;
  fcMedia: number | null;
  /** Fração do tempo do segmento com FC acima do limiar. */
  fracAcima: number;
  fracAPe: number;
  /** Sinuosidade: mudança de direção acumulada (graus por 100 m); null sem GPS. */
  sinuosidade: number | null;
  /** Km-esforço já feito no início do segmento (estado de cansaço). */
  kmEsforcoIni: number;
};

/**
 * Sinuosidade de um troço: soma das mudanças de direção entre passos da grelha, em graus
 * por 100 m. Estradas e caminhos largos dão valores baixos; trilhos estreitos e técnicos,
 * altos (proxy do terreno, que a inclinação sozinha não capta).
 */
export function sinuosidadeTroco(g: Grelha, i0: number, i1: number): number | null {
  const lat0 = g.lat[i0];
  if (lat0 == null) return null;
  const cos = Math.cos((lat0 * Math.PI) / 180);
  let anterior: number | null = null;
  let soma = 0;
  let n = 0;
  for (let k = i0; k < i1; k++) {
    const [a, b, c, d] = [g.lat[k], g.lon[k], g.lat[k + 1], g.lon[k + 1]];
    if (a == null || b == null || c == null || d == null) continue;
    const rumo = (Math.atan2((d - b) * cos, c - a) * 180) / Math.PI;
    if (anterior != null) {
      let delta = Math.abs(rumo - anterior);
      if (delta > 180) delta = 360 - delta;
      soma += delta;
      n++;
    }
    anterior = rumo;
  }
  const comp = g.d[i1] - g.d[i0];
  return n >= 2 && comp > 0 ? (soma / comp) * 100 : null;
}

/** Estatísticas de um troço [i0, i1] de uma grelha. */
export function estatisticasTroco(g: Grelha, i0: number, i1: number, limiarFc: number) {
  let tempo = 0;
  let tFc = 0;
  let somaFc = 0;
  let tAcima = 0;
  let tAPe = 0;
  for (let k = i0; k < i1; k++) {
    const dt = g.tMov[k + 1] - g.tMov[k];
    tempo += dt;
    const fc = g.fcPasso[k];
    if (fc != null) {
      tFc += dt;
      somaFc += fc * dt;
      if (fc > limiarFc) tAcima += dt;
    }
    if (g.aPe[k]) tAPe += dt;
  }
  const comp = g.d[i1] - g.d[i0];
  return {
    comp,
    declive: comp > 0 ? (g.alt[i1] - g.alt[i0]) / comp : 0,
    tempoMovS: tempo,
    v: tempo > 0 ? comp / tempo : null,
    fcMedia: tFc > tempo / 2 && tFc > 0 ? somaFc / tFc : null,
    fracAcima: tFc > 0 ? tAcima / tFc : 0,
    fracAPe: tempo > 0 ? tAPe / tempo : 0,
  };
}

/**
 * Segmentos homogéneos: passos seguidos com a mesma classe de declive; os que ficam
 * abaixo de `minM` fundem-se com o vizinho de declive mais parecido.
 */
export function segmentar(g: Grelha, limitesPct: number[], minM: number, limiarFc: number): Segmento[] {
  const K = g.d.length;
  const classePasso = Array.from({ length: K - 1 }, (_, k) =>
    classeDeclive((g.declive[k] + g.declive[k + 1]) / 2, limitesPct),
  );
  let blocos: { i0: number; i1: number }[] = [];
  let ini = 0;
  for (let k = 1; k <= K - 1; k++) {
    if (k === K - 1 || classePasso[k] !== classePasso[ini]) {
      blocos.push({ i0: ini, i1: k });
      ini = k;
    }
  }
  const decl = (b: { i0: number; i1: number }) => (g.alt[b.i1] - g.alt[b.i0]) / (g.d[b.i1] - g.d[b.i0]);
  const comp = (b: { i0: number; i1: number }) => g.d[b.i1] - g.d[b.i0];
  while (blocos.length > 1) {
    let idx = -1;
    for (let i = 0; i < blocos.length; i++) {
      if (comp(blocos[i]) < minM && (idx < 0 || comp(blocos[i]) < comp(blocos[idx]))) idx = i;
    }
    if (idx < 0) break;
    const b = blocos[idx];
    const esq = blocos[idx - 1];
    const dir = blocos[idx + 1];
    const viz =
      !esq ? idx + 1 : !dir ? idx - 1 : Math.abs(decl(esq) - decl(b)) <= Math.abs(decl(dir) - decl(b)) ? idx - 1 : idx + 1;
    const [a, c] = viz < idx ? [viz, idx] : [idx, viz];
    blocos.splice(a, 2, { i0: blocos[a].i0, i1: blocos[c].i1 });
  }
  // Vizinhos que ficaram na mesma classe passam a um só segmento.
  const juntos: { i0: number; i1: number }[] = [];
  for (const b of blocos) {
    const u = juntos[juntos.length - 1];
    if (u && classeDeclive(decl(u), limitesPct) === classeDeclive(decl(b), limitesPct)) u.i1 = b.i1;
    else juntos.push({ ...b });
  }
  blocos = juntos;
  return blocos.map((b) => {
    const e = estatisticasTroco(g, b.i0, b.i1, limiarFc);
    return {
      i0: b.i0,
      i1: b.i1,
      dIni: g.d[b.i0],
      ...e,
      classe: classeDeclive(e.declive, limitesPct),
      sinuosidade: sinuosidadeTroco(g, b.i0, b.i1),
      kmEsforcoIni: g.kmEsforco[b.i0],
    };
  });
}

// ---------------------------------------------------------------------------
// Correspondência geográfica
// ---------------------------------------------------------------------------

export type IndiceEspacial = { celula: number; cosLat: number; mapa: Map<string, number[]>; g: Grelha };

const M_GRAU = 111_320;

function xy(lat: number, lon: number, cosLat: number): [number, number] {
  return [lon * M_GRAU * cosLat, lat * M_GRAU];
}

export function indiceEspacial(g: Grelha, celula: number, latRef: number): IndiceEspacial {
  const cosLat = Math.cos((latRef * Math.PI) / 180);
  const mapa = new Map<string, number[]>();
  for (let k = 0; k < g.d.length; k++) {
    const la = g.lat[k];
    const lo = g.lon[k];
    if (la == null || lo == null) continue;
    const [x, y] = xy(la, lo, cosLat);
    const chave = `${Math.floor(x / celula)},${Math.floor(y / celula)}`;
    const l = mapa.get(chave);
    if (l) l.push(k);
    else mapa.set(chave, [k]);
  }
  return { celula, cosLat, mapa, g };
}

/**
 * O mesmo troço noutra volta: cada ponto do segmento-alvo tem de ter um ponto da volta a
 * menos de `bufferM`, em ≥ `sobreposicao` dos pontos, no mesmo sentido e numa só passagem.
 * Devolve o troço [j0, j1] da grelha da volta.
 */
export function casarTroco(
  alvo: Grelha,
  i0: number,
  i1: number,
  indice: IndiceEspacial,
  bufferM: number,
  sobreposicao: number,
): { j0: number; j1: number } | null {
  const L = i1 - i0 + 1;
  const js: number[] = [];
  const b2 = bufferM * bufferM;
  for (let k = i0; k <= i1; k++) {
    const la = alvo.lat[k];
    const lo = alvo.lon[k];
    if (la == null || lo == null) continue;
    const [x, y] = xy(la, lo, indice.cosLat);
    const cx = Math.floor(x / indice.celula);
    const cy = Math.floor(y / indice.celula);
    let melhor = -1;
    let melhorD = b2;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const j of indice.mapa.get(`${cx + dx},${cy + dy}`) ?? []) {
          const [xj, yj] = xy(indice.g.lat[j] as number, indice.g.lon[j] as number, indice.cosLat);
          const d2 = (xj - x) ** 2 + (yj - y) ** 2;
          if (d2 <= melhorD) {
            melhorD = d2;
            melhor = j;
          }
        }
      }
    }
    if (melhor >= 0) js.push(melhor);
  }
  if (js.length < sobreposicao * L) return null;
  const ord = [...js].sort((a, b) => a - b);
  const med = ord[Math.floor(ord.length / 2)];
  const banda = js.filter((j) => Math.abs(j - med) <= 2 * L + 4);
  if (banda.length < sobreposicao * L) return null;
  const j0 = banda[0];
  const j1 = banda[banda.length - 1];
  const vao = j1 - j0;
  if (vao <= 0 || vao < 0.5 * (L - 1) || vao > 2 * (L - 1) + 2) return null;
  return { j0, j1 };
}
