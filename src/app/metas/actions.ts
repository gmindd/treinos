"use server";

import { gzipSync } from "node:zlib";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { meta, percurso } from "@/db/schema";
import { fila, FILAS } from "@/lib/fila";
import { dataIsoLisboa, lerDuracao } from "@/lib/formato";
import { lerGpx } from "@/lib/gpx";

export type EstadoMeta = { erro?: string; ok?: string };

const MAX_BYTES = 20 * 1024 * 1024;

async function pedirPrevisao() {
  await (await fila()).send(FILAS.previsao, {});
}

function lerData(texto: string): string | null | "invalida" {
  const t = texto.trim();
  if (!t) return null;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t) ?? /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (!m) return "invalida";
  const iso = m[0].includes("/") ? `${m[3]}-${m[2]}-${m[1]}` : t;
  return Number.isNaN(Date.parse(`${iso}T00:00:00Z`)) ? "invalida" : iso;
}

/** Nova meta BTT a partir de um GPX: guarda o ficheiro e o percurso e pede a previsão. */
export async function criarMetaGpx(_: EstadoMeta, form: FormData): Promise<EstadoMeta> {
  const ficheiro = form.get("ficheiro");
  if (!(ficheiro instanceof File) || ficheiro.size === 0) return { erro: "Escolhe um ficheiro GPX." };
  if (ficheiro.size > MAX_BYTES) return { erro: "O ficheiro tem mais de 20 MB." };
  const alvoS = lerDuracao(String(form.get("alvo") ?? ""));
  if (!alvoS) return { erro: "Tempo-alvo inválido: usa h:mm:ss (ex.: 2:00:00)." };
  const data = lerData(String(form.get("data") ?? ""));
  if (data === "invalida") return { erro: "Data inválida: usa dd/mm/aaaa." };

  const texto = Buffer.from(await ficheiro.arrayBuffer()).toString("utf8");
  const gpx = lerGpx(texto);
  if (gpx.pontos.length < 50 || gpx.distanciaM < 1000) {
    return { erro: "O ficheiro não tem um trilho GPX válido (são precisos pontos com latitude e longitude)." };
  }
  if (!gpx.pontos.some((p) => p.ele != null)) return { erro: "O GPX não tem altitude: sem ela não há declives." };

  const nome = String(form.get("nome") ?? "").trim() || gpx.nome || ficheiro.name.replace(/\.gpx$/i, "");
  const [p] = await db()
    .insert(percurso)
    .values({
      nome,
      origem: "gpx",
      ficheiroOriginal: gzipSync(Buffer.from(texto, "utf8")),
      pontos: gzipSync(JSON.stringify(gpx)),
      distanciaM: gpx.distanciaM,
      desnivelM: gpx.desnivelM,
    })
    .returning({ id: percurso.id });
  const [m] = await db()
    .insert(meta)
    .values({
      nome,
      tipo: "btt",
      dataProva: data ?? dataIsoLisboa(new Date()),
      distanciaM: gpx.distanciaM,
      percursoId: p.id,
      tempoAlvoS: alvoS,
      alvoEmMovimento: true,
      notas: `GPX ${ficheiro.name}${gpx.temTempo ? "" : " (sem horas: não há tempos de referência)"}${data ? "" : " · sem data de prova"}`,
    })
    .returning({ id: meta.id });
  await pedirPrevisao();
  revalidatePath("/");
  redirect(`/metas/${m.id}`);
}

/** Muda o nome, o tempo-alvo ou a data de uma meta. */
export async function atualizarMeta(_: EstadoMeta, form: FormData): Promise<EstadoMeta> {
  const id = Number(form.get("id"));
  const alvoS = lerDuracao(String(form.get("alvo") ?? ""));
  if (!Number.isInteger(id)) return { erro: "Meta inválida." };
  if (!alvoS) return { erro: "Tempo-alvo inválido: usa h:mm:ss (ex.: 2:00:00)." };
  const data = lerData(String(form.get("data") ?? ""));
  if (data === "invalida") return { erro: "Data inválida: usa dd/mm/aaaa." };
  const nome = String(form.get("nome") ?? "").trim();
  await db()
    .update(meta)
    .set({ tempoAlvoS: alvoS, ...(data ? { dataProva: data } : {}), ...(nome ? { nome } : {}), atualizadoEm: new Date() })
    .where(eq(meta.id, id));
  await pedirPrevisao();
  revalidatePath(`/metas/${id}`);
  revalidatePath("/");
  return { ok: "Guardado. A previsão é recalculada dentro de segundos." };
}

/** Metas de GPX são apagadas (com o percurso); as do seed só são desativadas, senão voltavam no deploy. */
export async function removerMeta(form: FormData) {
  const id = Number(form.get("id"));
  if (!Number.isInteger(id)) return;
  const [m] = await db().select().from(meta).where(eq(meta.id, id));
  if (!m) return;
  if (m.percursoId) {
    await db().delete(meta).where(eq(meta.id, id));
    await db().delete(percurso).where(eq(percurso.id, m.percursoId));
  } else {
    await db().update(meta).set({ ativa: false, atualizadoEm: new Date() }).where(eq(meta.id, id));
  }
  revalidatePath("/");
  redirect("/");
}
