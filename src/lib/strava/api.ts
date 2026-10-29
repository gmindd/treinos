// Cliente HTTP da API do Strava: OAuth, renovação de tokens e limites de pedidos.
import { eq } from "drizzle-orm";
import type { z } from "zod";
import type { Db } from "@/db/client";
import { stravaConta } from "@/db/schema";
import { env } from "@/lib/env";
import { apagarEstado, gravarEstado, lerEstado } from "@/lib/sistema";
import { lerLimites, pausaAte, type EstadoLimites } from "./limites";
import { subscricaoWebhook, tokensStrava, type TokensStrava } from "./tipos";

export const ESTADO_LIMITES = "strava.limites";
/** Mensagem de erro da ligação (ex.: acesso revogado). Limpa quando volta a funcionar. */
export const ESTADO_ERRO = "strava.erro";

export const SCOPE = "read,activity:read_all";
/** Cookie com o `state` do OAuth (proteção CSRF entre /ligar e /callback). */
export const COOKIE_ESTADO_OAUTH = "strava_estado";

export class ErroStrava extends Error {
  constructor(
    public readonly estado: number,
    mensagem: string,
  ) {
    super(mensagem);
  }
}

/** Atingido o limite de pedidos: tentar de novo depois de `ate`. */
export class LimiteStrava extends Error {
  constructor(public readonly ate: Date) {
    super(`Limite de pedidos do Strava; retomar às ${ate.toISOString()}`);
  }
}

export function configStrava() {
  const e = env();
  if (!e.STRAVA_CLIENT_ID || !e.STRAVA_CLIENT_SECRET) return null;
  return {
    clientId: e.STRAVA_CLIENT_ID,
    clientSecret: e.STRAVA_CLIENT_SECRET,
    verifyToken: e.STRAVA_WEBHOOK_VERIFY_TOKEN || null,
    base: e.STRAVA_BASE_URL.replace(/\/$/, ""),
    appUrl: e.APP_URL.replace(/\/$/, ""),
  };
}

function exigirConfig() {
  const c = configStrava();
  if (!c) throw new Error("Faltam STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET");
  return c;
}

export function urlCallback() {
  return `${exigirConfig().appUrl}/api/strava/callback`;
}

export function urlAutorizacao(estado: string) {
  const c = exigirConfig();
  const p = new URLSearchParams({
    client_id: c.clientId,
    redirect_uri: urlCallback(),
    response_type: "code",
    approval_prompt: "auto",
    scope: SCOPE,
    state: estado,
  });
  return `${c.base}/oauth/authorize?${p}`;
}

async function pedirToken(campos: Record<string, string>): Promise<TokensStrava> {
  const c = exigirConfig();
  const r = await fetch(`${c.base}/oauth/token`, {
    method: "POST",
    body: new URLSearchParams({ client_id: c.clientId, client_secret: c.clientSecret, ...campos }),
  });
  if (!r.ok) throw new ErroStrava(r.status, `Strava /oauth/token respondeu ${r.status}`);
  return tokensStrava.parse(await r.json());
}

/** Troca o código do OAuth por tokens e guarda a conta (substitui qualquer conta anterior). */
export async function ligarConta(db: Db, codigo: string, scope: string) {
  const t = await pedirToken({ code: codigo, grant_type: "authorization_code" });
  if (!t.athlete) throw new Error("Resposta do Strava sem atleta");
  await db.transaction(async (tx) => {
    await tx.delete(stravaConta);
    await tx.insert(stravaConta).values({
      athleteId: t.athlete!.id,
      accessToken: t.access_token,
      refreshToken: t.refresh_token,
      expiraEm: new Date(t.expires_at * 1000),
      scope,
    });
  });
  await apagarEstado(db, ESTADO_ERRO);
  return t.athlete.id;
}

