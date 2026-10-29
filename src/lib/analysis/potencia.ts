// Potência (Zwift): NP, IF, TSS e curva de potência média máxima (funções puras).
import { media, mediaMovel, melhorMedia } from "./series";

/** Normalized Power: média da 4.ª potência da média móvel de 30 s. Séries a 1 Hz. */
export function potenciaNormalizada(watts1Hz: number[]): number | null {
  if (watts1Hz.length === 0) return null;
  if (watts1Hz.length < 30) return media(watts1Hz);
  const m30 = mediaMovel(watts1Hz, 30).slice(29);
  return Math.pow(m30.reduce((s, w) => s + w ** 4, 0) / m30.length, 0.25);
}

/** TSS = duração(h) × IF² × 100, com IF = NP / FTP. */
export function tssPotencia(np: number, duracaoS: number, ftp: number) {
  const intensidade = np / ftp;
  return { tss: (duracaoS / 3600) * intensidade ** 2 * 100, intensidade };
}

export const DURACOES_CURVA = [5, 15, 30, 60, 120, 180, 300, 480, 600, 720, 1200, 1800, 3600];

/** Potência média máxima para cada duração (s). */
export function curvaPotencia(watts1Hz: number[], duracoes = DURACOES_CURVA): Record<number, number | null> {
  return Object.fromEntries(duracoes.map((d) => [d, melhorMedia(watts1Hz, d)]));
}

/** Segundos com potência (média de 30 s) ≥ limiar. */
export function tempoAcima(watts1Hz: number[], limiar: number): number {
  return mediaMovel(watts1Hz, 30).filter((w) => w >= limiar).length;
}

/** Bloco contínuo mais longo (s) com potência (média de 30 s) ≥ limiar. */
export function blocoMaisLongo(watts1Hz: number[], limiar: number): number {
  let melhor = 0;
  let atual = 0;
  for (const w of mediaMovel(watts1Hz, 30)) {
    atual = w >= limiar ? atual + 1 : 0;
    if (atual > melhor) melhor = atual;
  }
  return melhor;
}
