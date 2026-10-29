// Cartão de uma meta no painel (§10.5): hoje, projeção, intervalo, probabilidade,
// distância à meta e evolução da previsão.
import Link from "next/link";
import type { meta } from "@/db/schema";
import { diasDesde } from "@/lib/analysis/estatistica";
import { formatarData, formatarDuracao, formatarNumero } from "@/lib/formato";
import { GraficoPrevisao } from "./graficos";

type Snapshot = {
  data: string;
  suficiente: boolean;
  hojeS: number | null;
  hojeP10S: number | null;
  hojeP90S: number | null;
  projecaoS: number | null;
  projecaoP10S: number | null;
  projecaoP90S: number | null;
  probAlvo: number | null;
};

const intervalo = (a: number | null, b: number | null) =>
  a != null && b != null ? ` (${formatarDuracao(a)}–${formatarDuracao(b)})` : "";

export function CartaoPrevisao({
  m,
  ultimo,
  historico,
  falta,
  validacao,
}: {
  m: typeof meta.$inferSelect;
  ultimo: Snapshot | null;
  historico: { data: string; hoje: number | null; projecao: number | null }[];
  falta: string[];
  validacao: { passou: boolean | null; texto: string };
}) {
  const dias = Math.round(diasDesde(new Date().toISOString().slice(0, 10), m.dataProva));
  const ref = ultimo?.projecaoS ?? ultimo?.hojeS ?? null;
  const diferenca = ref != null ? ref - m.tempoAlvoS : null;
  return (
    <li className="flex flex-col gap-2 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-medium">{m.nome}</p>
        <Link href={`/metas/${m.id}`} className="shrink-0 text-sm underline">
          Detalhe
        </Link>
      </div>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {formatarData(m.dataProva)} ({dias} dias) · meta &lt; {formatarDuracao(m.tempoAlvoS)}
        {m.alvoEmMovimento ? " em movimento" : ""}
      </p>
      {!ultimo ? (
        <p className="text-sm">A calcular a primeira previsão…</p>
      ) : !ultimo.suficiente ? (
        <div className="text-sm">
          <p className="font-medium">Dados insuficientes para prever:</p>
          <ul className="list-disc pl-5">
            {falta.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <dt className="text-zinc-500">Se fosse hoje</dt>
              <dd className="text-lg font-semibold">{ultimo.hojeS != null ? formatarDuracao(ultimo.hojeS) : "—"}</dd>
              <dd className="text-xs text-zinc-500">{intervalo(ultimo.hojeP10S, ultimo.hojeP90S)}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Projeção para a prova</dt>
              <dd className="text-lg font-semibold">{ultimo.projecaoS != null ? formatarDuracao(ultimo.projecaoS) : "—"}</dd>
              <dd className="text-xs text-zinc-500">{intervalo(ultimo.projecaoP10S, ultimo.projecaoP90S)}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Probabilidade de bater a meta</dt>
              <dd className="font-semibold">{ultimo.probAlvo != null ? `${formatarNumero(ultimo.probAlvo * 100)}%` : "—"}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Distância à meta</dt>
              <dd className="font-semibold">
                {diferenca == null ? "—" : diferenca > 0 ? `faltam ${formatarDuracao(diferenca)}` : `${formatarDuracao(-diferenca)} abaixo`}
              </dd>
            </div>
          </dl>
          <GraficoPrevisao pontos={historico} alvoS={m.tempoAlvoS} />
        </>
      )}
      <p
        className={`text-xs ${validacao.passou === false ? "text-red-700 dark:text-red-400" : validacao.passou ? "text-green-700 dark:text-green-400" : "text-zinc-500"}`}
      >
        {validacao.passou === false ? "Modelo por validar. " : ""}
        {validacao.texto}
      </p>
    </li>
  );
}
