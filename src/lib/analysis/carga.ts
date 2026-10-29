// Fitness / Fadiga / Forma (CTL / ATL / TSB) a partir do TSS diário (funções puras).

export type DiaCarga = { data: string; tss: number };
export type PontoCarga = { data: string; tss: number; ctl: number; atl: number; tsb: number };

/** Dias seguidos (ISO) de `inicio` a `fim`, inclusive. */
export function diasEntre(inicio: string, fim: string): string[] {
  const out: string[] = [];
  const d = new Date(`${inicio}T00:00:00Z`);
  const f = new Date(`${fim}T00:00:00Z`);
  while (d <= f) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/**
 * Médias exponenciais: X_hoje = X_ontem + (TSS_hoje − X_ontem)·(1 − e^(−1/n)).
 * `sementes` (opcional) fixa CTL/ATL no fim de um dia, para alinhar com outra fonte.
 * TSB = CTL − ATL do próprio dia.
 */
export function serieCarga(
  dias: DiaCarga[],
  o: { ctlDias: number; atlDias: number; sementes?: Record<string, { ctl?: number; atl?: number }> },
): PontoCarga[] {
  const kc = 1 - Math.exp(-1 / o.ctlDias);
  const ka = 1 - Math.exp(-1 / o.atlDias);
  let ctl = 0;
  let atl = 0;
  return dias.map(({ data, tss }) => {
    ctl += (tss - ctl) * kc;
    atl += (tss - atl) * ka;
    const s = o.sementes?.[data];
    if (s?.ctl != null) ctl = s.ctl;
    if (s?.atl != null) atl = s.atl;
    return { data, tss, ctl, atl, tsb: ctl - atl };
  });
}

/** Esforço 0-10 a partir do TSS: 10·(1 − e^(−TSS/escala)). Com escala 100, 100 TSS ≈ 6,3. */
export function esforco010(tss: number, escala: number): number {
  return 10 * (1 - Math.exp(-Math.max(0, tss) / escala));
}

/**
 * Próximos `dias` sem treinar (TSS 0): o Fitness e a Fadiga decaem com as suas constantes
 * de tempo. O desempenho segue o modelo de Banister, P = CTL − k·ATL (k = k2/k1 ≈ 2 na
 * literatura): com fadiga alta, descansar sobe P; sem fadiga, só se perde fitness. O fator
 * de tempo é 1 − sensibilidade·ΔP/CTL₀, limitado a ±sensibilidade (ganho típico de um taper).
 */
export function projecaoDescanso(
  inicio: { data: string; ctl: number; atl: number },
  dias: number,
  o: { ctlDias: number; atlDias: number; k2k1: number; sensibilidade: number },
): { data: string; ctl: number; atl: number; tsb: number; fator: number }[] {
  const kc = 1 - Math.exp(-1 / o.ctlDias);
  const ka = 1 - Math.exp(-1 / o.atlDias);
  const p0 = inicio.ctl - o.k2k1 * inicio.atl;
  const escala = Math.max(1, inicio.ctl);
  let { ctl, atl } = inicio;
  const out = [];
  const d = new Date(`${inicio.data}T00:00:00Z`);
  for (let i = 0; i < dias; i++) {
    d.setUTCDate(d.getUTCDate() + 1);
    ctl -= ctl * kc;
    atl -= atl * ka;
    const dp = (ctl - o.k2k1 * atl - p0) / escala;
    out.push({ data: d.toISOString().slice(0, 10), ctl, atl, tsb: ctl - atl, fator: 1 - o.sensibilidade * Math.max(-1, Math.min(1, dp)) });
  }
  return out;
}
