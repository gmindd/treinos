"use client";

import { useActionState } from "react";
import { atualizarMeta, criarMetaCorrida, criarMetaGpx, removerMeta, type EstadoMeta } from "./actions";

function Mensagem({ estado }: { estado: EstadoMeta }) {
  if (estado.erro) return <p className="text-sm text-red-600">{estado.erro}</p>;
  if (estado.ok) return <p className="text-sm text-green-700 dark:text-green-500">{estado.ok}</p>;
  return null;
}

const campo = "rounded-lg border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700";
const botao = "rounded-lg bg-zinc-900 px-3 py-2 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900";

export function NovaMetaGpx() {
  const [estado, acao, pendente] = useActionState(criarMetaGpx, {});
  return (
    <form action={acao} className="flex flex-col gap-3 text-sm">
      <fieldset className="flex gap-4">
        <label className="flex items-center gap-1">
          <input type="radio" name="modalidade" value="btt" defaultChecked /> BTT
        </label>
        <label className="flex items-center gap-1">
          <input type="radio" name="modalidade" value="corrida" /> Corrida
        </label>
      </fieldset>
      <label className="flex flex-col gap-1">
        Ficheiro GPX (atividade ou percurso)
        <input type="file" name="ficheiro" accept=".gpx,application/gpx+xml" required className={campo} />
      </label>
      <label className="flex flex-col gap-1">
        Nome (opcional; senão o do ficheiro)
        <input name="nome" className={campo} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          Tempo-alvo
          <input name="alvo" placeholder="2:00:00 (corrida: 55:00)" required inputMode="numeric" className={campo} />
        </label>
        <label className="flex flex-col gap-1">
          Data da prova (opcional)
          <input name="data" placeholder="dd/mm/aaaa" inputMode="numeric" className={campo} />
        </label>
      </div>
      <button disabled={pendente} className={botao}>
        {pendente ? "A carregar…" : "Carregar e prever"}
      </button>
      <Mensagem estado={estado} />
    </form>
  );
}

export function NovaMetaCorrida() {
  const [estado, acao, pendente] = useActionState(criarMetaCorrida, {});
  return (
    <form action={acao} className="flex flex-col gap-3 text-sm">
      <label className="flex flex-col gap-1">
        Nome (opcional)
        <input name="nome" placeholder="ex.: Corrida das Fogueiras" className={campo} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          Distância (km)
          <input name="distancia" placeholder="10" required inputMode="decimal" className={campo} />
        </label>
        <label className="flex flex-col gap-1">
          D+ (m; vazio = 10 m/km)
          <input name="desnivel" placeholder="ex.: 50" inputMode="numeric" className={campo} />
        </label>
        <label className="flex flex-col gap-1">
          Tempo-alvo
          <input name="alvo" placeholder="55:00 ou 1:05:00" required inputMode="numeric" className={campo} />
        </label>
        <label className="flex flex-col gap-1">
          Data da prova (opcional)
          <input name="data" placeholder="dd/mm/aaaa" inputMode="numeric" className={campo} />
        </label>
      </div>
      <button disabled={pendente} className={botao}>
        {pendente ? "A guardar…" : "Criar e prever"}
      </button>
      <Mensagem estado={estado} />
    </form>
  );
}

export function EditarMeta({
  id,
  nome,
  alvo,
  data,
  distanciaKm,
  desnivelM,
}: {
  id: number;
  nome: string;
  alvo: string;
  data: string;
  /** Só nas metas de corrida sem GPX. */
  distanciaKm?: string;
  desnivelM?: string;
}) {
  const [estado, acao, pendente] = useActionState(atualizarMeta, {});
  return (
    <form action={acao} className="flex flex-col gap-2 text-sm">
      <input type="hidden" name="id" value={id} />
      <label className="flex flex-col gap-1">
        Nome
        <input name="nome" defaultValue={nome} className={campo} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          Tempo-alvo
          <input name="alvo" defaultValue={alvo} required className={campo} />
        </label>
        <label className="flex flex-col gap-1">
          Data da prova
          <input name="data" defaultValue={data} placeholder="dd/mm/aaaa" className={campo} />
        </label>
        {distanciaKm != null && (
          <>
            <label className="flex flex-col gap-1">
              Distância (km)
              <input name="distancia" defaultValue={distanciaKm} inputMode="decimal" className={campo} />
            </label>
            <label className="flex flex-col gap-1">
              D+ (m; vazio = 10 m/km)
              <input name="desnivel" defaultValue={desnivelM} inputMode="numeric" className={campo} />
            </label>
          </>
        )}
      </div>
      <button disabled={pendente} className={botao}>
        {pendente ? "A guardar…" : "Guardar"}
      </button>
      <Mensagem estado={estado} />
    </form>
  );
}

/** Apagar (metas criadas na app) ou retirar do painel (as do seed), com confirmação. */
export function BotaoApagar({ id, nome, apagar }: { id: number; nome: string; apagar: boolean }) {
  return (
    <form
      action={removerMeta}
      onSubmit={(e) => {
        if (!confirm(`${apagar ? "Apagar" : "Retirar do painel"} "${nome}"?`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button className="text-sm text-red-700 underline dark:text-red-400">{apagar ? "Apagar" : "Retirar"}</button>
    </form>
  );
}
