import { describe, expect, it } from "vitest";
import { DURACAO_SESSAO_S, criarToken, passwordCorreta, tokenValido } from "./sessao";

const segredo = "x".repeat(32);

describe("sessão", () => {
  it("aceita um token acabado de criar", () => {
    expect(tokenValido(criarToken(segredo), segredo)).toBe(true);
  });

  it("rejeita token expirado", () => {
    const agora = Date.now();
    const token = criarToken(segredo, agora);
    expect(tokenValido(token, segredo, agora + (DURACAO_SESSAO_S + 1) * 1000)).toBe(false);
  });

  it("rejeita token assinado com outro segredo", () => {
    expect(tokenValido(criarToken("y".repeat(32)), segredo)).toBe(false);
  });

  it("rejeita tudo se o segredo estiver vazio ou curto", () => {
    expect(tokenValido(criarToken(""), "")).toBe(false);
  });

  it("rejeita token adulterado ou vazio", () => {
    const [, assinatura] = criarToken(segredo).split(".");
    expect(tokenValido(`9999999999.${assinatura}`, segredo)).toBe(false);
    expect(tokenValido(undefined, segredo)).toBe(false);
    expect(tokenValido("lixo", segredo)).toBe(false);
  });

  it("compara passwords", () => {
    expect(passwordCorreta("abc12345", "abc12345")).toBe(true);
    expect(passwordCorreta("abc1234", "abc12345")).toBe(false);
  });
});
