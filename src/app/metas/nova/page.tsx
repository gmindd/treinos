import Link from "next/link";
import { NovaMetaCorrida, NovaMetaGpx } from "../formularios";

export default function NovaMeta() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4">
      <Link href="/" className="text-sm underline">
        ← Painel
      </Link>
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Nova meta</h1>
      </header>
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">A partir de um GPX (BTT ou corrida)</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          A app divide o percurso em zonas de declive, prevê quanto demorarias em cada uma na forma atual e mostra onde ganhas ou perdes tempo face
          ao objetivo. Se o GPX tiver horas (ex.: exportado do Strava), esses tempos servem de referência. No BTT o tempo-alvo é em movimento; na
          corrida, o tempo oficial.
        </p>
        <NovaMetaGpx />
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Corrida sem GPX</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Indica a distância e o D+ (se ficar vazio, conta 10 m por km: 5 km → 50 m). O desnível entra como metade a subir e metade a descer.
        </p>
        <NovaMetaCorrida />
      </section>
    </main>
  );
}
