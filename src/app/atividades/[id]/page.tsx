import { connection } from "next/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { atividade, atividadeMetricas, cargaDiaria, melhorEsforco } from "@/db/schema";
import { formatarData, formatarDataHora, formatarDistancia, formatarDuracao, formatarNumero } from "@/lib/formato";
import { ROTULO_MODALIDADE } from "../../atividade-linha";

export const metadata = { title: "Atividade · Treino 26/27" };

const METODO: Record<string, string> = {
  potencia: "Potência (NP e IF com o FTP da data)",
  rTSS: "Corrida: ritmo ajustado ao declive (GAP) face ao ritmo de limiar",
  hrTSS: "Frequência cardíaca (TRIMP normalizado: 1 h ao LTHR = 100)",
  estimado_hora: "Sem FC nem potência: TSS fixo por hora (parâmetro)",
};

function Linha({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-zinc-100 py-1 text-sm dark:border-zinc-900">
      <dt className="text-zinc-600 dark:text-zinc-400">{rotulo}</dt>
      <dd className="text-right font-medium">{valor}</dd>
    </div>
  );
}

const ritmo = (v: number) => {
  const s = 1000 / v;
  return `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}/km`;
};

type Detalhes = {
  constantes?: { fcRepouso: number; fcMax: number; lthr: number; ftp: number | null };
  hrTss?: number | null;
  np?: number;
  vNormalizada?: number | null;
  limiar?: { v: number | null; porFc: number | null; porEsforcos: number | null };
  trimpAproximado?: string;
  tssHora?: number;
  zwift?: {
    relacao: null | {
      fc150W: { valor: number; extrapolado: boolean };
      fc200W: { valor: number; extrapolado: boolean };
      w150bpm: { valor: number; extrapolado: boolean };
      r2: number;
      n: number;
    };
    ef: number | null;
    desacoplamento: number | null;
    curva: Record<string, number | null>;
  };
};

