import { connection } from "next/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { meta } from "@/db/schema";
import type { PrevisaoBtt, Zona } from "@/lib/analysis/previsao-btt";
import type { PrevisaoCorrida } from "@/lib/analysis/previsao-corrida";
import { formatarData, formatarDistancia, formatarDuracao, formatarNumero } from "@/lib/formato";
import { estadoValidacao, lerBacktests, previsaoDetalhada } from "@/lib/previsao/consultas";
import { corClasse, GraficoAltimetria, MapaPercurso } from "../../graficos";
import { removerMeta } from "../actions";
import { EditarMeta } from "../formularios";

const dur = (s: number | null | undefined) => (s != null && Number.isFinite(s) ? formatarDuracao(s) : "—");
const pct = (x: number | null | undefined, casas = 0) => (x != null && Number.isFinite(x) ? `${formatarNumero(x * 100, casas)}%` : "—");

function Lista({ titulo, itens, aviso }: { titulo: string; itens: string[]; aviso?: boolean }) {
  if (!itens.length) return null;
  return (
    <div className={`rounded-lg p-3 text-sm ${aviso ? "bg-amber-50 dark:bg-amber-950" : "bg-zinc-100 dark:bg-zinc-900"}`}>
      <p className="font-medium">{titulo}</p>
      <ul className="list-disc pl-5">
        {itens.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </div>
  );
}

function Corrida({ r, alvoS }: { r: PrevisaoCorrida; alvoS: number }) {
  return (
    <>
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Modelos</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-zinc-500">
            <tr>
              <th className="py-1 font-normal">Modelo</th>
              <th className="font-normal">Tempo</th>
              <th className="font-normal">Peso</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-zinc-200 dark:border-zinc-800">
              <td className="py-1">A · FC → velocidade a {Math.round(r.fcProva.valor)} bpm</td>
              <td>{dur(r.a?.tempoS)}</td>
              <td>{r.a ? formatarNumero(r.a.peso, 2) : "—"}</td>
            </tr>
            <tr className="border-t border-zinc-200 dark:border-zinc-800">
              <td className="py-1">B · melhor esforço (Riegel)</td>
              <td>{dur(r.b?.tempoS)}</td>
              <td>{r.b ? formatarNumero(r.b.peso, 2) : "—"}</td>
            </tr>
          </tbody>
        </table>
        {r.a && (
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            A: v = {formatarNumero(r.a.modelo.a, 3)} + {formatarNumero(r.a.modelo.b, 4)}·FC + {formatarNumero(r.a.modelo.c, 3)}·t(h), {r.a.modelo.n}{" "}
            janelas de {r.a.modelo.nSessoes} corridas, FC observada {Math.round(r.a.modelo.fcMin)}–{Math.round(r.a.modelo.fcMax)} bpm
            {r.a.extrapolado ? " (extrapolado)" : ""}.
          </p>
        )}
        {r.b && (
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            B: {formatarDistancia(r.b.esforco.distanciaM)} em {dur(r.b.esforco.tempoS)} a {formatarData(r.b.esforco.data)}
            {r.b.esforco.fcMedia ? ` (FC ${Math.round(r.b.esforco.fcMedia)})` : ""}.
          </p>
        )}
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          FC de prova: {Math.round(r.fcProva.valor)} bpm ({r.fcProva.origem === "dados" ? `de ${r.fcProva.sessao}` : "parâmetro"}).
        </p>
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Sensibilidade à FC de prova</h2>
        <table className="w-full text-sm">
          <tbody>
            {r.sensibilidade.map((s) => (
              <tr key={s.fc} className="border-t border-zinc-200 dark:border-zinc-800">
                <td className="py-1">{s.fc} bpm</td>
                <td>{dur(s.tempoS)}</td>
                <td className="text-zinc-500">{s.tempoS != null ? (s.tempoS <= alvoS ? "abaixo da meta" : `+${dur(s.tempoS - alvoS)}`) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="flex flex-col gap-1 text-sm">
        <h2 className="text-lg font-medium">Durabilidade e tendência</h2>
        <p>
          Corrida mais longa (21 dias): {Math.round(r.durabilidade.longaMin)} min · volume {formatarNumero(r.durabilidade.kmSemana, 1)} km/semana ·
          penalização {pct(r.durabilidade.penalizacao)} <span className="text-zinc-500">(heurística)</span>
        </p>
        <p>
          Eficiência (velocidade GAP a 150 bpm): {r.eficiencia.pontos.length} corridas ·{" "}
          {r.eficiencia.tendencia ? `tendência ${r.eficiencia.tendencia.veredicto}` : "sem dados para tendência"} · ganho projetado até à prova{" "}
          {pct(r.ganho.central, 1)} ({pct(r.ganho.baixo, 1)} a {pct(r.ganho.alto, 1)})
        </p>
        <p className="text-zinc-500">
          Dados: {r.dados.sessoes} corridas, {r.dados.janelas} janelas estáveis nas últimas semanas, {r.dados.esforcos} esforços ≥ 3 km.
        </p>
      </section>
    </>
  );
}

function corSegmento(previsto: number | null, necessario: number | null) {
  if (previsto == null || necessario == null) return "#a1a1aa";
  const r = previsto / necessario;
  return r <= 1 ? "#16a34a" : r <= 1.1 ? "#d97706" : "#dc2626";
}

/** Diferença com sinal: "+1:05" (folga) ou "−2:10" (perdes), a verde ou a vermelho. */
function Diferenca({ s }: { s: number | null }) {
  if (s == null || !Number.isFinite(s)) return <>—</>;
  const ganhas = s >= 0;
  return (
    <span className={ganhas ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}>
      {ganhas ? "+" : "−"}
      {formatarDuracao(Math.abs(s))}
    </span>
  );
}

function TabelaZonas({ zonas, titulo, cor }: { zonas: Zona[]; titulo: string; cor?: (z: Zona, i: number) => string }) {
  const temRef = zonas.some((z) => z.referenciaS != null);
  return (
    <table className="w-full text-xs">
      <thead className="text-left text-zinc-500">
        <tr>
          <th className="py-1 pr-1 font-normal">{titulo}</th>
          <th className="pr-1 font-normal">km</th>
          {temRef && <th className="pr-1 font-normal">Ref.</th>}
          <th className="pr-1 font-normal">Hoje</th>
          <th className="pr-1 font-normal">Meta</th>
          <th className="font-normal">Ganhas/perdes</th>
        </tr>
      </thead>
      <tbody>
        {zonas.map((z, i) => (
          <tr key={z.nome} className="border-t border-zinc-200 dark:border-zinc-800">
            <td className="whitespace-nowrap py-1 pr-1">
              {cor && <span style={{ color: cor(z, i) }}>■ </span>}
              {z.nome}
            </td>
            <td className="pr-1">{formatarNumero(z.comp / 1000, 1)}</td>
            {temRef && <td className="whitespace-nowrap pr-1">{dur(z.referenciaS)}</td>}
            <td className="whitespace-nowrap pr-1">{dur(z.previstoS)}</td>
            <td className="whitespace-nowrap pr-1">{dur(z.necessarioS)}</td>
            <td className="whitespace-nowrap">
              <Diferenca s={z.necessarioS != null && z.previstoS != null ? z.necessarioS - z.previstoS : null} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

type DetalhesBtt = PrevisaoBtt & {
  referencia?: { nome: string; data: string };
  gpx?: { temTempo: boolean; temFc: boolean; data: string | null };
  mapa?: ([number | null, number | null] | null)[];
  altimetria?: [number, number][];
  zonas?: Zona[];
  setores?: Zona[];
};

function Btt({ r }: { r: DetalhesBtt }) {
  const nivel = ["mesmo troço", "mesma classe", "classes vizinhas", "física (B)"];
  const comMeta = r.setores?.filter((z) => z.necessarioS != null && z.previstoS != null) ?? [];
  const pior = [...comMeta].sort((a, b) => (b.previstoS! - b.necessarioS!) / b.necessarioS! - (a.previstoS! - a.necessarioS!) / a.necessarioS!)[0];
  const semRef = r.gpx && !r.gpx.temTempo;
  return (
    <>
      {r.altimetria && (
        <section className="flex flex-col gap-1">
          <h2 className="text-lg font-medium">Altimetria</h2>
          <GraficoAltimetria pontos={r.altimetria} segmentos={r.segmentos} />
        </section>
      )}
      {r.setores && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">Onde ganhas e onde perdes</h2>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            &quot;Hoje&quot; é o tempo previsto na forma atual; &quot;Meta&quot; o que precisas para o tempo-alvo.{" "}
            {semRef
              ? "O GPX não tem horas, por isso a meta é distribuída na proporção do previsto (todos os setores ficam com a mesma percentagem)."
              : "A meta mantém as descidas da referência e distribui a poupança pelo plano e pelas subidas."}{" "}
            Verde = folga, vermelho = tempo a recuperar.
          </p>
          <TabelaZonas zonas={r.setores} titulo="Setor" />
          {pior && !semRef && pior.previstoS! > pior.necessarioS! && (
            <p className="text-sm">
              Onde estás mais longe da meta: <strong>{pior.nome.toLowerCase()}</strong> (faltam {dur(pior.previstoS! - pior.necessarioS!)},{" "}
              {pct((pior.previstoS! - pior.necessarioS!) / pior.necessarioS!)} acima do necessário).
            </p>
          )}
          {r.setores.some((z) => z.referenciaS != null) && (
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              Face à referência:{" "}
              {r.setores
                .filter((z) => z.referenciaS != null && z.previstoS != null)
                .map((z) => {
                  const d = z.referenciaS! - z.previstoS!;
                  return `${z.nome.toLowerCase()} ${d >= 0 ? "ganhas" : "perdes"} ${dur(Math.abs(d))}`;
                })
                .join(" · ")}
              .
            </p>
          )}
        </section>
      )}
      {r.zonas && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">Tempo por zona de declive</h2>
          <TabelaZonas zonas={r.zonas} titulo="Declive" cor={(z) => corClasse(r.segmentos.find((s) => s.classe === z.nome)?.classeIdx ?? 4)} />
        </section>
      )}
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Cenários de pacing</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-zinc-500">
            <tr>
              <th className="py-1 font-normal">Cenário</th>
              <th className="font-normal">Hoje</th>
              <th className="font-normal">Projeção</th>
            </tr>
          </thead>
          <tbody>
            {r.cenarios.map((c) => (
              <tr key={c.nome} className="border-t border-zinc-200 dark:border-zinc-800">
                <td className="py-1 pr-2">{c.nome}</td>
                <td className="whitespace-nowrap pr-2">{dur(c.hojeS)}</td>
                <td className="whitespace-nowrap">{dur(c.projecaoS)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          A (empírico) {dur(r.cenarios[0]?.aS)} · B (física) {dur(r.cenarios[0]?.bS)} · peso de A = cobertura {pct(r.cobertura)} · segmentos por nível:{" "}
          {r.niveis.map((n, i) => `${nivel[i]} ${n}`).join(", ")}.
        </p>
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          B: {r.relacao ? `FC = ${formatarNumero(r.relacao.alfa, 1)} + ${formatarNumero(r.relacao.beta, 3)}·P (${r.relacao.n} janelas Zwift)` : "sem relação FC → W"} · Crr calibrado
          {r.calibracao.fonte === "percurso" ? " na edição anterior" : " nas voltas anteriores"} ({r.calibracao.voltas} voltas) · massa {formatarNumero(r.massaKg, 1)} kg.
        </p>
        {r.progresso != null && (
          <p className="text-sm">
            Progresso desde {r.referencia ? formatarData(r.referencia.data) : r.gpx?.data ? formatarData(r.gpx.data) : "o GPX"}: <strong>{pct(r.progresso)}</strong> do
            caminho até à meta.
          </p>
        )}
        {r.marco && (
          <p className="text-sm">
            Maior subida ({formatarDistancia(r.marco.comp)}, {Math.round(r.marco.desnivel)} m, km {formatarNumero(r.marco.dIni / 1000, 1)}): referência{" "}
            {dur(r.marco.referenciaS)} · previsto {dur(r.marco.previstoS)}
            {r.marco.alvoS ? ` · marco < ${dur(r.marco.alvoS)}` : ""}
          </p>
        )}
      </section>
      {r.mapa && (
        <section className="flex flex-col gap-1">
          <h2 className="text-lg font-medium">Mapa</h2>
          <MapaPercurso
            pontos={r.mapa}
            passo={2}
            segmentos={r.segmentos.map((s) => ({ pontos: s.pontos, cor: corSegmento(s.previstoS, s.necessarioS) }))}
          />
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            <span style={{ color: "#16a34a" }}>━</span> previsto dentro do necessário · <span style={{ color: "#d97706" }}>━</span> até 10% acima ·{" "}
            <span style={{ color: "#dc2626" }}>━</span> mais de 10% acima
          </p>
        </section>
      )}
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Segmentos</h2>
        <details>
          <summary className="cursor-pointer text-sm">Tabela dos {r.segmentos.length} segmentos</summary>
          <table className="mt-2 w-full text-xs">
            <thead className="text-left text-zinc-500">
              <tr>
                <th className="py-1 font-normal">km</th>
                <th className="font-normal">Decl.</th>
                <th className="font-normal">Ref.</th>
                <th className="font-normal">Prev.</th>
                <th className="font-normal">Nec.</th>
                <th className="font-normal">Nível</th>
              </tr>
            </thead>
            <tbody>
              {r.segmentos.map((s) => (
                <tr key={s.dIni} className="border-t border-zinc-200 dark:border-zinc-800">
                  <td className="py-0.5">{formatarNumero(s.dIni / 1000, 1)}</td>
                  <td>{formatarNumero(s.declive * 100, 1)}%</td>
                  <td>{dur(s.referenciaS)}</td>
                  <td style={{ color: corSegmento(s.previstoS, s.necessarioS) }}>{dur(s.previstoS)}</td>
                  <td>{dur(s.necessarioS)}</td>
                  <td>{s.nivel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </section>
    </>
  );
}

export default async function PaginaMeta({ params }: PageProps<"/metas/[id]">) {
  await connection();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [[m], snap, backtests] = await Promise.all([
    db().select().from(meta).where(eq(meta.id, id)),
    previsaoDetalhada(db(), id),
    lerBacktests(db()),
  ]);
  if (!m) notFound();
  const det = (snap?.detalhes ?? {}) as { tipo?: string; falta?: string[]; avisos?: string[] };
  const validacao = estadoValidacao(backtests, m.tipo);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4">
      <Link href="/" className="text-sm underline">
        ← Painel
      </Link>
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">{m.nome}</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {formatarData(m.dataProva)} · meta &lt; {formatarDuracao(m.tempoAlvoS)}
          {m.alvoEmMovimento ? " em movimento" : ""}
          {snap ? ` · calculado com dados até ${formatarData(snap.data)}` : ""}
        </p>
      </header>
      <p className={`text-sm ${validacao.passou === false ? "text-red-700 dark:text-red-400" : "text-zinc-600 dark:text-zinc-400"}`}>
        {validacao.passou === false ? "Modelo por validar. " : ""}
        {validacao.texto} <Link href="/backtests" className="underline">Ver backtests</Link>
      </p>
      {snap && snap.suficiente && (
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-zinc-500">Se fosse hoje</dt>
            <dd className="text-lg font-semibold">{dur(snap.hojeS)}</dd>
            <dd className="text-xs text-zinc-500">intervalo 80%: {dur(snap.hojeP10S)}–{dur(snap.hojeP90S)}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Projeção para a prova</dt>
            <dd className="text-lg font-semibold">{dur(snap.projecaoS)}</dd>
            <dd className="text-xs text-zinc-500">intervalo 80%: {dur(snap.projecaoP10S)}–{dur(snap.projecaoP90S)}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Probabilidade de bater a meta</dt>
            <dd className="font-semibold">{pct(snap.probAlvo)}</dd>
          </div>
        </dl>
      )}
      <details className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
        <summary className="cursor-pointer text-sm">Editar meta</summary>
        <div className="mt-3 flex flex-col gap-3">
          <EditarMeta id={m.id} nome={m.nome} alvo={formatarDuracao(m.tempoAlvoS)} data={formatarData(m.dataProva)} />
          <form action={removerMeta}>
            <input type="hidden" name="id" value={m.id} />
            <button className="text-sm text-red-700 underline dark:text-red-400">{m.percursoId ? "Apagar meta e GPX" : "Retirar do painel"}</button>
          </form>
        </div>
      </details>
      <Lista titulo="O que falta" itens={det.falta ?? []} />
      <Lista titulo="Avisos" itens={det.avisos ?? []} aviso />
      {snap?.suficiente && det.tipo === "corrida" && <Corrida r={det as unknown as PrevisaoCorrida} alvoS={m.tempoAlvoS} />}
      {snap?.suficiente && det.tipo === "btt" && <Btt r={det as unknown as DetalhesBtt} />}
      {!snap && <p className="text-sm">A calcular a previsão… recarrega a página dentro de alguns segundos.</p>}
    </main>
  );
}
