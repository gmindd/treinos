// Classificação de atividades do Strava (funções puras).

export type Modalidade = "corrida" | "zwift" | "btt" | "tenis" | "forca" | "outros";

const CORRIDA = new Set(["Run", "TrailRun", "VirtualRun"]);
const BICICLETA = new Set(["Ride", "MountainBikeRide", "GravelRide"]);
const TENIS = new Set(["TableTennis", "Tennis"]);
const FORCA = new Set(["WeightTraining", "Workout", "Crossfit", "HighIntensityIntervalTraining"]);

/**
 * Modalidade a partir do `sport_type` (brief §4): corrida · Zwift (VirtualRide ou rolo)
 * · BTT (bicicleta na rua) · ténis · força · outros. E-bikes ficam em "outros" para não
 * contaminarem os estimadores de BTT.
 */
export function classificarModalidade(sportType: string | null | undefined, trainer: boolean): Modalidade {
  const t = sportType ?? "";
  if (CORRIDA.has(t)) return "corrida";
  if (t === "VirtualRide") return "zwift";
  if (BICICLETA.has(t)) return trainer ? "zwift" : "btt";
  if (TENIS.has(t)) return "tenis";
  if (FORCA.has(t)) return "forca";
  return "outros";
}

/** Minúsculas, sem acentos e com espaços simples. */
export function normalizarTexto(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** true se a frase (ex.: "com crianças") aparecer em algum dos textos, ignorando acentos e maiúsculas. */
export function contemFrase(textos: (string | null | undefined)[], frase: string): boolean {
  const alvo = normalizarTexto(frase);
  if (!alvo) return false;
  return textos.some((t) => t && normalizarTexto(t).includes(alvo));
}
