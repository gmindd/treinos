// Frequência cardíaca: TRIMP, hrTSS e tempo por zona (funções puras).

export type ConstantesFc = { fcRepouso: number; fcMax: number; lthr: number };

function fracaoReserva(fc: number, c: ConstantesFc) {
  return Math.min(1, Math.max(0, (fc - c.fcRepouso) / (c.fcMax - c.fcRepouso)));
}

/** Contributo de 1 minuto a esta FC para o TRIMP de Banister (fator masculino 0,64·e^1,92x). */
function trimpMinuto(fc: number, c: ConstantesFc) {
  const x = fracaoReserva(fc, c);
  return x * 0.64 * Math.exp(1.92 * x);
}

/** TRIMP de Banister, amostra a amostra (dt em segundos). */
export function trimp(fc: (number | null)[], dt: number[], c: ConstantesFc): number {
  let total = 0;
  for (let i = 0; i < fc.length; i++) {
    const v = fc[i];
    if (v != null && v > 0) total += (dt[i] / 60) * trimpMinuto(v, c);
  }
  return total;
}

/** TRIMP de 1 h ao LTHR: a referência que vale 100 hrTSS. */
export function trimpHoraLimiar(c: ConstantesFc): number {
  return 60 * trimpMinuto(c.lthr, c);
}

/** hrTSS: TRIMP normalizado para que 1 h ao LTHR = 100. */
export function hrTss(valorTrimp: number, c: ConstantesFc): number {
  return (valorTrimp / trimpHoraLimiar(c)) * 100;
}

/** TRIMP aproximado a partir só da FC média (atividades sem streams). */
export function trimpFcMedia(fcMedia: number, duracaoS: number, c: ConstantesFc): number {
  return (duracaoS / 60) * trimpMinuto(fcMedia, c);
}

/** Segundos em cada zona. `limites` = limite superior de Z1..Z4; Z5 é o resto. */
export function tempoZonas(fc: (number | null)[], dt: number[], limites: number[]): number[] {
  const zonas = new Array(limites.length + 1).fill(0);
  for (let i = 0; i < fc.length; i++) {
    const v = fc[i];
    if (v == null || v <= 0) continue;
    let z = limites.findIndex((l) => v <= l);
    if (z === -1) z = limites.length;
    zonas[z] += dt[i];
  }
  return zonas;
}