export default async function PaginaAtividade({ params }: PageProps<"/atividades/[id]">) {
  await connection();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [linha] = await db()
    .select({ a: atividade, m: atividadeMetricas })
    .from(atividade)
    .leftJoin(atividadeMetricas, eq(atividadeMetricas.atividadeId, atividade.id))
    .where(eq(atividade.id, id));
  if (!linha) notFound();
  const { a, m } = linha;
  const [dia] = await db().select().from(cargaDiaria).where(eq(cargaDiaria.data, a.dataLocal));
  const esforcos = await db().select().from(melhorEsforco).where(eq(melhorEsforco.atividadeId, a.id));
  const d = (m?.detalhes ?? {}) as Detalhes;
  const zonas = (m?.tempoZonasS ?? null) as number[] | null;
  const totalZonas = zonas?.reduce((s, z) => s + z, 0) ?? 0;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-1">
        <Link href="/atividades" className="text-sm text-zinc-600 underline dark:text-zinc-400">
          ← Atividades
        </Link>
        <h1 className="text-2xl font-semibold">{a.nome}</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {ROTULO_MODALIDADE[a.modalidade]} · {formatarDataHora(a.inicio)} ·{" "}
          <a href={`https://www.strava.com/activities/${a.stravaId}`} target="_blank" rel="noreferrer" className="underline">
            Ver no Strava
          </a>
        </p>
      </header>

      <section>
        <h2 className="mb-2 text-lg font-medium">Resumo</h2>
        <dl>
          <Linha rotulo="Tempo em movimento" valor={formatarDuracao(a.duracaoMovimentoS)} />
          {a.distanciaM ? <Linha rotulo="Distância" valor={formatarDistancia(a.distanciaM)} /> : null}
          {a.desnivelM ? <Linha rotulo="Desnível" valor={`${Math.round(a.desnivelM)} m`} /> : null}
          {a.fcMedia ? <Linha rotulo="FC média / máx." valor={`${Math.round(a.fcMedia)} / ${Math.round(a.fcMax ?? 0)} bpm`} /> : null}
          {a.potenciaMedia ? <Linha rotulo="Potência média" valor={`${Math.round(a.potenciaMedia)} W`} /> : null}
          {a.relativeEffort != null ? <Linha rotulo="Relative Effort (Strava)" valor={a.relativeEffort} /> : null}
          {a.comCriancas ? <Linha rotulo="Com crianças" valor="sim" /> : null}
        </dl>
      </section>

      {m ? (
        <section>
          <h2 className="mb-2 text-lg font-medium">Esforço</h2>
          <p className="mb-2 text-3xl font-semibold">
            {formatarNumero(m.esforco010, 1)}
            <span className="text-base font-normal text-zinc-500">/10 · {Math.round(m.tss ?? 0)} TSS</span>
          </p>
          <dl>
            <Linha rotulo="Método" valor={METODO[m.metodoTss ?? ""] ?? m.metodoTss} />
            {m.intensidade != null && <Linha rotulo="Intensidade (IF)" valor={formatarNumero(m.intensidade, 2)} />}
            {d.np != null && <Linha rotulo="Potência normalizada" valor={`${Math.round(d.np)} W`} />}
            {d.constantes?.ftp != null && m.metodoTss === "potencia" && (
              <Linha rotulo="FTP usado (na data)" valor={`${d.constantes.ftp} W`} />
            )}
            {d.vNormalizada != null && <Linha rotulo="Ritmo GAP normalizado" valor={ritmo(d.vNormalizada)} />}
            {d.limiar?.v != null && (
              <Linha
                rotulo="Ritmo de limiar estimado"
                valor={`${ritmo(d.limiar.v)} (FC: ${d.limiar.porFc ? ritmo(d.limiar.porFc) : "—"}; esforços: ${
                  d.limiar.porEsforcos ? ritmo(d.limiar.porEsforcos) : "—"
                })`}
              />
            )}
            {m.trimp != null && <Linha rotulo="TRIMP" valor={Math.round(m.trimp)} />}
            {d.hrTss != null && m.metodoTss !== "hrTSS" && (
              <Linha rotulo="hrTSS (comparação)" valor={Math.round(d.hrTss)} />
            )}
            {d.trimpAproximado && <Linha rotulo="Nota" valor={d.trimpAproximado} />}
            {d.constantes && (
              <Linha
                rotulo="Constantes usadas"
                valor={`FC rep. ${d.constantes.fcRepouso} · FC máx. ${d.constantes.fcMax} · LTHR ${d.constantes.lthr}`}
              />
            )}
            {dia && (
              <Linha
                rotulo="Carga no fim do dia"
                valor={`CTL ${Math.round(dia.ctl)} · ATL ${Math.round(dia.atl)} · TSB ${Math.round(dia.tsb)}`}
              />
            )}
          </dl>
        </section>
      ) : (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Métricas ainda não calculadas.</p>
      )}

      {zonas && totalZonas > 0 && (
        <section>
          <h2 className="mb-2 text-lg font-medium">Tempo por zona de FC</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {zonas.map((z, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="w-6">Z{i + 1}</span>
                <span className="h-3 rounded bg-sky-600" style={{ width: `${(z / totalZonas) * 70}%` }} />
                <span className="text-zinc-600 dark:text-zinc-400">
                  {formatarDuracao(z)} ({Math.round((z / totalZonas) * 100)}%)
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {d.zwift && (
        <section>
          <h2 className="mb-2 text-lg font-medium">Zwift</h2>
          <dl>
            {d.zwift.relacao ? (
              <>
                <Linha
                  rotulo="FC a 150 / 200 W"
                  valor={`${Math.round(d.zwift.relacao.fc150W.valor)}${d.zwift.relacao.fc150W.extrapolado ? "*" : ""} / ${Math.round(
                    d.zwift.relacao.fc200W.valor,
                  )}${d.zwift.relacao.fc200W.extrapolado ? "*" : ""} bpm`}
                />
                <Linha
                  rotulo="W a 150 bpm"
                  valor={`${Math.round(d.zwift.relacao.w150bpm.valor)}${d.zwift.relacao.w150bpm.extrapolado ? "*" : ""} W`}
                />
                <Linha rotulo="Janelas estáveis / R²" valor={`${d.zwift.relacao.n} / ${formatarNumero(d.zwift.relacao.r2, 2)}`} />
              </>
            ) : (
              <Linha rotulo="Relação FC/W" valor="sem janelas estáveis suficientes" />
            )}
            {d.zwift.ef != null && <Linha rotulo="EF (NP / FC média)" valor={formatarNumero(d.zwift.ef, 2)} />}
            {d.zwift.desacoplamento != null && (
              <Linha rotulo="Desacoplamento Pa:HR" valor={`${formatarNumero(d.zwift.desacoplamento * 100, 1)}%`} />
            )}
            <Linha
              rotulo="Melhores potências"
              valor={[60, 300, 1200]
                .map((t) => d.zwift!.curva[t])
                .map((p, i) => `${["1 min", "5 min", "20 min"][i]} ${p != null ? Math.round(p) : "—"}`)
                .join(" · ")}
            />
          </dl>
          {d.zwift.relacao && <p className="mt-1 text-xs text-zinc-500">* fora da gama de potências desta sessão (extrapolado)</p>}
        </section>
      )}

      {esforcos.length > 0 && (
        <section>
          <h2 className="mb-2 text-lg font-medium">Melhores esforços (Strava)</h2>
          <dl>
            {esforcos.map((e) => (
              <Linha key={e.id} rotulo={e.nome} valor={formatarDuracao(e.tempoS)} />
            ))}
          </dl>
        </section>
      )}

      <p className="text-xs text-zinc-500">Data: {formatarData(a.dataLocal)}</p>
    </main>
  );
}
