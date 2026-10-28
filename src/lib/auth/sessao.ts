import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const COOKIE_SESSAO = "sessao";
export const DURACAO_SESSAO_S = 30 * 24 * 3600;

function assinar(payload: string, segredo: string) {
  return createHmac("sha256", segredo).update(payload).digest("base64url");
}

function iguais(a: string, b: string) {
  // Compara resumos de tamanho fixo para não revelar o tamanho por timing.
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/** Token `<expira_em_s>.<hmac>` — utilizador único, por isso só precisa da validade. */
export function criarToken(segredo: string, agoraMs = Date.now()): string {
  const expira = Math.floor(agoraMs / 1000) + DURACAO_SESSAO_S;
  const payload = String(expira);
  return `${payload}.${assinar(payload, segredo)}`;
}

export function tokenValido(token: string | undefined, segredo: string, agoraMs = Date.now()): boolean {
  if (!token || segredo.length < 32) return false;
  const [payload, assinatura] = token.split(".");
  if (!payload || !assinatura || !/^\d+$/.test(payload)) return false;
  if (!iguais(assinatura, assinar(payload, segredo))) return false;
  return Number(payload) * 1000 > agoraMs;
}

export function passwordCorreta(tentativa: string, password: string): boolean {
  return iguais(tentativa, password);
}
