// Limites de pedidos do Strava (funções puras).
// Os cabeçalhos trazem "limite15,limiteDia" e "uso15,usoDia". As janelas de 15 min
// fecham aos :00/:15/:30/:45 e o limite diário volta a zero à meia-noite UTC.

export type ParLimites = { limite15: number; uso15: number; limiteDia: number; usoDia: number };
/** Último estado conhecido: geral (X-RateLimit) e de leitura (X-ReadRateLimit). */
export type EstadoLimites = { em: string; pares: ParLimites[] };

const QUINZE_MIN = 15 * 60 * 1000;

function par(limite: string | null, uso: string | null): ParLimites | null {
  if (!limite || !uso) return null;
  const [l15, lDia] = limite.split(",").map(Number);
  const [u15, uDia] = uso.split(",").map(Number);
  if (![l15, lDia, u15, uDia].every(Number.isFinite)) return null;
  return { limite15: l15, uso15: u15, limiteDia: lDia, usoDia: uDia };
}

export function lerLimites(h: Headers, agora: Date): EstadoLimites | null {
  const pares = [
    par(h.get("x-ratelimit-limit"), h.get("x-ratelimit-usage")),
    par(h.get("x-readratelimit-limit"), h.get("x-readratelimit-usage")),
  ].filter((p): p is ParLimites => p !== null);
  return pares.length ? { em: agora.toISOString(), pares } : null;
}

function inicioJanela15(t: number) {
  return Math.floor(t / QUINZE_MIN) * QUINZE_MIN;
}

function inicioDiaUtc(t: number) {
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Até quando não se deve pedir nada ao Strava (null = pode pedir já). Pára quando faltam
 * `margem` pedidos para o limite, enquanto a janela em que esse uso foi medido não acabar.
 */
export function pausaAte(estado: EstadoLimites | null, agora: Date, margem = 3): Date | null {
  if (!estado) return null;
  const medido = new Date(estado.em).getTime();
  const t = agora.getTime();
  let ate = 0;
  for (const p of estado.pares) {
    const fim15 = inicioJanela15(medido) + QUINZE_MIN;
    if (p.uso15 >= p.limite15 - margem && t < fim15) ate = Math.max(ate, fim15);
    const fimDia = inicioDiaUtc(medido) + 24 * 60 * 60 * 1000;
    if (p.usoDia >= p.limiteDia - margem && t < fimDia) ate = Math.max(ate, fimDia);
  }
  // Pequena folga para não acertar exatamente na viragem da janela.
  return ate > 0 ? new Date(ate + 5_000) : null;
}
