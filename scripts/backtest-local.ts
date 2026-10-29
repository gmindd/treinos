// Backtests das fases 3 e 4 com streams reais guardados em .data/strava-real
// (<id>.json no formato do MCP do Strava + meta.tsv). Uso: npx tsx scripts/backtest-local.ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { backtestBtt, perfisPacing, preparar, preverBtt } from "../src/lib/analysis/previsao-btt";
import { backtestCorrida, preverCorrida } from "../src/lib/analysis/previsao-corrida";
import type { Streams } from "../src/lib/analysis/series";
import { formatarDuracao } from "../src/lib/formato";
import {
  parametrosBtt,
  parametrosCorrida,
  sessaoCorrida,
  sessaoZwift,
  voltaBtt,
  type InfoAtividade,
} from "../src/lib/previsao/entradas";

const DIR = path.join(process.cwd(), ".data", "strava-real");
const MOVIMENTO_STRAVA: Record<string, number> = { "18330245057": 8263, "20350045096": 11081, "20633496725": 11374 };

const p = new Map<string, unknown>();
const pc = parametrosCorrida(p);
const pb = parametrosBtt(p, 124);
const massa = () => 79 + 12.5 + 6;

const linhas = readFileSync(path.join(DIR, "meta.tsv"), "utf8").trim().split("\n").map((l) => l.split("\t"));
const pct = (x: number | null | undefined) => (x == null ? "—" : `${(x * 100).toFixed(1)}%`);
const dur = (x: number | null | undefined) => (x == null ? "—" : formatarDuracao(x));

const corridas = [];
const voltas = [];
const zwift = [];
for (const [id, inicio, tipo, nome, tags] of linhas) {
  const bruto = JSON.parse(readFileSync(path.join(DIR, `${id}.json`), "utf8"));
  const s: Streams = { ...bruto, heartrate: bruto.heart_rate, latlng: bruto.location };
  const time = s.time as number[];
  const mov = s.moving as boolean[] | undefined;
  let movS = 0;
  for (let i = 1; i < time.length; i++) if (!mov || mov[i]) movS += Math.min(10, time[i] - time[i - 1]);
  const info: InfoAtividade = {
    id: Number(id.slice(-6)),
    data: inicio.slice(0, 10),
    nome,
    descricao: null,
    sportType: tipo,
    comCriancas: false,
    duracaoMovimentoS: MOVIMENTO_STRAVA[id] ?? movS,
    distanciaM: (s.distance as number[]).at(-1) ?? null,
    workoutType: tags === "Race" ? 1 : null,
  };
  if (tipo === "Run") {
    const x = sessaoCorrida(info, s, p);
    if (x) corridas.push(x);
  } else if (tipo === "VirtualRide") {
    const x = sessaoZwift(info, s, p);
    if (x) zwift.push(x);
  } else {
    const x = voltaBtt({ ...info, id: Number(id) }, s, pb);
    if (x) voltas.push(x);
  }
}
corridas.sort((a, b) => a.data.localeCompare(b.data));
voltas.sort((a, b) => a.data.localeCompare(b.data));
zwift.sort((a, b) => a.data.localeCompare(b.data));
console.log(`Corridas ${corridas.length} · voltas BTT ${voltas.length} · Zwift ${zwift.length}`);
console.log("Voltas excluídas:", voltas.filter((v) => v.excluida).map((v) => `${v.data} ${v.excluida}`).join("; ") || "nenhuma");

console.log("\n=== Fase 3: backtest de corrida (esforços com FC ≥ 160) ===");
const bc = backtestCorrida(corridas, 160, pc);
for (const c of bc.casos) {
  console.log(
    `${c.sessao.data} ${c.sessao.nome.padEnd(22)} ${c.distanciaM / 1000} km @ ${Math.round(c.fcMedia)} bpm · real ${dur(c.realS)} · previsto ${dur(c.previstoS)} · erro ${pct(c.erro)} · A ${dur(c.a?.tempoS)} (${c.janelasDisponiveis} janelas) · B ${dur(c.b?.tempoS)}`,
  );
}
console.log(`Avaliados ${bc.avaliados}, sem dados ${bc.semDados}, erro mediano |${pct(bc.erroMedianoAbs)}|`);

