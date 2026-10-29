import { describe, expect, it } from "vitest";
import { diasEntre, esforco010, serieCarga } from "./carga";
import { linhaNaData, numeroNaData } from "./constantes";
import { amostrasCorrida, custoMinetti, janelasEstaveis, rTss, velocidadeLimiar, velocidadeNormalizada } from "./corrida";
import { hrTss, tempoZonas, trimp, trimpHoraLimiar } from "./fc";
import { ftpDaDescricao, ftpDoTeste, tipoTesteFtp } from "./ftp";
import { blocoMaisLongo, curvaPotencia, potenciaNormalizada, tempoAcima, tssPotencia } from "./potencia";
import { duracoes, melhorMedia, reamostrar1Hz } from "./series";
import { cpWLinha, desacoplamento, janelasPotencia, relacaoFcPotencia, tendencia } from "./zwift";
import { FTP_ZWIFT, wattsFimRampa } from "./fixtures/rampa-2026-10-22";

const constantes = { fcRepouso: 51, fcMax: 190, lthr: 170 };

describe("séries", () => {
  it("duração de cada amostra, com pausas a zero", () => {
    expect(duracoes([0, 1, 2, 30, 31])).toEqual([1, 1, 0, 1, 1]);
  });

  it("reamostra a 1 Hz mantendo o valor e zerando pausas", () => {
    expect(reamostrar1Hz([0, 2, 4, 20], [100, 200, 300, 400], 10, 0)).toEqual([
      100, 100, 200, 200, 300, ...new Array(15).fill(0), 400,
    ]);
  });

  it("melhor média", () => {
    expect(melhorMedia([1, 5, 5, 1], 2)).toBe(5);
    expect(melhorMedia([1], 2)).toBeNull();
  });
});

describe("potência", () => {
  it("NP de potência constante é a própria potência; TSS de 1 h ao FTP = 100", () => {
    const w = new Array(3600).fill(200);
    expect(potenciaNormalizada(w)).toBeCloseTo(200, 6);
    expect(tssPotencia(200, 3600, 200).tss).toBeCloseTo(100, 6);
  });

  it("NP penaliza a variabilidade", () => {
    const w = Array.from({ length: 3600 }, (_, i) => (Math.floor(i / 60) % 2 ? 300 : 100));
    expect(potenciaNormalizada(w)!).toBeGreaterThan(220);
  });

  it("ramp test real de 22/10/2026: 75% da melhor potência de 1 min ≈ FTP do Zwift", () => {
    const ftp = ftpDoTeste("rampa", curvaPotencia(wattsFimRampa));
    expect(ftp).not.toBeNull();
    expect(Math.abs(ftp! - FTP_ZWIFT)).toBeLessThanOrEqual(2);
  });

  it("tempo acima e bloco mais longo", () => {
    const w = [...new Array(300).fill(100), ...new Array(600).fill(250), ...new Array(300).fill(100)];
    expect(tempoAcima(w, 200)).toBeGreaterThan(550);
    expect(blocoMaisLongo(w, 200)).toBeGreaterThan(550);
  });
});

describe("FTP", () => {
  it("tipo de teste pelo nome", () => {
    expect(tipoTesteFtp("Zwift - FTP Ramp Test [Lite]")).toBe("rampa");
    expect(tipoTesteFtp("MyWhoosh - Ramp Test - MyWhoosh")).toBe("rampa");
    expect(tipoTesteFtp("Zwift - FTP Test [Standard] on Queen's Highway")).toBe("20min");
    expect(tipoTesteFtp("Zwift - FTP Boosters on Champs-Élysées")).toBeNull();
  });

  it("valores escritos nas descrições reais", () => {
    expect(ftpDaDescricao("novo ftp: 216W / 2.7W/kg\r\nAlvos minimos: \r\nJaneiro: 210W")).toBe(216);
    expect(ftpDaDescricao("FTP update: 211w / 2.75W/kg")).toBe(211);
    expect(ftpDaDescricao("FTP Update: 199W -> 204W\r\n")).toBe(204);
    expect(ftpDaDescricao("FTP update 190 ->199W")).toBe(199);
    expect(ftpDaDescricao("🗺️ Hilly Route in Watopia")).toBeNull();
    expect(ftpDaDescricao(null)).toBeNull();
  });
});

