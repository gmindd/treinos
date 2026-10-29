import { describe, expect, it } from "vitest";
import { lerLimites, pausaAte } from "./limites";

const cabecalhos = (uso15: number, usoDia: number) =>
  new Headers({
    "X-RateLimit-Limit": "200,2000",
    "X-RateLimit-Usage": `${uso15},${usoDia}`,
    "X-ReadRateLimit-Limit": "100,1000",
    "X-ReadRateLimit-Usage": `${uso15},${usoDia}`,
  });

describe("limites do Strava", () => {
  const agora = new Date("2026-10-29T10:07:00Z");

  it("lê os dois pares de cabeçalhos", () => {
    expect(lerLimites(cabecalhos(5, 50), agora)?.pares).toEqual([
      { limite15: 200, uso15: 5, limiteDia: 2000, usoDia: 50 },
      { limite15: 100, uso15: 5, limiteDia: 1000, usoDia: 50 },
    ]);
    expect(lerLimites(new Headers(), agora)).toBeNull();
  });

  it("sem pausa com uso baixo", () => {
    expect(pausaAte(lerLimites(cabecalhos(40, 300), agora), agora)).toBeNull();
    expect(pausaAte(null, agora)).toBeNull();
  });

  it("perto do limite de 15 min: espera pela próxima janela (:15)", () => {
    const e = lerLimites(cabecalhos(98, 300), agora);
    expect(pausaAte(e, agora)?.toISOString()).toBe("2026-10-29T10:15:05.000Z");
    // Já noutra janela: o uso medido antes deixou de contar.
    expect(pausaAte(e, new Date("2026-10-29T10:16:00Z"))).toBeNull();
  });

  it("perto do limite diário: espera pela meia-noite UTC", () => {
    const e = lerLimites(cabecalhos(10, 998), agora);
    expect(pausaAte(e, agora)?.toISOString()).toBe("2026-10-30T00:00:05.000Z");
  });
});
