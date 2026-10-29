import { connection } from "next/server";
import Link from "next/link";
import { and, asc, eq, gte } from "drizzle-orm";
import { db } from "@/db/client";
import { atividade, atividadeMetricas, cargaDiaria } from "@/db/schema";
import { inicioSemana } from "@/lib/calculo/consultas";
import { cpWLinha, curvaMaxima, tendencia, type Veredicto } from "@/lib/analysis/zwift";
import { dataIsoLisboa, formatarData, formatarDuracao, formatarNumero } from "@/lib/formato";
import { Sparkline } from "../graficos";

export const metadata = { title: "Análise Zwift · Treino 26/27" };

type Valor = { valor: number; extrapolado: boolean };
type DetalhesZwift = {
  np?: number;
  constantes?: { ftp: number | null };
  zwift?: {
    curva: Record<string, number | null>;
    relacao: null | { fc150W: Valor; fc180W: Valor; fc200W: Valor; w150bpm: Valor; w160bpm: Valor; n: number };
    ef: number | null;
    z2: boolean;
    desacoplamento: number | null;
    tempoAcimaFtp: Record<string, number>;
    blocoMaisLongo88: number;
    hora: string;
    temperatura: number | null;
  };
};

const COR_VEREDICTO: Record<Veredicto, string> = {
  melhorou: "text-green-700 dark:text-green-500",
  piorou: "text-red-600",
  inconclusivo: "text-zinc-500",
};

