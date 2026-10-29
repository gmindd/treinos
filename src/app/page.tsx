import { connection } from "next/server";
import Link from "next/link";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { atividade, meta } from "@/db/schema";
import { estadoSistema } from "@/lib/sistema";
import { estadoStrava } from "@/lib/strava/estado";
import { formatarData, formatarDataHora, formatarDuracao } from "@/lib/formato";
import { sair } from "./login/actions";
import { AtividadeLinha } from "./atividade-linha";
import { CartaoStrava } from "./cartao-strava";

// Painel provisório: estado do Strava, últimas atividades, metas e sistema.
// O painel real (§10) chega na fase 6.
export default async function Painel({ searchParams }: PageProps<"/">) {
  await connection();
  const { strava } = await searchParams;
  const [estado, strv, metas, ultimas] = await Promise.all([
    estadoSistema(db()),
    estadoStrava(db()),
    db().select().from(meta).where(eq(meta.ativa, true)).orderBy(asc(meta.dataProva)),
    db().select().from(atividade).where(eq(atividade.apagada, false)).orderBy(desc(atividade.inicio)).limit(3),
  ]);

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

      <CartaoStrava estado={strv} mensagem={typeof strava === "string" ? strava : undefined} />

      {ultimas.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-medium">Últimas atividades</h2>
            <Link href="/atividades" className="text-sm text-zinc-600 underline dark:text-zinc-400">
              Ver todas
            </Link>
          </div>
          <ul className="flex flex-col gap-2">
            {ultimas.map((a) => (
              <AtividadeLinha key={a.id} a={a} />
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Metas</h2>
        <ul className="flex flex-col gap-3">
          {metas.map((m) => (
            <li key={m.id} className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
              <p className="font-medium">{m.nome}</p>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                {formatarData(m.dataProva)} · alvo &lt; {formatarDuracao(m.tempoAlvoS)}
                {m.alvoEmMovimento ? " em movimento" : ""}
                {m.tempoReferenciaS ? ` · referência ${formatarDuracao(m.tempoReferenciaS)}` : ""}
              </p>
            </li>
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
