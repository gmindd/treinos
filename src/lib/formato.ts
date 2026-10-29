// Formatação pt-PT: datas dd/mm/aaaa, durações h:mm:ss, fuso Europe/Lisbon.

export const FUSO = "Europe/Lisbon";

/** "2026-12-26" → "26/12/2026". */
export function formatarData(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

/** 8263 → "2:17:43"; 3540 → "59:00". */
export function formatarDuracao(segundos: number): string {
  const s = Math.round(segundos);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** Dia em Lisboa de um instante, em ISO: "2026-10-28". */
export function dataIsoLisboa(instante: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instante);
}

/** 10234 → "10,23 km". */
export function formatarDistancia(metros: number): string {
  return `${(metros / 1000).toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} km`;
}

/** Data e hora local de Lisboa, ex.: "28/10/2026 18:42". */
export function formatarDataHora(instante: Date): string {
  return new Intl.DateTimeFormat("pt-PT", {
    timeZone: FUSO,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(instante);
}

/** Número com vírgula decimal: 0.874 → "0,87". */
export function formatarNumero(v: number | null | undefined, casas = 0): string {
  if (v == null || !Number.isFinite(v)) return "—";
  // Evita "-0,00" quando o valor arredonda para zero.
  const r = Number(v.toFixed(casas)) || 0;
  return r.toLocaleString("pt-PT", { minimumFractionDigits: casas, maximumFractionDigits: casas, useGrouping: false });
}

/**
 * "2:00:00" → segundos. Com duas partes, `duasPartes` decide: "1:55" é h:mm (BTT) ou
 * "55:30" é mm:ss (corrida). Null se inválido.
 */
export function lerDuracao(texto: string, duasPartes: "h:mm" | "mm:ss" = "h:mm"): number | null {
  const t = texto.trim();
  const tres = /^(\d{1,2}):([0-5]\d):([0-5]\d)$/.exec(t);
  if (tres) {
    const s = Number(tres[1]) * 3600 + Number(tres[2]) * 60 + Number(tres[3]);
    return s > 0 ? s : null;
  }
  const duas = /^(\d{1,3}):([0-5]\d)$/.exec(t);
  if (!duas) return null;
  if (duasPartes === "h:mm") {
    const s = Number(duas[1]) * 3600 + Number(duas[2]) * 60;
    return s > 0 && Number(duas[1]) < 24 ? s : null;
  }
  const s = Number(duas[1]) * 60 + Number(duas[2]);
  return s > 0 ? s : null;
}

/** "10,5" ou "10.5" → número; null se vazio ou inválido. */
export function lerNumero(texto: string): number | null {
  const t = texto.trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
