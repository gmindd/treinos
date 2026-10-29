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
