import Link from "next/link";
import type { atividade, atividadeMetricas } from "@/db/schema";
import { formatarData, formatarDistancia, formatarDuracao, formatarNumero } from "@/lib/formato";

export const ROTULO_MODALIDADE: Record<string, string> = {
  corrida: "Corrida",
  zwift: "Zwift",
  btt: "BTT",
  tenis: "Ténis",
  forca: "Força",
  outros: "Outros",
};

type Atividade = typeof atividade.$inferSelect;
type Metricas = typeof atividadeMetricas.$inferSelect;

/** Uma atividade numa lista: data, modalidade, nome, números principais e esforço. */
export function AtividadeLinha({ a, m }: { a: Atividade; m?: Metricas | null }) {
  const numeros = [
    formatarDuracao(a.duracaoMovimentoS),
    a.distanciaM ? formatarDistancia(a.distanciaM) : null,
    a.desnivelM ? `${Math.round(a.desnivelM)} m D+` : null,
    a.fcMedia ? `FC ${Math.round(a.fcMedia)}` : null,
    a.potenciaMedia ? `${Math.round(a.potenciaMedia)} W` : null,
  ].filter(Boolean);

  return (
    <li className="flex flex-col gap-1 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="flex items-baseline justify-between gap-3">
        <Link href={`/atividades/${a.id}`} className="truncate font-medium hover:underline">
          {a.nome}
        </Link>
        <span className="shrink-0 text-xs text-zinc-500">{formatarData(a.dataLocal)}</span>
      </div>
      <p className="flex flex-wrap gap-x-2 text-sm text-zinc-600 dark:text-zinc-400">
        <span className="font-medium text-zinc-800 dark:text-zinc-200">{ROTULO_MODALIDADE[a.modalidade]}</span>
        {numeros.map((n) => (
          <span key={n}>· {n}</span>
        ))}
        {a.comCriancas && <span>· com crianças</span>}
        {a.estadoStreams === "pendente" && <span className="text-amber-600">· streams por importar</span>}
        {a.estadoStreams === "sem_streams" && <span>· sem streams</span>}
      </p>
      {m?.tss != null && (
        <p className="text-sm">
          Esforço <strong>{formatarNumero(m.esforco010, 1)}</strong>/10 · {Math.round(m.tss)} TSS
          <span className="text-zinc-500"> ({m.metodoTss})</span>
        </p>
      )}
    </li>
  );
}
