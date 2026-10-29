import { describe, expect, it } from "vitest";
import { classificarModalidade, contemFrase } from "./classificar";

describe("classificarModalidade", () => {
  it("corrida, incluindo trail e passadeira virtual", () => {
    expect(classificarModalidade("Run", false)).toBe("corrida");
    expect(classificarModalidade("TrailRun", false)).toBe("corrida");
    expect(classificarModalidade("VirtualRun", true)).toBe("corrida");
  });

  it("Zwift: VirtualRide ou bicicleta no rolo", () => {
    expect(classificarModalidade("VirtualRide", false)).toBe("zwift");
    expect(classificarModalidade("Ride", true)).toBe("zwift");
  });

  it("BTT: bicicleta na rua", () => {
    expect(classificarModalidade("MountainBikeRide", false)).toBe("btt");
    expect(classificarModalidade("Ride", false)).toBe("btt");
    expect(classificarModalidade("GravelRide", false)).toBe("btt");
  });

  it("ténis, força e o resto", () => {
    expect(classificarModalidade("TableTennis", false)).toBe("tenis");
    expect(classificarModalidade("WeightTraining", false)).toBe("forca");
    expect(classificarModalidade("Workout", false)).toBe("forca");
    expect(classificarModalidade("EMountainBikeRide", false)).toBe("outros");
    expect(classificarModalidade("Walk", false)).toBe("outros");
    expect(classificarModalidade(null, false)).toBe("outros");
  });
});

describe("contemFrase", () => {
  it("encontra a frase no título ou na descrição, sem ligar a acentos nem maiúsculas", () => {
    expect(contemFrase(["Volta COM CRIANCAS ao parque", null], "com crianças")).toBe(true);
    expect(contemFrase(["BTT manhã", "Fomos  com\ncrianças até ao rio"], "com crianças")).toBe(true);
  });

  it("não encontra quando não está lá", () => {
    expect(contemFrase(["BTT com amigos", "crianças em casa"], "com crianças")).toBe(false);
    expect(contemFrase(["qualquer coisa"], "")).toBe(false);
  });
});
