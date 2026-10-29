import { describe, expect, it } from "vitest";
import {
  dataIsoLisboa,
  formatarData,
  formatarDataHora,
  formatarDistancia,
  formatarDuracao,
} from "./formato";

describe("formato", () => {
  it("datas dd/mm/aaaa", () => {
    expect(formatarData("2026-12-26")).toBe("26/12/2026");
  });

  it("durações", () => {
    expect(formatarDuracao(8263)).toBe("2:17:43");
    expect(formatarDuracao(3540)).toBe("59:00");
    expect(formatarDuracao(7200)).toBe("2:00:00");
  });

  it("hora de Lisboa (inverno = UTC)", () => {
    expect(formatarDataHora(new Date("2026-12-26T10:05:00Z"))).toBe("26/12/2026, 10:05");
  });

  it("dia em Lisboa: no verão 23:30 UTC já é o dia seguinte", () => {
    expect(dataIsoLisboa(new Date("2026-07-10T23:30:00Z"))).toBe("2026-07-11");
    expect(dataIsoLisboa(new Date("2026-12-10T23:30:00Z"))).toBe("2026-12-10");
  });

  it("distâncias em km com vírgula", () => {
    expect(formatarDistancia(10234)).toBe("10,23 km");
    expect(formatarDistancia(36000)).toBe("36,00 km");
  });
});
