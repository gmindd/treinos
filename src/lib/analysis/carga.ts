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
