import { describe, expect, it } from "vitest";
import { formatarData, formatarDataHora, formatarDuracao } from "./formato";

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
});
