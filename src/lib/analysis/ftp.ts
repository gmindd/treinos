// FTP a partir dos testes no Zwift (funções puras). O método de referência é o ramp test.

export type TipoTesteFtp = "rampa" | "20min";

/** Tipo de teste pelo nome da atividade ("Zwift - FTP Ramp Test", "FTP Test [Standard]"). */
export function tipoTesteFtp(nome: string): TipoTesteFtp | null {
  if (/ramp\s*test/i.test(nome)) return "rampa";
  if (/ftp\s*test/i.test(nome)) return "20min";
  return null;
}

/** FTP do teste: rampa = 75% da melhor potência de 1 min; 20 min = 95% da melhor de 20 min. */
export function ftpDoTeste(tipo: TipoTesteFtp, curva: Record<number, number | null>): number | null {
  const p = tipo === "rampa" ? curva[60] : curva[1200];
  if (p == null) return null;
  return Math.round(p * (tipo === "rampa" ? 0.75 : 0.95));
}

/**
 * FTP escrito pelo atleta na descrição ("novo ftp: 216W", "FTP update 190 -> 199W").
 * Com seta, conta o valor depois da seta.
 */
export function ftpDaDescricao(texto: string | null | undefined): number | null {
  if (!texto) return null;
  const seta = texto.match(/ftp[^\d\n]{0,20}(\d{3})\s*w?\s*(?:->|→|=>)\s*(\d{3})\s*w/i);
  if (seta) return Number(seta[2]);
  const simples = texto.match(/ftp[^\d\n]{0,20}(\d{3})\s*w/i);
  return simples ? Number(simples[1]) : null;
}