console.log("\n=== Fase 4: backtests BTT (FC real da prova, dados até à véspera) ===");
for (const id of [18330245057, 20350045096, 20633496725]) {
  const alvo = voltas.find((v) => v.id === id)!;
  const r = backtestBtt(alvo, voltas, zwift, alvo.data, massa, pb);
  console.log(
    `${r.prova.data} ${r.prova.nome}: real ${dur(r.realS)} nos streams (${dur(r.realStravaS)} no Strava, fator ${r.fatorMovimento?.toFixed(3)}) · previsto ${dur(r.previstoS)} (erro ${pct(r.erro)}) · A ${dur(r.aS)} (${pct(r.erroA)}) · B ${dur(r.bS)} (${pct(r.erroB)}) · cobertura ${pct(r.cobertura)} · níveis ${r.niveis.join("/")}`,
  );
  console.log(`  calibração: ${r.calibracao.fonte}, ${r.calibracao.voltas} voltas; relação FC→W: ${r.relacao ? `FC = ${r.relacao.alfa.toFixed(1)} + ${r.relacao.beta.toFixed(3)}·P (n ${r.relacao.n})` : "—"}`);
  if (r.falta.length) console.log("  falta:", r.falta.join(" | "));
  const porClasse = new Map<string, { real: number; prev: number; comp: number }>();
  for (const s of r.segmentos) {
    const c = porClasse.get(s.classe) ?? { real: 0, prev: 0, comp: 0 };
    c.real += s.realS ?? 0;
    c.prev += s.previstoS ?? 0;
    c.comp += s.comp;
    porClasse.set(s.classe, c);
  }
  for (const [k, c] of porClasse) console.log(`    ${k.padEnd(12)} ${(c.comp / 1000).toFixed(1)} km · real ${dur(c.real)} · previsto ${dur(c.prev)} · ${pct((c.prev - c.real) / c.real)}`);
}

console.log("\n=== Previsões de hoje (dados até 29/10/2026) ===");
const sao = preverCorrida(corridas, "2026-10-30", 10000, 3600, "2026-12-26", pc);
console.log(`São Silvestre: suficiente ${sao.suficiente} · hoje ${dur(sao.hoje?.centralS)} [${dur(sao.hoje?.p10)}–${dur(sao.hoje?.p90)}] P(<60') ${pct(sao.hoje?.probAlvo)} · projeção ${dur(sao.projecao?.centralS)} P ${pct(sao.projecao?.probAlvo)}`);
console.log(`  A ${dur(sao.a?.tempoS)} · B ${dur(sao.b?.tempoS)} · FC prova ${sao.fcProva.valor} · falta: ${sao.falta.join(" | ") || "—"} · avisos: ${sao.avisos.join(" | ") || "—"}`);
console.log(`  durabilidade: ${sao.durabilidade.motivos.join(" ")} · sensibilidade ${sao.sensibilidade.map((x) => `${x.fc}: ${dur(x.tempoS)}`).join(", ")}`);
const rota = voltas.find((v) => v.id === 18330245057)!;
const prep = preparar(rota, voltas, pb);
const t0 = Date.now();
const rp = preverBtt(
  prep,
  zwift,
  {
    ate: "2026-10-30",
    dataProva: "2027-05-01",
    alvoS: 7200,
    perfis: perfisPacing(rota, pb, "Como em 2026"),
    refIds: [rota.id],
    referencia: { tempoS: 8263, porSeg: rota.segmentos.map((s) => s.tempoMovS) },
    massa,
    bootstrap: true,
  },
  pb,
);
console.log(`Rota 2027: suficiente ${rp.suficiente} · ${Date.now() - t0} ms`);
for (const c of rp.cenarios) console.log(`  ${c.nome}: hoje ${dur(c.hojeS)} · projeção ${dur(c.projecaoS)} · A ${dur(c.aS)} · B ${dur(c.bS)}`);
console.log(`  P10–P90 ${dur(rp.hoje?.p10)}–${dur(rp.hoje?.p90)} · P(<2h) ${pct(rp.hoje?.probAlvo)} · cobertura ${pct(rp.cobertura)} · progresso ${pct(rp.progresso)} · falta: ${rp.falta.join(" | ") || "—"} · avisos: ${rp.avisos.join(" | ") || "—"}`);
if (rp.marco) console.log(`  maior subida: ${(rp.marco.comp / 1000).toFixed(2)} km, ${Math.round(rp.marco.desnivel)} m · 2026 ${dur(rp.marco.referenciaS)} · previsto ${dur(rp.marco.previstoS)}`);
