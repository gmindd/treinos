import { connection } from "next/server";
import Link from "next/link";
import { db } from "@/db/client";
import { formatarData, formatarDataHora, formatarDistancia, formatarDuracao, formatarNumero } from "@/lib/formato";
import { estadoValidacao, lerBacktests } from "@/lib/previsao/consultas";

const dur = (s: number | null | undefined) => (s != null && Number.isFinite(s) ? formatarDuracao(s) : "—");
const pct = (x: number | null | undefined) => (x != null && Number.isFinite(x) ? `${x > 0 ? "+" : ""}${formatarNumero(x * 100, 1)}%` : "—");

// Aceitação das fases 3 e 4 (brief §11): previsões feitas só com dados anteriores.
export default async function PaginaBacktests() {
  await connection();
  const b = await lerBacktests(db());
  if (!b) {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4">
        <Link href="/" className="text-sm underline">
          ← Painel
        </Link>
        <p>Os backtests ainda não correram (correm depois de cada recálculo).</p>
      </main>
    );
  }
  const vc = estadoValidacao(b, "corrida");
  const vb = estadoValidacao(b, "btt");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4">
      <Link href="/" className="text-sm underline">
        ← Painel
      </Link>
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Backtests</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Calculados a {formatarDataHora(new Date(b.em))} (modelo {b.versao}) com {b.dados.corridas} corridas, {b.dados.voltas} voltas BTT e {b.dados.zwift} sessões Zwift (
          {b.dados.zwiftComJanelas} com janelas estáveis).
        </p>
      </header>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Fase 3 · Corrida</h2>
        <p className={`text-sm ${vc.passou === false ? "text-red-700 dark:text-red-400" : vc.passou ? "text-green-700 dark:text-green-400" : ""}`}>{vc.texto}</p>
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          Cada corrida com FC média ≥ 160 bpm no melhor troço de 5 km (ou 3 km) é prevista à mesma FC e distância, só com as corridas anteriores.
        </p>
        <table className="w-full text-sm">
          <thead className="text-left text-zinc-500">
            <tr>
              <th className="py-1 font-normal">Corrida</th>
              <th className="font-normal">Real</th>
              <th className="font-normal">Previsto</th>
              <th className="font-normal">Erro</th>
            </tr>
          </thead>
          <tbody>
            {b.corrida.casos.map((c) => (
              <tr key={`${c.sessao.id}`} className="border-t border-zinc-200 align-top dark:border-zinc-800">
                <td className="py-1">
                  {formatarData(c.sessao.data)} · {formatarDistancia(c.distanciaM)} a {Math.round(c.fcMedia)} bpm
                  <span className="block text-xs text-zinc-500">
                    A {dur(c.a?.tempoS)} ({c.janelasDisponiveis} janelas) · B {dur(c.b?.tempoS)}
                  </span>
                </td>
                <td className="whitespace-nowrap pr-2">{dur(c.realS)}</td>
                <td className="whitespace-nowrap pr-2">{dur(c.previstoS)}</td>
                <td className="whitespace-nowrap">{c.erro != null ? pct(c.erro) : "sem dados"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Fase 4 · BTT</h2>
        <p className={`text-sm ${vb.passou === false ? "text-red-700 dark:text-red-400" : vb.passou ? "text-green-700 dark:text-green-400" : ""}`}>{vb.texto}</p>
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          Cada prova é prevista com os dados até à véspera e com a FC real da prova em cada segmento. Compara-se com o tempo em movimento da prova medido da mesma forma (nos dados segundo a segundo); o do resumo do Strava fica ao lado.
        </p>
        {b.btt.map((c) => {
          const porClasse = new Map<string, { real: number; prev: number; comp: number }>();
          for (const s of c.segmentos) {
            const x = porClasse.get(s.classe) ?? { real: 0, prev: 0, comp: 0 };
            x.real += s.realS;
            x.prev += s.previstoS ?? 0;
            x.comp += s.comp;
            porClasse.set(s.classe, x);
          }
          return (
            <article key={c.prova.id} className="flex flex-col gap-2 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
              <p className="font-medium">
                {c.prova.nome} · {formatarData(c.prova.data)}
              </p>
              <p className="text-sm">
                Real {dur(c.realS)}{c.realStravaS ? ` (Strava ${dur(c.realStravaS)})` : ""}
                {c.p10S != null && c.p90S != null ? ` · intervalo 80% ${dur(c.p10S)}–${dur(c.p90S)} (${c.dentroIntervalo ? "o real ficou dentro" : "o real ficou fora"})` : ""} · previsto <strong>{dur(c.previstoS)}</strong> ({pct(c.erro)}) · A {dur(c.aS)} ({pct(c.erroA)}) · B {dur(c.bS)} ({pct(c.erroB)})
              </p>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                Cobertura de A {formatarNumero(c.cobertura * 100)}% · segmentos por nível (troço/classe/vizinhas/B) {c.niveis.join("/")} · Crr calibrado em{" "}
                {c.calibracao.voltas} voltas
                {c.relacao ? ` · FC = ${formatarNumero(c.relacao.alfa, 1)} + ${formatarNumero(c.relacao.beta, 3)}·P` : " · sem relação FC → W"}
              </p>
              {c.falta.length > 0 && <p className="text-xs text-amber-700 dark:text-amber-400">{c.falta.join(" ")}</p>}
              <table className="w-full text-xs">
                <thead className="text-left text-zinc-500">
                  <tr>
                    <th className="py-1 font-normal">Declive</th>
                    <th className="font-normal">km</th>
                    <th className="font-normal">Real</th>
                    <th className="font-normal">Previsto</th>
                    <th className="font-normal">Erro</th>
                  </tr>
                </thead>
                <tbody>
                  {[...porClasse.entries()].map(([k, x]) => (
                    <tr key={k} className="border-t border-zinc-200 dark:border-zinc-800">
                      <td className="py-0.5">{k}</td>
                      <td>{formatarNumero(x.comp / 1000, 1)}</td>
                      <td>{dur(x.real)}</td>
                      <td>{dur(x.prev)}</td>
                      <td>{pct((x.prev - x.real) / x.real)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <details>
                <summary className="cursor-pointer text-xs">Erro por segmento ({c.segmentos.length})</summary>
                <table className="mt-1 w-full text-xs">
                  <thead className="text-left text-zinc-500">
                    <tr>
                      <th className="font-normal">km</th>
                      <th className="font-normal">Decl.</th>
                      <th className="font-normal">FC</th>
                      <th className="font-normal">Real</th>
                      <th className="font-normal">Prev.</th>
                      <th className="font-normal">Erro</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.segmentos.map((s) => (
                      <tr key={s.dIni} className="border-t border-zinc-200 dark:border-zinc-800">
                        <td>{formatarNumero(s.dIni / 1000, 1)}</td>
                        <td>{formatarNumero(s.declive * 100, 1)}%</td>
                        <td>{s.fc != null ? Math.round(s.fc) : "—"}</td>
                        <td>{dur(s.realS)}</td>
                        <td>{dur(s.previstoS)}</td>
                        <td>{s.previstoS != null && s.realS > 0 ? pct((s.previstoS - s.realS) / s.realS) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </article>
          );
        })}
        {b.dados.voltasExcluidas.length > 0 && (
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            Voltas fora dos estimadores: {b.dados.voltasExcluidas.map((v) => `${formatarData(v.data)} ${v.nome} (${v.motivo})`).join("; ")}.
          </p>
        )}
      </section>
    </main>
  );
}
