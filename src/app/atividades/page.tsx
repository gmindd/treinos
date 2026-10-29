import { connection } from "next/server";
import Link from "next/link";
import { and, count, eq, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { atividade, modalidadeAtividade } from "@/db/schema";
import { atividadesComMetricas } from "@/lib/calculo/consultas";
import { AtividadeLinha, ROTULO_MODALIDADE } from "../atividade-linha";

export const metadata = { title: "Atividades · Treino 26/27" };

const POR_PAGINA = 50;

type Modalidade = (typeof modalidadeAtividade.enumValues)[number];

export default async function PaginaAtividades({ searchParams }: PageProps<"/atividades">) {
  await connection();
  const sp = await searchParams;
  const modalidade = modalidadeAtividade.enumValues.find((m) => m === sp.modalidade) as Modalidade | undefined;
  const pagina = Math.max(1, Number(sp.pagina) || 1);

  const filtros: SQL[] = [eq(atividade.apagada, false)];
  if (modalidade) filtros.push(eq(atividade.modalidade, modalidade));
  const onde = and(...filtros);

  const [lista, [{ n }]] = await Promise.all([
    atividadesComMetricas(db(), POR_PAGINA, (pagina - 1) * POR_PAGINA, onde),
    db().select({ n: count() }).from(atividade).where(onde),
  ]);
  const paginas = Math.max(1, Math.ceil(n / POR_PAGINA));

  const ligacao = (m: string | undefined, p = 1) => {
    const q = new URLSearchParams();
    if (m) q.set("modalidade", m);
    if (p > 1) q.set("pagina", String(p));
    const s = q.toString();
    return s ? `/atividades?${s}` : "/atividades";
  };

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-8">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Atividades</h1>
        <Link href="/" className="text-sm text-zinc-600 underline dark:text-zinc-400">
          Painel
        </Link>
      </header>

      <nav className="flex flex-wrap gap-2 text-sm">
        {[undefined, ...modalidadeAtividade.enumValues].map((m) => (
          <Link
            key={m ?? "todas"}
            href={ligacao(m)}
            className={`rounded-full border px-3 py-1 ${
              m === modalidade
                ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                : "border-zinc-300 dark:border-zinc-700"
            }`}
          >
            {m ? ROTULO_MODALIDADE[m] : "Todas"}
          </Link>
        ))}
      </nav>

      <p className="text-sm text-zinc-600 dark:text-zinc-400">{n} atividades</p>

      {lista.length === 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Ainda não há atividades.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {lista.map(({ a, m }) => (
            <AtividadeLinha key={a.id} a={a} m={m} />
          ))}
        </ul>
      )}

      {paginas > 1 && (
        <nav className="flex items-center justify-between text-sm">
          {pagina > 1 ? (
            <Link href={ligacao(modalidade, pagina - 1)} className="underline">
              ← Mais recentes
            </Link>
          ) : (
            <span />
          )}
          <span className="text-zinc-500">
            Página {pagina} de {paginas}
          </span>
          {pagina < paginas ? (
            <Link href={ligacao(modalidade, pagina + 1)} className="underline">
              Mais antigas →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </main>
  );
}
