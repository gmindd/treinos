import { z } from "zod";

const esquema = z.object({
  DATABASE_URL: z.string().url(),
  APP_PASSWORD: z.string().min(8, "APP_PASSWORD tem de ter pelo menos 8 caracteres"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET tem de ter pelo menos 32 caracteres"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  // Strava: opcionais (a app funciona sem ligação ao Strava).
  STRAVA_CLIENT_ID: z.string().optional(),
  STRAVA_CLIENT_SECRET: z.string().optional(),
  STRAVA_WEBHOOK_VERIFY_TOKEN: z.string().optional(),
  /** Só para testes locais com um Strava simulado. */
  STRAVA_BASE_URL: z.string().url().default("https://www.strava.com"),
});

export type Env = z.infer<typeof esquema>;

let cache: Env | undefined;

/** Variáveis de ambiente validadas. Falha cedo e com mensagem clara se faltar alguma. */
export function env(): Env {
  if (!cache) {
    const r = esquema.safeParse(process.env);
    if (!r.success) {
      const erros = r.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
      throw new Error(`Variáveis de ambiente inválidas:\n${erros}`);
    }
    cache = r.data;
  }
  return cache;
}
