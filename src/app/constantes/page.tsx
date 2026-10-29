import { connection } from "next/server";
import Link from "next/link";
import { asc, desc } from "drizzle-orm";
import { db } from "@/db/client";
import { constante, parametroModelo } from "@/db/schema";
import { dataIsoLisboa, formatarData } from "@/lib/formato";
import { apagarConstante } from "./actions";
import { EditarParametro, NovaConstante } from "./formularios";

export const metadata = { title: "Constantes · Treino 26/27" };

const NOMES: Record<string, string> = {
  ftp_w: "FTP (W)",
  lthr: "LTHR (bpm)",
  fc_max: "FC máxima",
  fc_repouso: "FC de repouso",
  zonas_fc: "Zonas de FC (limites Z1-Z4)",
  fc_teto_facil: "Teto de FC em fácil",
  peso_kg: "Peso (kg)",
  massa_bike_kg: "Massa da bike (kg)",
  massa_equipamento_kg: "Massa do equipamento (kg)",
  relacao_mais_leve: "Relação mais leve",
  ctl_semente: "Semente do CTL",
  atl_semente: "Semente do ATL",
};

const ORIGEM: Record<string, string> = {
  manual: "manual",
  teste: "teste",
  chat: "chat",
  estimado: "estimado",
  seed: "inicial",
  dados: "dados",
  heuristica: "heurística",
  literatura: "literatura",
};

export default async function PaginaConstantes() {
  await connection();
  const [linhas, parametros] = await Promise.all([
    db().select().from(constante).orderBy(asc(constante.chave), desc(constante.dataEfetiva)),
    db().select().from(parametroModelo).orderBy(asc(parametroModelo.grupo), asc(parametroModelo.chave)),
  ]);
  const porChave = new Map<string, typeof linhas>();
  for (const l of linhas) porChave.set(l.chave, [...(porChave.get(l.chave) ?? []), l]);
  const ordem = Object.keys(NOMES).filter((k) => porChave.has(k));
  const grupos = [...new Set(parametros.map((p) => p.grupo))];

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-8">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Constantes</h1>
        <Link href="/" className="text-sm text-zinc-600 underline dark:text-zinc-400">
          Painel
        </Link>
      </header>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Cada valor vale a partir da sua data; antes do primeiro usa-se o mais antigo. Ao mudar um valor, todos os treinos
        são recalculados com o valor válido na data de cada um. Os FTP tirados das atividades (testes no Zwift e
        valores escritos na descrição) são refeitos automaticamente.
      </p>

      <NovaConstante hoje={dataIsoLisboa(new Date())} />

      {ordem.map((k) => (
        <section key={k} className="flex flex-col gap-1">
          <h2 className="font-medium">{NOMES[k]}</h2>
          <ul className="flex flex-col text-sm">
            {porChave.get(k)!.map((l) => (
              <li key={l.id} className="flex items-baseline justify-between gap-3 border-b border-zinc-100 py-1 dark:border-zinc-900">
                <span className="w-24 shrink-0 text-zinc-500">{formatarData(l.dataEfetiva)}</span>
                <span className="w-28 shrink-0 font-medium">
                  {l.valor ?? (Array.isArray(l.valorJson) ? (l.valorJson as number[]).join(" · ") : "—")}
                </span>
                <span className="flex-1 text-xs text-zinc-500">
                  {ORIGEM[l.origem]}
                  {l.nota ? ` · ${l.nota}` : ""}
                  {l.atividadeStravaId && (
                    <>
                      {" · "}
                      <a href={`https://www.strava.com/activities/${l.atividadeStravaId}`} target="_blank" rel="noreferrer" className="underline">
                        Strava
                      </a>
                    </>
                  )}
                </span>
                {!l.atividadeStravaId && (
                  <form action={apagarConstante}>
                    <input type="hidden" name="id" value={l.id} />
                    <button type="submit" className="text-xs text-red-600 underline">
                      apagar
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}

      <h1 className="mt-6 text-2xl font-semibold">Parâmetros dos modelos</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Origem: <em>literatura</em> (valor publicado), <em>heurística</em> (escolha razoável, a validar) ou{" "}
        <em>dados</em> (ajustado aos teus dados).
      </p>
      {grupos.map((g) => (
        <section key={g} className="flex flex-col gap-3">
          <h2 className="font-medium capitalize">{g}</h2>
          {parametros
            .filter((p) => p.grupo === g)
            .map((p) => (
              <div key={p.chave} className="flex flex-col gap-1 border-b border-zinc-100 pb-2 text-sm dark:border-zinc-900">
                <p>
                  {p.descricao}
                  {p.unidade ? <span className="text-zinc-500"> ({p.unidade})</span> : null}
                </p>
                <p className="text-xs text-zinc-500">
                  {p.chave} · {ORIGEM[p.origem]} · omissão {JSON.stringify(p.valorDefault)}
                </p>
                <EditarParametro chave={p.chave} valor={JSON.stringify(p.valor)} />
              </div>
            ))}
        </section>
      ))}
    </main>
  );
}