describe("FC", () => {
  it("1 h ao LTHR vale 100 hrTSS", () => {
    const fc = new Array(3600).fill(170);
    const t = trimp(fc, new Array(3600).fill(1), constantes);
    expect(t).toBeCloseTo(trimpHoraLimiar(constantes), 6);
    expect(hrTss(t, constantes)).toBeCloseTo(100, 6);
  });

  it("FC mais baixa dá muito menos carga", () => {
    const fc = new Array(3600).fill(140);
    expect(hrTss(trimp(fc, new Array(3600).fill(1), constantes), constantes)).toBeLessThan(55);
  });

  it("tempo por zona", () => {
    expect(tempoZonas([120, 130, 160, 175, 190, null], [1, 1, 1, 1, 1, 1], [124, 154, 169, 184])).toEqual([
      1, 1, 1, 1, 1,
    ]);
  });
});

describe("corrida", () => {
  it("Minetti: subir custa mais, descer suave custa menos", () => {
    expect(custoMinetti(0)).toBeCloseTo(3.6, 6);
    expect(custoMinetti(0.1)).toBeGreaterThan(3.6);
    expect(custoMinetti(-0.1)).toBeLessThan(3.6);
  });

  // Corrida sintética plana a 2,5 m/s (6:40/km) com FC a subir com a velocidade.
  const n = 3000;
  const time = Array.from({ length: n }, (_, i) => i);
  const vel = time.map((t) => (Math.floor(t / 600) % 2 ? 2.8 : 2.4));
  const dist = vel.reduce<number[]>((acc, v, i) => [...acc, i === 0 ? 0 : acc[i - 1] + vel[i - 1]], []);
  const fc = vel.map((v) => (v > 2.5 ? 160 : 145));
  const amostras = amostrasCorrida(time, dist, null, fc, { vParagem: 1.5, janelaDecliveM: 30 })!;

  it("rTSS: velocidade normalizada e IF relativo ao limiar", () => {
    const vn = velocidadeNormalizada(amostras.gap1Hz)!;
    expect(vn).toBeGreaterThan(2.55);
    expect(vn).toBeLessThan(2.8);
    expect(rTss(3, 3600, 3).tss).toBeCloseTo(100, 6);
  });

  it("limiar: maior entre a regressão FC→velocidade e os esforços (Riegel para 60 min)", () => {
    const janelas = janelasEstaveis(amostras, { aquecimentoS: 480, janelaS: 150, cvMax: 0.05, atrasoFcS: 20 });
    expect(janelas.length).toBeGreaterThan(5);
    const l = velocidadeLimiar(janelas, [{ distanciaM: 5000, tempoS: 1800 }], 170, { minJanelas: 3, riegel: 1.06 });
    // 2,4 m/s a 145 e 2,8 m/s a 160 → ~3,07 m/s a 170.
    expect(l.porFc).toBeCloseTo(3.07, 1);
    // 5 km em 30:00 → 2,78 m/s em 30 min → ~2,67 m/s para 60 min.
    expect(l.porEsforcos).toBeCloseTo(2.67, 2);
    expect(l.v).toBe(l.porFc);
  });
});

describe("carga", () => {
  it("dias entre datas", () => {
    expect(diasEntre("2026-02-27", "2026-03-02")).toEqual(["2026-02-27", "2026-02-28", "2026-03-01", "2026-03-02"]);
  });

  it("CTL/ATL convergem para o TSS diário constante", () => {
    const dias = diasEntre("2026-01-01", "2026-12-31").map((data) => ({ data, tss: 50 }));
    const s = serieCarga(dias, { ctlDias: 42, atlDias: 7 });
    expect(s.at(-1)!.ctl).toBeCloseTo(50, 1);
    expect(s.at(-1)!.atl).toBeCloseTo(50, 3);
    expect(s[6].atl).toBeGreaterThan(s[6].ctl);
  });

  it("semente fixa os valores num dia", () => {
    const dias = diasEntre("2026-01-01", "2026-01-03").map((data) => ({ data, tss: 0 }));
    const s = serieCarga(dias, { ctlDias: 42, atlDias: 7, sementes: { "2026-01-01": { ctl: 40, atl: 30 } } });
    expect(s[0]).toMatchObject({ ctl: 40, atl: 30, tsb: 10 });
    expect(s[2].ctl).toBeLessThan(40);
  });

  it("esforço 0-10", () => {
    expect(esforco010(0, 100)).toBe(0);
    expect(esforco010(100, 100)).toBeCloseTo(6.32, 2);
    expect(esforco010(500, 100)).toBeLessThan(10);
  });
});

