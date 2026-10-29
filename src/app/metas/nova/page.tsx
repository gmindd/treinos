import Link from "next/link";
import { NovaMetaGpx } from "../formularios";

export default function NovaMeta() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4">
      <Link href="/" className="text-sm underline">
        ← Painel
      </Link>
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Nova meta a partir de um GPX</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Carrega o GPX de uma prova ou percurso de BTT e define o tempo que queres fazer. A app divide-o em zonas de declive, prevê quanto demorarias
          em cada uma na forma atual (o mesmo motor da Rota) e mostra onde ganhas ou perdes tempo face ao objetivo. Se o GPX tiver horas (ex.:
          exportado do Strava), esses tempos servem de referência.
        </p>
      </header>
      <NovaMetaGpx />
    </main>
  );
}
