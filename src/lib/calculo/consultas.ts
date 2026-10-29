// Leituras para a UI: carga diária e agregados por semana.
import { asc, desc, eq, gte, type SQL } from "drizzle-orm";
import type { Db } from "@/db/client";
import { atividade, atividadeMetricas, cargaDiaria } from "@/db/schema";
import { dataIsoLisboa } from "@/lib/formato";

function menosDias(iso: string, dias: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

/** Segunda-feira da semana de uma data ISO. */
export function inicioSemana(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  return menosDias(iso, (d.getUTCDay() + 6) % 7);
}

export async function cargaRecente(db: Db, dias = 112) {
  const desde = menosDias(dataIsoLisboa(new Date()), dias - 1);
  return db.select().from(cargaDiaria).where(gte(cargaDiaria.data, desde)).orderBy(asc(cargaDiaria.data));
}

/** TSS e horas por semana e modalidade (ténis, força e outros juntos em "outros"). */
export function agruparSemanas(linhas: (typeof cargaDiaria.$inferSelect)[], semanas = 12) {
  const hoje = dataIsoLisboa(new Date());
  const primeira = menosDias(inicioSemana(hoje), (semanas - 1) * 7);
  const mapa = new Map<string, { tss: Record<string, number>; horas: Record<string, number> }>();
  for (let i = 0; i < semanas; i++) {
    const d = new Date(`${primeira}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i * 7);
    mapa.set(d.toISOString().slice(0, 10), { tss: {}, horas: {} });
  }
  const grupo = (m: string) => (m === "corrida" || m === "zwift" || m === "btt" ? m : "outros");
  for (const l of linhas) {
    const s = mapa.get(inicioSemana(l.data));
    if (!s) continue;
    for (const [m, v] of Object.entries(l.tssPorModalidade as Record<string, number>)) {
      s.tss[grupo(m)] = (s.tss[grupo(m)] ?? 0) + v;
    }
    for (const [m, v] of Object.entries(l.horasPorModalidade as Record<string, number>)) {
      s.horas[grupo(m)] = (s.horas[grupo(m)] ?? 0) + v;
    }
  }
  return [...mapa.entries()].map(([inicio, v]) => ({ inicio, ...v }));
}

/** Atividades mais recentes com as métricas (se já calculadas). */
export async function atividadesComMetricas(
  db: Db,
  limite: number,
  offset = 0,
  filtro: SQL | undefined = eq(atividade.apagada, false),
) {
  return db
    .select({ a: atividade, m: atividadeMetricas })
    .from(atividade)
    .leftJoin(atividadeMetricas, eq(atividadeMetricas.atividadeId, atividade.id))
    .where(filtro)
    .orderBy(desc(atividade.inicio))
    .limit(limite)
    .offset(offset);
}
