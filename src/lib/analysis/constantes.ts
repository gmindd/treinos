// Constantes com data efetiva (funções puras).

export type LinhaConstante = {
  chave: string;
  dataEfetiva: string;
  valor: number | null;
  valorJson: unknown;
};

/**
 * Linha válida numa data: a de maior data efetiva ≤ data. Antes da primeira usa-se a
 * mais antiga (não há histórico anterior).
 */
export function linhaNaData(linhas: LinhaConstante[], chave: string, data: string): LinhaConstante | null {
  const daChave = linhas.filter((l) => l.chave === chave).sort((a, b) => a.dataEfetiva.localeCompare(b.dataEfetiva));
  if (!daChave.length) return null;
  let escolhida = daChave[0];
  for (const l of daChave) if (l.dataEfetiva <= data) escolhida = l;
  return escolhida;
}

export function numeroNaData(linhas: LinhaConstante[], chave: string, data: string): number | null {
  return linhaNaData(linhas, chave, data)?.valor ?? null;
}

export function jsonNaData<T>(linhas: LinhaConstante[], chave: string, data: string): T | null {
  return (linhaNaData(linhas, chave, data)?.valorJson as T | undefined) ?? null;
}