/** Access token válido, renovado se expirar nos próximos 5 min. */
async function accessToken(db: Db): Promise<string> {
  const [conta] = await db.select().from(stravaConta).limit(1);
  if (!conta) throw new ErroStrava(401, "Strava não ligado");
  if (conta.expiraEm.getTime() - Date.now() > 5 * 60 * 1000) return conta.accessToken;

  let t: TokensStrava;
  try {
    t = await pedirToken({ refresh_token: conta.refreshToken, grant_type: "refresh_token" });
  } catch (e) {
    if (e instanceof ErroStrava && (e.estado === 400 || e.estado === 401)) {
      await gravarEstado(db, ESTADO_ERRO, "O Strava recusou renovar o acesso. Volta a ligar o Strava.");
    }
    throw e;
  }
  await db
    .update(stravaConta)
    .set({
      accessToken: t.access_token,
      refreshToken: t.refresh_token,
      expiraEm: new Date(t.expires_at * 1000),
      atualizadoEm: new Date(),
    })
    .where(eq(stravaConta.athleteId, conta.athleteId));
  return t.access_token;
}

async function verificarLimites(db: Db) {
  const ate = pausaAte(await lerEstado<EstadoLimites>(db, ESTADO_LIMITES), new Date());
  if (ate) throw new LimiteStrava(ate);
}

async function registarLimites(db: Db, r: Response) {
  const estado = lerLimites(r.headers, new Date());
  if (estado) await gravarEstado(db, ESTADO_LIMITES, estado);
  return estado;
}

/**
 * GET autenticado à API v3. Devolve null em 404 (atividade apagada, privada sem
 * permissão, ou sem streams). Lança LimiteStrava quando é preciso esperar.
 */
export async function pedirApi<T>(
  db: Db,
  caminho: string,
  esquema: z.ZodType<T>,
  params: Record<string, string> = {},
): Promise<T | null> {
  await verificarLimites(db);
  const c = exigirConfig();
  const token = await accessToken(db);
  const url = `${c.base}/api/v3${caminho}${Object.keys(params).length ? `?${new URLSearchParams(params)}` : ""}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const limites = await registarLimites(db, r);

  if (r.status === 429) {
    throw new LimiteStrava(pausaAte(limites, new Date(), 0) ?? new Date(Date.now() + 15 * 60 * 1000));
  }
  if (r.status === 404) return null;
  if (r.status === 401) {
    await gravarEstado(db, ESTADO_ERRO, "O Strava recusou o acesso. Volta a ligar o Strava.");
  }
  if (!r.ok) throw new ErroStrava(r.status, `Strava ${caminho} respondeu ${r.status}`);
  return esquema.parse(await r.json());
}

// --- Subscrição do webhook (autenticada com client_id/secret, não com o token do atleta) ---

function urlSubscricoes(extra = "") {
  const c = exigirConfig();
  const p = new URLSearchParams({ client_id: c.clientId, client_secret: c.clientSecret });
  return `${c.base}/api/v3/push_subscriptions${extra}?${p}`;
}

export async function listarSubscricoes() {
  const r = await fetch(urlSubscricoes());
  if (!r.ok) throw new ErroStrava(r.status, `Strava push_subscriptions respondeu ${r.status}`);
  return subscricaoWebhook.array().parse(await r.json());
}

export async function apagarSubscricao(id: number) {
  const r = await fetch(urlSubscricoes(`/${id}`), { method: "DELETE" });
  if (!r.ok && r.status !== 404) throw new ErroStrava(r.status, `Apagar subscrição respondeu ${r.status}`);
}

/** O Strava valida o callback (GET com hub.challenge) antes de responder a este pedido. */
export async function criarSubscricao(callbackUrl: string, verifyToken: string) {
  const c = exigirConfig();
  const r = await fetch(`${c.base}/api/v3/push_subscriptions`, {
    method: "POST",
    body: new URLSearchParams({
      client_id: c.clientId,
      client_secret: c.clientSecret,
      callback_url: callbackUrl,
      verify_token: verifyToken,
    }),
  });
  if (!r.ok) {
    throw new ErroStrava(r.status, `Criar subscrição respondeu ${r.status}: ${await r.text()}`);
  }
  return subscricaoWebhook.pick({ id: true }).parse(await r.json());
}
