import { describe, expect, it } from "vitest";
import { escolherParaImportar } from "./sincronizar";
import { atividadeStrava } from "./tipos";

const remota = (id: number, name = `A${id}`, sport_type = "Run") =>
  atividadeStrava.parse({
    id,
    name,
    sport_type,
    start_date: "2026-03-01T08:00:00Z",
    moving_time: 1800,
    elapsed_time: 1900,
  });

const local = (stravaId: number, extra: Partial<{ nome: string; estadoStreams: string; apagada: boolean }> = {}) => ({
  stravaId,
  nome: `A${stravaId}`,
  sportType: "Run",
  estadoStreams: "ok",
  apagada: false,
  ...extra,
});

describe("escolherParaImportar", () => {
  it("nada a fazer quando está tudo igual", () => {
    expect(escolherParaImportar([remota(1), remota(2)], [local(1), local(2)])).toEqual([]);
  });

  it("novas, sem streams e marcadas como apagadas que voltaram", () => {
    const ids = escolherParaImportar(
      [remota(1), remota(2), remota(3)],
      [local(1, { estadoStreams: "pendente" }), local(2, { apagada: true })],
    );
    expect(ids.sort()).toEqual([1, 2, 3]);
  });

  it("título ou tipo alterados no Strava (ex.: acrescentou 'com crianças')", () => {
    expect(escolherParaImportar([remota(1, "BTT com crianças")], [local(1)])).toEqual([1]);
    expect(escolherParaImportar([remota(1, "A1", "TrailRun")], [local(1)])).toEqual([1]);
  });

  it("atividades que desapareceram do Strava são verificadas", () => {
    expect(escolherParaImportar([remota(1)], [local(1), local(9)])).toEqual([9]);
    expect(escolherParaImportar([remota(1)], [local(1), local(9, { apagada: true })])).toEqual([]);
  });
});
