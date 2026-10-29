"use client";

import { useActionState } from "react";
import { guardarConstante, guardarParametro, type EstadoForm } from "./actions";

const CHAVES = [
  ["ftp_w", "FTP (W)"],
  ["lthr", "LTHR (bpm)"],
  ["fc_max", "FC máxima (bpm)"],
  ["fc_repouso", "FC de repouso (bpm)"],
  ["zonas_fc", "Zonas de FC (limites de Z1-Z4)"],
  ["fc_teto_facil", "Teto de FC em fácil (bpm)"],
  ["peso_kg", "Peso (kg)"],
  ["massa_bike_kg", "Massa da bike (kg)"],
  ["massa_equipamento_kg", "Massa do equipamento (kg)"],
  ["ctl_semente", "Semente do CTL (alinhar com o intervals.icu)"],
  ["atl_semente", "Semente do ATL (alinhar com o intervals.icu)"],
] as const;

function Mensagem({ estado }: { estado: EstadoForm }) {
  if (estado.erro) return <p className="text-sm text-red-600">{estado.erro}</p>;
  if (estado.ok) return <p className="text-sm text-green-700 dark:text-green-500">{estado.ok}</p>;
  return null;
}

const campo = "rounded-lg border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700";

export function NovaConstante({ hoje }: { hoje: string }) {
  const [estado, acao, pendente] = useActionState(guardarConstante, {});
  return (
    <form action={acao} className="flex flex-col gap-2 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
      <h3 className="font-medium">Novo valor</h3>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <label className="col-span-2 flex flex-col gap-1">
          Constante
          <select name="chave" className={campo}>
            {CHAVES.map(([c, r]) => (
              <option key={c} value={c}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Válido desde
          <input type="date" name="data" defaultValue={hoje} required className={campo} />
        </label>
        <label className="flex flex-col gap-1">
          Valor
          <input name="valor" required inputMode="decimal" className={campo} />
        </label>
        <label className="col-span-2 flex flex-col gap-1">
          Nota (opcional)
          <input name="nota" className={campo} />
        </label>
      </div>
      <button
        type="submit"
        disabled={pendente}
        className="self-start rounded-lg bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
      >
        Guardar
      </button>
      <Mensagem estado={estado} />
    </form>
  );
}

export function EditarParametro({ chave, valor }: { chave: string; valor: string }) {
  const [estado, acao, pendente] = useActionState(guardarParametro, {});
  return (
    <form action={acao} className="flex flex-col gap-1">
      <input type="hidden" name="chave" value={chave} />
      <div className="flex gap-2">
        <input name="valor" defaultValue={valor} className={`${campo} w-full font-mono text-sm`} />
        <button type="submit" disabled={pendente} className="text-sm underline disabled:opacity-50">
          Guardar
        </button>
        <button type="submit" name="repor" value="1" disabled={pendente} className="text-sm text-zinc-500 underline">
          Repor
        </button>
      </div>
      <Mensagem estado={estado} />
    </form>
  );
}
