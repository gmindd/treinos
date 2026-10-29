import { readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { casarTroco, classeDeclive, grelhaDistancia, indiceEspacial, segmentar, type StreamsBtt } from "./btt";
import { amostrasCorrida, janelasEstaveis } from "./corrida";
import { ganhoProjetado, mmqPonderados, percentil, reamostragens, regressaoHuber, resumoTempos } from "./estatistica";
import { perfisPacing, preparar, preverBtt, prepararVolta, velocidadeFisica, type ParametrosBtt } from "./previsao-btt";
import {
  esforcosSessao,
  melhorEsforcoGap,
  preverCorrida,
  tempoModeloA,
  type ParametrosCorrida,
  type SessaoCorrida,
} from "./previsao-corrida";

const pc: ParametrosCorrida = {
  semanasHistorico: 6,
  meiaVidaDias: 14,
  minJanelas: 15,
  diasEsforcos: 90,
  meiaVidaEsforcosDias: 30,
  riegel: 1.06,
  fcProvaDefault: 172,
  fcProvaDesconto: 3,
  extrapolacaoBpm: 10,
  fatorIcExtrapolacao: 1.5,
  divergencia: 0.04,
  durabilidadeLongaMin: 50,
  durabilidadeVolumeKm: 20,
  penalizacaoDurabilidade: 0.02,
  fcEficiencia: 150,
  semanasTendencia: 12,
  tauSemanas: 6,
  ganhoMax: 0.08,
  bootstrapN: 50,
  sensibilidadeFc: [168, 172, 176],
};

const pb: ParametrosBtt = {
  passoM: 25,
  atrasoFcS: 25,
  vParagemMs: 3 / 3.6,
  vAPeMs: 6 / 3.6,
  maxLacunaS: 10,
  medianaAltitudeM: 100,
  janelaDecliveM: 100,
  classes: [-10, -6, -3, -1, 1, 3, 5, 7, 9, 12],
  segmentoMinM: 150,
  fcEsforcoMin: 160,
  fcEsforcoLimiar: 155,
  fracAcimaLimiar: 0.7,
  fracVoltaEsforco: 0.2,
  excluirZ1: true,
  fcZ1Max: 124,
  sportTypesExcluidos: ["GravelRide"],
  bufferM: 25,
  sobreposicao: 0.7,
  pesoMesmoTroco: 3,
  meiaVidaDias: 28,
  eta: 0.97,
  rho: 1.2,
  cda: 0.5,
  zwiftSemanas: 6,
  fcArranque: 168,
  kmArranque: 10,
  divergencia: 0.05,
  fcProvaDefault: 165,
  semanasTendencia: 12,
  tauSemanas: 6,
  ganhoMax: 0.08,
  bootstrapN: 20,
  marcoSubidaMin: 12,
  declSubidaMin: 0.05,
  gruposSinuosidade: 3,
};

describe("estatística", () => {
  it("mínimos quadrados e Huber: a robusta ignora um outlier grosseiro", () => {
    const x = Array.from({ length: 20 }, (_, i) => i);
    const y = x.map((v) => 2 + 0.5 * v);
    expect(mmqPonderados(x.map((v) => [1, v]), y, x.map(() => 1))![1]).toBeCloseTo(0.5, 9);
    y[19] = 100;
    const ols = mmqPonderados(x.map((v) => [1, v]), y, x.map(() => 1))!;
    const h = regressaoHuber(x.map((v) => [1, v]), y, x.map(() => 1))!;
    expect(Math.abs(h.beta[1] - 0.5)).toBeLessThan(Math.abs(ols[1] - 0.5) / 5);
  });

  it("percentil, bootstrap determinístico e projeção limitada", () => {
    expect(percentil([1, 2, 3, 4, 5], 0.5)).toBe(3);
    expect(reamostragens(5, 3, 1)).toEqual(reamostragens(5, 3, 1));
    expect(reamostragens(5, 3, 1)[0].reduce((a, b) => a + b, 0)).toBe(5);
    // 1%/semana durante 8 semanas com tau 6 dá menos de 8% e nunca passa o limite.
    const g = ganhoProjetado(0.01, 8, 6, 0.08);
    expect(g).toBeGreaterThan(0.04);
    expect(g).toBeLessThan(0.08);
    expect(ganhoProjetado(0.2, 30, 6, 0.08)).toBe(0.08);
    expect(resumoTempos([90, 100, 110], 100)!.probAlvo).toBeCloseTo(2 / 3);
  });
});

/** Corrida sintética plana: velocidade em degraus, FC a acompanhar (v = 0,02·FC − 0,6). */
function corridaSintetica(id: number, data: string, degraus: number[]): SessaoCorrida {
  const time: number[] = [];
  const dist: number[] = [];
  const fc: number[] = [];
  let d = 0;
  let t = 0;
  for (const v of degraus) {
    for (let k = 0; k < 600; k++) {
      time.push(t++);
      dist.push(d);
      fc.push((v + 0.6) / 0.02);
      d += v;
    }
  }
  const amostras = amostrasCorrida(time, dist, null, fc, { vParagem: 1.5, janelaDecliveM: 30 })!;
  return {
    id,
    data,
    nome: `c${id}`,
    esforcoMaximo: false,
    distanciaM: d,
    duracaoMovimentoS: t,
    amostras,
    janelas: janelasEstaveis(amostras, { aquecimentoS: 480, janelaS: 150, cvMax: 0.05, atrasoFcS: 0, suavizarS: 30 }),
    esforcos: esforcosSessao(amostras),
  };
}

describe("motor de corrida (7.1)", () => {
  it("melhor esforço GAP: 5 km a 2,5 m/s = 2000 s", () => {
    const gap = new Array(3000).fill(2.5);
    const e = melhorEsforcoGap(gap, gap.map(() => 160), 5000)!;
    expect(e.tempoS).toBe(2000);
    expect(e.fcMedia).toBe(160);
  });

  it("modelo A recupera a relação FC → velocidade e prevê à FC de prova", () => {
    const sessoes = [1, 2, 3, 4].map((i) => corridaSintetica(i, `2026-10-0${i}`, [2.4, 2.6, 2.8, 2.5, 2.7]));
    const r = preverCorrida(sessoes, "2026-10-10", 10000, 3600, "2026-12-26", pc);
    expect(r.a).not.toBeNull();
    expect(r.a!.modelo.b).toBeCloseTo(0.02, 3);
    // A 172 bpm: v = 0,02·172 − 0,6 = 2,84 m/s → 10 km em ~3521 s.
    expect(tempoModeloA(r.a!.modelo, 10000, 172)!).toBeCloseTo(10000 / 2.84, -1);
    expect(r.hoje!.p10).toBeLessThanOrEqual(r.hoje!.p90);
    expect(r.sensibilidade.map((s) => s.tempoS!)).toEqual([...r.sensibilidade.map((s) => s.tempoS!)].sort((a, b) => b - a));
  });

  it("sem dados recusa o número e diz o que falta", () => {
    const r = preverCorrida([], "2026-10-10", 10000, 3600, "2026-12-26", pc);
    expect(r.suficiente).toBe(false);
    expect(r.falta.length).toBe(2);
  });
});

function rota(): StreamsBtt {
  const f = path.join(__dirname, "fixtures", "rota-2026.json.gz");
  return JSON.parse(gunzipSync(readFileSync(f)).toString());
}

describe("motor BTT (7.2)", () => {
  it("classes de declive como no brief", () => {
    expect(classeDeclive(-0.12, pb.classes)).toBe(0);
    expect(classeDeclive(0, pb.classes)).toBe(4);
    expect(classeDeclive(0.13, pb.classes)).toBe(10);
  });

  it("física: mais potência = mais rápido; mais declive = mais lento", () => {
    const v = (P: number, d: number) => velocidadeFisica(P, d, 0.02, 97.5, pb);
    expect(v(250, 0)).toBeGreaterThan(v(200, 0));
    expect(v(200, 0.08)).toBeLessThan(v(200, 0));
    // 200 W no plano com Crr 0,02 e CdA 0,5: ~6,3 m/s.
    expect(v(200, 0)).toBeCloseTo(6.3, 0);
  });

  it("Rota 2026 (fixture real): grelha, segmentos e tempo em movimento", () => {
    const g = grelhaDistancia(rota(), pb)!;
    expect(g.d.at(-1)!).toBeGreaterThan(35_900);
    const segs = segmentar(g, pb.classes, pb.segmentoMinM, pb.fcEsforcoLimiar);
    expect(segs.every((s) => s.comp >= pb.segmentoMinM || segs.length === 1)).toBe(true);
    const tempo = segs.reduce((t, s) => t + s.tempoMovS, 0);
    // Os streams marcam 7704 s em movimento; o resumo do Strava (aparelho) diz 8263 s.
    expect(Math.abs(tempo - 7704) / 7704).toBeLessThan(0.01);
    const subida = segs.reduce((t, s) => t + Math.max(0, s.declive * s.comp), 0);
    expect(subida).toBeGreaterThan(600);
  });

  it("o mesmo troço casa consigo próprio e não casa no sentido contrário", () => {
    const g = grelhaDistancia(rota(), pb)!;
    const idx = indiceEspacial(g, 25, g.lat[0]!);
    expect(casarTroco(g, 100, 140, idx, 25, 0.7)).toEqual({ j0: 100, j1: 140 });
    const s = rota();
    const inv: StreamsBtt = { ...s, latlng: [...(s.latlng ?? [])].reverse() };
    const gi = grelhaDistancia(inv, pb)!;
    const c = casarTroco(g, 100, 140, indiceEspacial(gi, 25, g.lat[0]!), 25, 0.7);
    expect(c).toBeNull();
  });

  it("prever a Rota com a própria Rota como dado (nível 1) reproduz o tempo real", () => {
    const v = prepararVolta(
      { id: 1, data: "2026-05-01", nome: "Rota", sportType: "MountainBikeRide", comCriancas: false, duracaoMovimentoS: 8263 },
      rota(),
      pb,
    )!;
    const prep = preparar(v, [v], pb);
    const r = preverBtt(
      prep,
      [],
      {
        ate: "2026-05-02",
        dataProva: "2027-05-01",
        alvoS: 7200,
        perfis: perfisPacing(v, pb, "Como em 2026"),
        refIds: [v.id],
        referencia: { tempoS: 8263, porSeg: v.segmentos.map((s) => s.tempoMovS) },
        massa: () => 97.5,
        bootstrap: false,
      },
      pb,
    );
    expect(r.niveis[0]).toBeGreaterThan(0);
    // Resultado em segundos do Strava (fator da edição de referência): 2:17:43.
    expect(r.fatorMovimento).toBeCloseTo(8263 / 7704, 1);
    expect(Math.abs(r.cenarios[0].hojeS! - 8263) / 8263).toBeLessThan(0.02);
    // Sem Zwift não há estimador B, e isso fica dito.
    expect(r.falta.some((f) => f.includes("Estimador B"))).toBe(true);
  });
});