function menosDias(iso: string, dias: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

const DURACOES: [number, string][] = [
  [5, "5 s"],
  [60, "1 min"],
  [300, "5 min"],
  [1200, "20 min"],
  [3600, "60 min"],
];

export default async function PaginaZwift() {
  await connection();
  const hoje = dataIsoLisboa(new Date());
  const linhas = await db()
    .select({ a: atividade, m: atividadeMetricas })
    .from(atividade)
    .innerJoin(atividadeMetricas, eq(atividadeMetricas.atividadeId, atividade.id))
    .where(and(eq(atividade.modalidade, "zwift"), eq(atividade.apagada, false), eq(atividadeMetricas.metodoTss, "potencia")))
    .orderBy(asc(atividade.inicio));
  const tsbPorDia = new Map(
    (await db().select({ data: cargaDiaria.data, tsb: cargaDiaria.tsb }).from(cargaDiaria).where(gte(cargaDiaria.data, menosDias(hoje, 400)))).map(
      (c) => [c.data, c.tsb],
    ),
  );
  const sessoes = linhas
    .map(({ a, m }) => ({ a, m, d: (m.detalhes ?? {}) as DetalhesZwift }))
    .filter((s) => s.d.zwift);

  // Tendências nos últimos 90 dias (só valores dentro da gama observada em cada sessão).
  const desde90 = menosDias(hoje, 90);
  const recentes = sessoes.filter((s) => s.a.dataLocal >= desde90);
  const serie = (f: (s: (typeof sessoes)[number]) => number | null | undefined) =>
    recentes.flatMap((s) => {
      const v = f(s);
      return v != null && Number.isFinite(v) ? [{ data: s.a.dataLocal, valor: v }] : [];
    });
  const naGama = (v?: Valor) => (v && !v.extrapolado ? v.valor : null);
  const metricas = [
    { nome: "FC a 150 W", unidade: "bpm", maiorEMelhor: false, pontos: serie((s) => naGama(s.d.zwift?.relacao?.fc150W)) },
    { nome: "FC a 180 W", unidade: "bpm", maiorEMelhor: false, pontos: serie((s) => naGama(s.d.zwift?.relacao?.fc180W)) },
    { nome: "FC a 200 W", unidade: "bpm", maiorEMelhor: false, pontos: serie((s) => naGama(s.d.zwift?.relacao?.fc200W)) },
    { nome: "W a 150 bpm", unidade: "W", maiorEMelhor: true, pontos: serie((s) => naGama(s.d.zwift?.relacao?.w150bpm)) },
    { nome: "W a 160 bpm", unidade: "W", maiorEMelhor: true, pontos: serie((s) => naGama(s.d.zwift?.relacao?.w160bpm)) },
    { nome: "EF em sessões Z2", unidade: "W/bpm", maiorEMelhor: true, pontos: serie((s) => (s.d.zwift?.z2 ? s.d.zwift.ef : null)) },
    { nome: "Desacoplamento (≥ 60 min)", unidade: "%", maiorEMelhor: false, pontos: serie((s) => (s.d.zwift?.desacoplamento ?? null) != null ? s.d.zwift!.desacoplamento! * 100 : null) },
  ].map((x) => ({ ...x, t: tendencia(x.pontos, x.maiorEMelhor) }));

  // Curvas de potência: janelas de 30/90 dias contra o período anterior.
  const curvaEntre = (de: string, ate: string) =>
    curvaMaxima(sessoes.filter((s) => s.a.dataLocal > de && s.a.dataLocal <= ate).map((s) => s.d.zwift!.curva as Record<number, number | null>));
  const c30 = curvaEntre(menosDias(hoje, 30), hoje);
  const c30a = curvaEntre(menosDias(hoje, 60), menosDias(hoje, 30));
  const c90 = curvaEntre(menosDias(hoje, 90), hoje);
  const c90a = curvaEntre(menosDias(hoje, 180), menosDias(hoje, 90));
  const cp = cpWLinha(c90);

  // Tempo acumulado por semana acima de 88% e 95% do FTP (últimas 8 semanas).
  const semanas = new Map<string, { t88: number; t95: number; bloco: number }>();
  for (let i = 7; i >= 0; i--) semanas.set(menosDias(inicioSemana(hoje), i * 7), { t88: 0, t95: 0, bloco: 0 });
  for (const s of sessoes) {
    const w = semanas.get(inicioSemana(s.a.dataLocal));
    if (!w) continue;
    w.t88 += s.d.zwift!.tempoAcimaFtp["0.88"] ?? 0;
    w.t95 += s.d.zwift!.tempoAcimaFtp["0.95"] ?? 0;
    w.bloco = Math.max(w.bloco, s.d.zwift!.blocoMaisLongo88);
  }

  const fmt = formatarNumero;
  const delta = (a: number | null | undefined, b: number | null | undefined) =>
    a != null && b != null ? `${a >= b ? "+" : ""}${Math.round(a - b)}` : "";

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-8">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Análise Zwift</h1>
        <Link href="/" className="text-sm text-zinc-600 underline dark:text-zinc-400">
          Painel
        </Link>
      </header>

      {sessoes.length === 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Ainda não há sessões do Zwift com potência calculadas.</p>
      ) : (
        <>
          <section className="flex flex-col gap-2">
            <h2 className="text-lg font-medium">Evolução (últimos 90 dias)</h2>
            <p className="text-xs text-zinc-500">
              Declive por semana com intervalo de confiança de 95%. Só diz &quot;melhorou&quot; ou &quot;piorou&quot; se o
              intervalo não incluir zero.
            </p>
            <ul className="flex flex-col">
              {metricas.map((x) => (
                <li key={x.nome} className="flex items-center justify-between gap-2 border-b border-zinc-100 py-2 text-sm dark:border-zinc-900">
                  <div className="flex flex-col">
                    <span className="font-medium">{x.nome}</span>
                    <span className="text-xs text-zinc-500">
                      {x.pontos.length} sessões
                      {x.t.declivePorSemana != null &&
                        ` · ${x.t.declivePorSemana >= 0 ? "+" : ""}${formatarNumero(x.t.declivePorSemana, 2)} ${x.unidade}/semana`}
                      {x.t.ic95 && ` (IC ${formatarNumero(x.t.ic95[0], 2)} a ${formatarNumero(x.t.ic95[1], 2)})`}
                    </span>
                  </div>
                  <Sparkline valores={x.t.medianaMovel.map((p) => p.valor)} />
                  <span className={`w-24 text-right font-medium ${COR_VEREDICTO[x.t.veredicto]}`}>{x.t.veredicto}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-lg font-medium">Potência média máxima</h2>
            <p className="text-xs text-zinc-500">
              Em ERG a potência é imposta: esta curva é a observada, não a máxima (exceto em testes).
            </p>
            <table className="w-full text-sm">
              <thead className="text-xs text-zinc-500">
                <tr>
                  <th className="text-left font-normal">Duração</th>
                  <th className="text-right font-normal">30 dias</th>
                  <th className="text-right font-normal">30 ant.</th>
                  <th className="text-right font-normal">90 dias</th>
                  <th className="text-right font-normal">90 ant.</th>
                </tr>
              </thead>
              <tbody>
                {DURACOES.map(([t, r]) => (
                  <tr key={t} className="border-b border-zinc-100 dark:border-zinc-900">
                    <td className="py-1">{r}</td>
                    <td className="text-right font-medium">
                      {fmt(c30[t])} <span className="text-xs text-zinc-500">{delta(c30[t], c30a[t])}</span>
                    </td>
                    <td className="text-right text-zinc-500">{fmt(c30a[t])}</td>
                    <td className="text-right font-medium">
                      {fmt(c90[t])} <span className="text-xs text-zinc-500">{delta(c90[t], c90a[t])}</span>
                    </td>
                    <td className="text-right text-zinc-500">{fmt(c90a[t])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-sm">
              CP / W&apos; (90 dias, modelo de 2 parâmetros sobre 3-20 min):{" "}
              {cp ? (
                <strong>
                  {Math.round(cp.cp)} W / {formatarNumero(cp.wLinha / 1000, 1)} kJ
                </strong>
              ) : (
                "dados insuficientes"
              )}
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-lg font-medium">Tempo perto do FTP por semana</h2>
            <table className="w-full text-sm">
              <thead className="text-xs text-zinc-500">
                <tr>
                  <th className="text-left font-normal">Semana</th>
                  <th className="text-right font-normal">≥ 88% FTP</th>
                  <th className="text-right font-normal">≥ 95% FTP</th>
                  <th className="text-right font-normal">Bloco mais longo ≥ 88%</th>
                </tr>
              </thead>
              <tbody>
                {[...semanas.entries()].map(([s, v]) => (
                  <tr key={s} className="border-b border-zinc-100 dark:border-zinc-900">
                    <td className="py-1">{formatarData(s)}</td>
                    <td className="text-right">{formatarDuracao(v.t88)}</td>
                    <td className="text-right">{formatarDuracao(v.t95)}</td>
                    <td className="text-right">{formatarDuracao(v.bloco)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-lg font-medium">Sessões</h2>
            <ul className="flex flex-col gap-2">
              {[...sessoes].reverse().slice(0, 30).map(({ a, m, d }) => {
                const r = d.zwift!.relacao;
                const tsb = tsbPorDia.get(a.dataLocal);
                return (
                  <li key={a.id} className="rounded-xl border border-zinc-200 p-3 text-sm dark:border-zinc-800">
                    <div className="flex items-baseline justify-between gap-2">
                      <Link href={`/atividades/${a.id}`} className="truncate font-medium hover:underline">
                        {a.nome}
                      </Link>
                      <span className="shrink-0 text-xs text-zinc-500">{formatarData(a.dataLocal)}</span>
                    </div>
                    <p className="text-zinc-600 dark:text-zinc-400">
                      NP {fmt(d.np)} W · IF {fmt(m.intensidade, 2)} · {Math.round(m.tss ?? 0)} TSS
                      {r && ` · FC@150W ${fmt(r.fc150W.valor)}${r.fc150W.extrapolado ? "*" : ""} · W@150bpm ${fmt(r.w150bpm.valor)}${r.w150bpm.extrapolado ? "*" : ""}`}
                      {d.zwift!.ef != null && ` · EF ${formatarNumero(d.zwift!.ef, 2)}`}
                      {d.zwift!.desacoplamento != null && ` · Pa:HR ${formatarNumero(d.zwift!.desacoplamento * 100, 1)}%`}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {d.zwift!.hora}
                      {tsb != null && ` · TSB do dia ${Math.round(tsb)}`}
                      {d.zwift!.temperatura != null && ` · ${Math.round(d.zwift!.temperatura)} °C`}
                    </p>
                  </li>
                );
              })}
            </ul>
            <p className="text-xs text-zinc-500">* extrapolado (fora das potências dessa sessão)</p>
          </section>
        </>
      )}
    </main>
  );
}
