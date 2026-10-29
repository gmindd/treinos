import { describe, expect, it } from "vitest";
import { resumoPorZona } from "./analysis/previsao-btt";
import { lerDuracao } from "./formato";
import { desnivelPositivo, haversine, lerGpx, streamsDoGpx } from "./gpx";

const GPX = `<?xml version="1.0" encoding="UTF-8"?>
<gpx creator="StravaGPX" xmlns:ns3="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
  <metadata><name>Ignorado</name></metadata>
  <trk><name>Rota &amp; Trilhos</name><trkseg>
    <trkpt lat="41.700000" lon="-8.800000"><ele>10.0</ele><time>2026-05-01T08:00:00Z</time>
      <extensions><ns3:TrackPointExtension><ns3:hr>150</ns3:hr></ns3:TrackPointExtension></extensions></trkpt>
    <trkpt lat="41.700900" lon="-8.800000"><ele>20.0</ele><time>2026-05-01T08:00:20Z</time>
      <extensions><ns3:TrackPointExtension><ns3:hr>160</ns3:hr></ns3:TrackPointExtension></extensions></trkpt>
    <trkpt lat='41.701800' lon='-8.800000'><ele>15.0</ele><time>2026-05-01T08:00:40Z</time></trkpt>
  </trkseg></trk>
</gpx>`;

describe("GPX", () => {
  it("lê pontos, altitude, horas e FC (extensões Garmin) e o nome do trilho", () => {
    const g = lerGpx(GPX);
    expect(g.nome).toBe("Rota & Trilhos");
    expect(g.pontos).toHaveLength(3);
    expect(g.pontos[1]).toMatchObject({ ele: 20, fc: 160 });
    expect(g.pontos[2].fc).toBeNull();
    expect(g.temTempo).toBe(true);
    expect(g.temFc).toBe(true);
    // 0,0009° de latitude ≈ 100 m.
    expect(g.distanciaM).toBeCloseTo(200, -1);
    expect(g.desnivelM).toBe(10);
    const s = streamsDoGpx(g);
    expect(s.time).toEqual([0, 20, 40]);
  });

  it("percursos sem horas (rtept, auto-fechados) têm tempo sintético", () => {
    const g = lerGpx(`<gpx><rte><rtept lat="41.7" lon="-8.8"/><rtept lat="41.701" lon="-8.8"/></rte></gpx>`);
    expect(g.pontos).toHaveLength(2);
    expect(g.temTempo).toBe(false);
    expect(streamsDoGpx(g).time[1]).toBeCloseTo(g.distanciaM / 4, 6);
  });

  it("haversine e desnível com histerese", () => {
    expect(haversine({ lat: 0, lon: 0 }, { lat: 0, lon: 1 })).toBeCloseTo(111_195, -2);
    expect(desnivelPositivo([0, 1, 2, 1, 2, 10, 8, 12])).toBe(10);
    expect(desnivelPositivo([0, 10, 8, 13])).toBe(13);
  });
});

describe("tempo-alvo e zonas", () => {
  it("lê h:mm:ss e h:mm", () => {
    expect(lerDuracao("2:00:00")).toBe(7200);
    expect(lerDuracao("1:55")).toBe(6900);
    expect(lerDuracao("abc")).toBeNull();
    expect(lerDuracao("1:75:00")).toBeNull();
  });

  it("agrupa segmentos por zona de declive e por setor", () => {
    const seg = (declive: number, classeIdx: number, classe: string, ref: number, prev: number) => ({
      comp: 1000,
      declive,
      classe,
      classeIdx,
      referenciaS: ref,
      previstoS: prev,
      necessarioS: ref * 0.9,
    });
    const r = resumoPorZona([seg(0.06, 7, "+5 a +7%", 400, 380), seg(0, 4, "-1 a +1%", 200, 190), seg(-0.05, 2, "-6 a -3%", 150, 160), seg(0.06, 7, "+5 a +7%", 400, 390)]);
    expect(r.zonas.map((z) => z.nome)).toEqual(["-6 a -3%", "-1 a +1%", "+5 a +7%"]);
    expect(r.zonas[2]).toMatchObject({ comp: 2000, referenciaS: 800, previstoS: 770 });
    expect(r.setores.map((z) => z.nome)).toEqual(["Subidas", "Plano", "Descidas"]);
    expect(r.setores[0].desnivel).toBeCloseTo(120);
  });
});
