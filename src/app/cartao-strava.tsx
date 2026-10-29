import { formatarDataHora } from "@/lib/formato";
import type { estadoStrava } from "@/lib/strava/estado";

type Estado = Awaited<ReturnType<typeof estadoStrava>>;

const MENSAGENS: Record<string, { texto: string; erro?: boolean }> = {
  ligado: { texto: "Strava ligado. A importar as atividades desde 01/01/2026; pode demorar algumas horas." },
  recusado: { texto: "A autorização foi recusada no Strava.", erro: true },
  sem_permissao: {
    texto: "É preciso autorizar o acesso a todas as atividades, incluindo as privadas. Tenta de novo e deixa as caixas marcadas.",
    erro: true,
  },
  sem_config: { texto: "Faltam STRAVA_CLIENT_ID e STRAVA_CLIENT_SECRET nas variáveis do servidor.", erro: true },
  erro_estado: { texto: "O pedido de ligação expirou. Tenta de novo.", erro: true },
  erro: { texto: "Não foi possível ligar ao Strava. Tenta de novo.", erro: true },
};

export function CartaoStrava({ estado, mensagem }: { estado: Estado; mensagem?: string }) {
  const m = mensagem ? MENSAGENS[mensagem] : undefined;
  const ligado = estado.athleteId !== null;

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-medium">Strava</h2>
        {estado.configurado && (
          <a
            href="/api/strava/ligar"
            className={
              ligado
                ? "text-sm text-zinc-600 underline dark:text-zinc-400"
                : "rounded-lg bg-orange-600 px-3 py-2 text-sm font-medium text-white hover:bg-orange-700"
            }
          >
            {ligado ? "Voltar a ligar" : "Ligar ao Strava"}
          </a>
        )}
      </div>

      {m && <p className={m.erro ? "text-sm text-red-600" : "text-sm text-green-700 dark:text-green-500"}>{m.texto}</p>}
      {estado.erro && <p className="text-sm text-red-600">{estado.erro}</p>}

      {!estado.configurado ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Faltam as variáveis STRAVA_CLIENT_ID e STRAVA_CLIENT_SECRET no servidor.
        </p>
      ) : !ligado ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Ainda não está ligado. Carrega em &quot;Ligar ao Strava&quot; e autoriza o acesso às atividades.
        </p>
      ) : (
        <ul className="flex flex-col gap-1 text-sm text-zinc-600 dark:text-zinc-400">
          <li>
            Atividades importadas: <strong>{estado.atividades}</strong> ({estado.comStreams} com streams)
            {estado.naFila ? ` · ${estado.naFila} na fila` : ""}
          </li>
          {estado.sincronizacao && (
            <li>
              Última {estado.sincronizacao.tipo === "backfill" ? "importação completa" : "verificação diária"}:{" "}
              {formatarDataHora(new Date(estado.sincronizacao.em))} · {estado.sincronizacao.listadas} no Strava,{" "}
              {estado.sincronizacao.enfileiradas} por importar
            </li>
          )}
          <li>
            Atualização automática:{" "}
            {estado.webhook?.ativo ? "ativa" : (estado.webhook?.motivo ?? "a configurar…")}
          </li>
          {estado.pausaAte && (
            <li>Em pausa por limite de pedidos do Strava até {formatarDataHora(estado.pausaAte)}.</li>
          )}
        </ul>
      )}
    </section>
  );
}
