import { connection } from "next/server";
import Link from "next/link";
import { db } from "@/db/client";
import { agruparSemanas, atividadesComMetricas, cargaRecente } from "@/lib/calculo/consultas";
import { ESTADO_CALCULO } from "@/lib/calculo/recalcular";
import { estadoSistema, lerEstado } from "@/lib/sistema";
import { estadoStrava } from "@/lib/strava/estado";
import { estadoValidacao, lerBacktests, previsaoDetalhada, previsoesMetas } from "@/lib/previsao/consultas";
import { formatarDataHora } from "@/lib/formato";
import { sair } from "./login/actions";
import { AtividadeLinha } from "./atividade-linha";
import { CartaoPrevisao } from "./cartao-previsao";
import { CartaoStrava } from "./cartao-strava";
import { GraficoCarga, GraficoSemanas } from "./graficos";

// Painel provisório: Strava, carga, últimas atividades, metas e sistema.
// O painel final (§10, com prescrições e previsões) chega na fase 6.
export default async function Painel({ searchParams }: PageProps<"/">) {
  await connection();
  const { strava, semanas: unidadeSemanas } = await searchParams;
  const [estado, strv, previsoes, backtests, ultimas, carga, calculo] = await Promise.all([
    estadoSistema(db()),
    estadoStrava(db()),
    previsoesMetas(db()),
    lerBacktests(db()),
    atividadesComMetricas(db(), 3),
    cargaRecente(db(), 112),
    lerEstado<{ em: string }>(db(), ESTADO_CALCULO),
  ]);
  const hoje = carga.at(-1);
  const faltas = await Promise.all(
    previsoes.map(async (x) =>
      x.ultimo && !x.ultimo.suficiente
        ? (((await previsaoDetalhada(db(), x.meta.id))?.detalhes as { falta?: string[] } | null)?.falta ?? [])
        : [],
    ),
  );
  const emHoras = unidadeSemanas === "horas";
  const semanas = agruparSemanas(carga, 12).map((s) => ({
    inicio: s.inicio,
    valores: emHoras ? s.horas : s.tss,
  }));

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Treino 26/27</h1>
        <form action={sair}>
          <button type="submit" className="text-sm text-zinc-600 underline dark:text-zinc-400">
            Sair
          </button>
        </form>
      </header>

      <nav className="flex flex-wrap gap-4 text-sm underline">
        <Link href="/atividades">Atividades</Link>
        <Link href="/zwift">Análise Zwift</Link>
        <Link href="/constantes">Constantes e parâmetros</Link>
      </nav>

      <CartaoStrava estado={strv} mensagem={typeof strava === "string" ? strava : undefined} />

      {hoje && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-medium">Fitness · Fadiga · Forma</h2>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl border border-zinc-200 p-2 dark:border-zinc-800">
              <p className="text-xs text-zinc-500">Fitness (CTL)</p>
              <p className="text-2xl font-semibold" style={{ color: "#0284c7" }}>{Math.round(hoje.ctl)}</p>
            </div>
            <div className="rounded-xl border border-zinc-200 p-2 dark:border-zinc-800">
              <p className="text-xs text-zinc-500">Fadiga (ATL)</p>
              <p className="text-2xl font-semibold" style={{ color: "#9333ea" }}>{Math.round(hoje.atl)}</p>
            </div>
            <div className="rounded-xl border border-zinc-200 p-2 dark:border-zinc-800">
              <p className="text-xs text-zinc-500">Forma (TSB)</p>
              <p className="text-2xl font-semibold">
                {hoje.tsb >= 0 ? "+" : ""}
                {Math.round(hoje.tsb)}
                <span className="ml-1 text-sm font-normal text-zinc-500">
                  {hoje.ctl > 0 ? `${Math.round((hoje.tsb / hoje.ctl) * 100)}%` : ""}
                </span>
              </p>
            </div>
          </div>
          <GraficoCarga pontos={carga} />
          <div className="flex items-baseline justify-between">
            <h3 className="font-medium">Últimas 12 semanas</h3>
            <span className="flex gap-2 text-sm">
              <Link href="/" className={emHoras ? "underline" : "font-semibold"}>TSS</Link>
              <Link href="/?semanas=horas" className={emHoras ? "font-semibold" : "underline"}>Horas</Link>
            </span>
          </div>
          <GraficoSemanas semanas={semanas} unidade={emHoras ? "h" : "TSS"} />
          {calculo && (
            <p className="text-xs text-zinc-500">Calculado em {formatarDataHora(new Date(calculo.em))}</p>
          )}
        </section>
      )}

      {ultimas.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-medium">Últimas atividades</h2>
            <Link href="/atividades" className="text-sm text-zinc-600 underline dark:text-zinc-400">
              Ver todas
            </Link>
          </div>
          <ul className="flex flex-col gap-2">
            {ultimas.map(({ a, m }) => (
              <AtividadeLinha key={a.id} a={a} m={m} />
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-medium">Previsões</h2>
          <span className="flex gap-3 text-sm">
            <Link href="/metas/nova" className="underline">
              Nova meta (GPX)
            </Link>
            <Link href="/backtests" className="underline">
              Backtests
            </Link>
          </span>
        </div>
        <ul className="flex flex-col gap-3">
          {previsoes.map((x, i) => (
            <CartaoPrevisao
              key={x.meta.id}
              m={x.meta}
              ultimo={x.ultimo}
              historico={x.historico}
              falta={faltas[i]}
              validacao={estadoValidacao(backtests, x.meta.tipo)}
            />
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-1 text-sm text-zinc-600 dark:text-zinc-400">
        <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">Sistema</h2>
        <p>Base de dados: {estado.bd ? "ligada" : "sem ligação"}</p>
        <p>
          Worker: {estado.worker.ativo ? "ativo" : "parado"}
          {estado.worker.ultimoSinal &&
            ` (último sinal ${formatarDataHora(new Date(estado.worker.ultimoSinal))})`}
        </p>
      </section>
    </main>
  );
}
