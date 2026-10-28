import { connection } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { meta } from "@/db/schema";
import { estadoSistema } from "@/lib/sistema";
import { formatarData, formatarDataHora, formatarDuracao } from "@/lib/formato";
import { sair } from "./login/actions";

// Painel provisório da fase 0: confirma que a BD, o seed e o worker estão a funcionar.
// O painel real (§10) chega na fase 6.
export default async function Painel() {
  await connection();
  const [estado, metas] = await Promise.all([
    estadoSistema(db()),
    db().select().from(meta).where(eq(meta.ativa, true)).orderBy(asc(meta.dataProva)),
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
