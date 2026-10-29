import { describe, expect, it } from "vitest";
import { atividadeStrava, streamsStrava } from "./tipos";
import { desempacotarStreams, empacotarStreams, mapearAtividade, mapearMelhoresEsforcos } from "./mapear";

const detalhe = atividadeStrava.parse({
  id: 18330245057,
  name: "Rota da Primavera",
  description: "Com crianças? Não, prova!",
  sport_type: "MountainBikeRide",
  trainer: false,
  start_date: "2026-05-01T07:32:10Z",
  moving_time: 8263,
  elapsed_time: 9010,
  distance: 36012.4,
  total_elevation_gain: 793,
  average_heartrate: 162.3,
  max_heartrate: 184,
  average_watts: 180,
  device_watts: false,
  average_cadence: 71.2,
  suffer_score: 310.6,
  best_efforts: [{ name: "5k", distance: 5000, elapsed_time: 1800.4, start_index: 10, end_index: 900 }],
  segment_efforts: [],
});

describe("mapearAtividade", () => {
  const linha = mapearAtividade(detalhe, "com crianças");

  it("copia os campos e classifica a modalidade", () => {
    expect(linha).toMatchObject({
      stravaId: 18330245057,
      origem: "strava",
      modalidade: "btt",
      trainer: false,
      dataLocal: "2026-05-01",
      duracaoMovimentoS: 8263,
      duracaoTotalS: 9010,
      desnivelM: 793,
      fcMedia: 162.3,
      relativeEffort: 311,
      temperaturaMedia: null,
    });
    expect(linha.inicio.toISOString()).toBe("2026-05-01T07:32:10.000Z");
  });

  it("ignora potência estimada pelo Strava (sem medidor)", () => {
    expect(linha.potenciaMedia).toBeNull();
    const zwift = mapearAtividade({ ...detalhe, sport_type: "VirtualRide", device_watts: true }, "com crianças");
    expect(zwift.potenciaMedia).toBe(180);
    expect(zwift.modalidade).toBe("zwift");
  });

  it("deteta 'com crianças' na descrição", () => {
    expect(linha.comCriancas).toBe(true);
    expect(mapearAtividade({ ...detalhe, description: null }, "com crianças").comCriancas).toBe(false);
  });
});

describe("mapearMelhoresEsforcos", () => {
  it("converte best efforts", () => {
    expect(mapearMelhoresEsforcos(detalhe, 7)).toEqual([
      { atividadeId: 7, nome: "5k", distanciaM: 5000, tempoS: 1800, indiceInicio: 10, indiceFim: 900 },
    ]);
    expect(mapearMelhoresEsforcos({ ...detalhe, best_efforts: undefined }, 7)).toEqual([]);
  });
});

describe("streams", () => {
  it("empacota e desempacota sem perder nada", () => {
    const s = streamsStrava.parse({
      time: { data: [0, 1, 2], series_type: "distance", original_size: 3, resolution: "high" },
      heartrate: { data: [120, 121, 125] },
      latlng: { data: [[41.1, -8.6], [41.1, -8.6], [41.2, -8.6]] },
    });
    const p = empacotarStreams(s);
    expect(p.tipos).toEqual(["heartrate", "latlng", "time"]);
    expect(p.nAmostras).toBe(3);
    expect(desempacotarStreams(p.dados)).toEqual({
      time: [0, 1, 2],
      heartrate: [120, 121, 125],
      latlng: [[41.1, -8.6], [41.1, -8.6], [41.2, -8.6]],
    });
  });
});