describe("constantes por data", () => {
  const linhas = [
    { chave: "ftp_w", dataEfetiva: "2026-02-10", valor: 199, valorJson: null },
    { chave: "ftp_w", dataEfetiva: "2026-05-26", valor: 211, valorJson: null },
    { chave: "ftp_w", dataEfetiva: "2026-10-22", valor: 216, valorJson: null },
  ];
  it("valor válido em cada data; antes da primeira usa a mais antiga", () => {
    expect(numeroNaData(linhas, "ftp_w", "2026-01-05")).toBe(199);
    expect(numeroNaData(linhas, "ftp_w", "2026-05-26")).toBe(211);
    expect(numeroNaData(linhas, "ftp_w", "2026-10-29")).toBe(216);
    expect(linhaNaData(linhas, "lthr", "2026-10-29")).toBeNull();
  });
});

describe("Zwift", () => {
  // Sessão em degraus de 6 min: 120, 150, 180, 210 W; FC = 60 + 0,5·P com atraso nulo.
  const watts = [120, 150, 180, 210].flatMap((p) => new Array(360).fill(p));
  const fc = watts.map((p) => 60 + 0.5 * p);

  it("janelas estáveis descartam o início de cada bloco", () => {
    const j = janelasPotencia(watts, fc, { janelaS: 180, cvMax: 0.05, descartarInicioS: 120 });
    expect(j.length).toBe(4);
    expect(j.map((x) => Math.round(x.p))).toEqual([120, 150, 180, 210]);
  });

  it("FC a X W e W a X bpm a partir da regressão", () => {
    const r = relacaoFcPotencia(janelasPotencia(watts, fc, { janelaS: 180, cvMax: 0.05, descartarInicioS: 120 }))!;
    expect(r.fc150W.valor).toBeCloseTo(135, 6);
    expect(r.fc200W.valor).toBeCloseTo(160, 6);
    expect(r.w150bpm.valor).toBeCloseTo(180, 6);
    expect(r.w160bpm.extrapolado).toBe(false);
  });

  it("desacoplamento: FC a subir na 2.ª metade dá valor positivo", () => {
    const w = new Array(4000).fill(150);
    const f = w.map((_, i) => (i < 2000 ? 130 : 136.5));
    expect(desacoplamento(w, f)).toBeCloseTo(0.0476, 3);
    expect(desacoplamento(w.slice(0, 100), f.slice(0, 100))).toBeNull();
    // Sessão em degraus (2.ª metade mais forte): não é estável, não se calcula.
    const degraus = w.map((_, i) => (i < 2000 ? 150 : 200));
    expect(desacoplamento(degraus, f)).toBeNull();
  });

  it("CP/W' de uma curva gerada pelo modelo", () => {
    const curva = Object.fromEntries([180, 300, 600, 1200].map((t) => [t, 200 + 15000 / t]));
    const r = cpWLinha(curva)!;
    expect(r.cp).toBeCloseTo(200, 6);
    expect(r.wLinha).toBeCloseTo(15000, 3);
  });

  it("tendência: só conclui quando o IC 95% não inclui zero", () => {
    const sobe = Array.from({ length: 10 }, (_, i) => ({
      data: diasEntre("2026-01-01", "2026-12-31")[i * 7],
      valor: 150 + i * 2 + (i % 2 ? 0.5 : -0.5),
    }));
    expect(tendencia(sobe, true).veredicto).toBe("melhorou");
    expect(tendencia(sobe, false).veredicto).toBe("piorou");
    const ruido = sobe.map((p, i) => ({ ...p, valor: 150 + (i % 2 ? 5 : -5) }));
    expect(tendencia(ruido, true).veredicto).toBe("inconclusivo");
  });
});
