// Leitura de ficheiros GPX (percursos-alvo), função pura sem dependências: pontos de
// trilho (ou de rota), altitude, hora e FC das extensões Garmin/Strava quando existem.

export type PontoGpx = { lat: number; lon: number; ele: number | null; t: number | null; fc: number | null };

export type Gpx = {
  nome: string | null;
  pontos: PontoGpx[];
  /** Distância acumulada (m) em cada ponto. */
  d: number[];
  distanciaM: number;
  desnivelM: number;
  temTempo: boolean;
  temFc: boolean;
};

const RAIO = 6_371_000;

export function haversine(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r;
  const dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * RAIO * Math.asin(Math.min(1, Math.sqrt(h)));
}

function atributo(attrs: string, nome: string): number | null {
  const m = new RegExp(`\\b${nome}\\s*=\\s*["']([^"']+)["']`).exec(attrs);
  const v = m ? Number(m[1]) : NaN;
  return Number.isFinite(v) ? v : null;
}

function etiqueta(corpo: string, nome: string): string | null {
  const m = new RegExp(`<(?:[\\w-]+:)?${nome}\\b[^>]*>([^<]*)</(?:[\\w-]+:)?${nome}>`).exec(corpo);
  return m ? m[1].trim() : null;
}

/** Desnível positivo com histerese (ignora oscilações < `limiarM` da altitude). */
export function desnivelPositivo(eles: (number | null)[], limiarM = 3): number {
  let total = 0;
  let base: number | null = null;
  for (const e of eles) {
    if (e == null) continue;
    if (base == null) base = e;
    else if (e - base >= limiarM) {
      total += e - base;
      base = e;
    } else if (base - e >= limiarM) base = e;
  }
  return total;
}

export function lerGpx(texto: string): Gpx {
  const nome = etiqueta(texto.split(/<trk\b|<rte\b/)[1] ?? texto, "name") ?? etiqueta(texto, "name");
  const pontos: PontoGpx[] = [];
  const re = /<(trkpt|rtept)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/g;
  for (let m = re.exec(texto); m; m = re.exec(texto)) {
    const lat = atributo(m[2], "lat");
    const lon = atributo(m[2], "lon");
    if (lat == null || lon == null) continue;
    const corpo = m[3] ?? "";
    const ele = Number(etiqueta(corpo, "ele"));
    const hora = etiqueta(corpo, "time");
    const t = hora ? Date.parse(hora) / 1000 : NaN;
    const fc = Number(etiqueta(corpo, "hr") ?? etiqueta(corpo, "heartrate"));
    pontos.push({
      lat,
      lon,
      ele: etiqueta(corpo, "ele") != null && Number.isFinite(ele) ? ele : null,
      t: Number.isFinite(t) ? t : null,
      fc: Number.isFinite(fc) && fc > 0 ? fc : null,
    });
  }
  const d = [0];
  for (let i = 1; i < pontos.length; i++) d.push(d[i - 1] + haversine(pontos[i - 1], pontos[i]));
  const comTempo = pontos.filter((p) => p.t != null).length;
  return {
    nome: nome ? nome.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">") : null,
    pontos,
    d,
    distanciaM: d[d.length - 1] ?? 0,
    desnivelM: desnivelPositivo(pontos.map((p) => p.ele)),
    temTempo: pontos.length > 1 && comTempo >= pontos.length * 0.9,
    temFc: pontos.some((p) => p.fc != null),
  };
}

/**
 * Streams no formato do Strava a partir do GPX. Sem horas, o tempo é sintético (4 m/s)
 * só para a grelha funcionar; nesse caso não há tempos de referência.
 */
export function streamsDoGpx(g: Gpx) {
  const t0 = g.pontos.find((p) => p.t != null)?.t ?? 0;
  const time = g.temTempo
    ? g.pontos.map((p, i) => (p.t != null ? p.t - t0 : g.d[i] / 4))
    : g.d.map((x) => x / 4);
  // Horas repetidas ou a recuar (GPX mal formados) passam a monotónicas.
  for (let i = 1; i < time.length; i++) if (time[i] < time[i - 1]) time[i] = time[i - 1];
  return {
    time,
    distance: g.d,
    altitude: g.pontos.map((p) => p.ele),
    heartrate: g.temFc ? g.pontos.map((p) => p.fc) : null,
    latlng: g.pontos.map((p) => [p.lat, p.lon] as [number, number]),
    cadence: null,
  };
}
