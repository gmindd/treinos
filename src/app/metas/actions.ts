"use server";

import { gzipSync } from "node:zlib";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { meta, percurso } from "@/db/schema";
import { fila, FILAS } from "@/lib/fila";
import { dataIsoLisboa, lerDuracao, lerNumero } from "@/lib/formato";
import { lerGpx } from "@/lib/gpx";
import { metaDoSeed } from "@/db/seed-dados";

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

/** BTT: "1:55" é h:mm (tempo em movimento); corrida: "55:30" é mm:ss (tempo oficial). */
function lerAlvo(form: FormData, tipo: "btt" | "corrida") {
  return lerDuracao(String(form.get("alvo") ?? ""), tipo === "corrida" ? "mm:ss" : "h:mm");
}

const ERRO_ALVO = "Tempo-alvo inválido: usa h:mm:ss (ex.: 2:00:00) ou, na corrida, mm:ss (ex.: 55:00).";

/** D+ por omissão nas metas de corrida sem valor: 10 m por km. */
const DESNIVEL_POR_KM_OMISSAO = 10;

/** Nova meta de corrida sem GPX: distância, D+ (vazio = 10 m/km), tempo-alvo e data. */
export async function criarMetaCorrida(_: EstadoMeta, form: FormData): Promise<EstadoMeta> {
  const km = lerNumero(String(form.get("distancia") ?? ""));
  if (km == null || km <= 0 || km > 300) return { erro: "Distância inválida (em km, ex.: 10 ou 21,1)." };
  const textoDesnivel = String(form.get("desnivel") ?? "").trim();
  const desnivel = textoDesnivel ? lerNumero(textoDesnivel) : km * DESNIVEL_POR_KM_OMISSAO;
  if (desnivel == null || desnivel < 0) return { erro: "D+ inválido (em metros, ex.: 50)." };
  const alvoS = lerAlvo(form, "corrida");
  if (!alvoS) return { erro: ERRO_ALVO };
  const data = lerData(String(form.get("data") ?? ""));
  if (data === "invalida") return { erro: "Data inválida: usa dd/mm/aaaa." };
  const nome = String(form.get("nome") ?? "").trim() || `Corrida ${String(km).replace(".", ",")} km`;
  const [m] = await db()
    .insert(meta)
    .values({
      nome,
      tipo: "corrida",
      dataProva: data ?? dataIsoLisboa(new Date()),
      distanciaM: km * 1000,
      desnivelM: desnivel,
      tempoAlvoS: alvoS,
      alvoEmMovimento: false,
      notas: `Meta manual${textoDesnivel ? "" : ` (D+ por omissão: ${DESNIVEL_POR_KM_OMISSAO} m/km)`}${data ? "" : " · sem data de prova"}`,
    })
    .returning({ id: meta.id });
  await pedirPrevisao();
  revalidatePath("/");
  redirect(`/metas/${m.id}`);
}

/** Nova meta (BTT ou corrida) a partir de um GPX: guarda o ficheiro e o percurso e pede a previsão. */
export async function criarMetaGpx(_: EstadoMeta, form: FormData): Promise<EstadoMeta> {
  const tipo = form.get("modalidade") === "corrida" ? "corrida" : "btt";
  const ficheiro = form.get("ficheiro");
  if (!(ficheiro instanceof File) || ficheiro.size === 0) return { erro: "Escolhe um ficheiro GPX." };
  if (ficheiro.size > MAX_BYTES) return { erro: "O ficheiro tem mais de 20 MB." };
  const alvoS = lerAlvo(form, tipo);
  if (!alvoS) return { erro: ERRO_ALVO };
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
      tipo,
      dataProva: data ?? dataIsoLisboa(new Date()),
      distanciaM: gpx.distanciaM,
      desnivelM: gpx.desnivelM,
      percursoId: p.id,
      tempoAlvoS: alvoS,
      alvoEmMovimento: tipo === "btt",
      notas: `GPX ${ficheiro.name}${gpx.temTempo ? "" : " (sem horas: não há tempos de referência)"}${data ? "" : " · sem data de prova"}`,
    })
    .returning({ id: meta.id });
  await pedirPrevisao();
  revalidatePath("/");
  redirect(`/metas/${m.id}`);
}

/** Muda o nome, o tempo-alvo ou a data de uma meta (e, na corrida sem GPX, a distância e o D+). */
export async function atualizarMeta(_: EstadoMeta, form: FormData): Promise<EstadoMeta> {
  const id = Number(form.get("id"));
  if (!Number.isInteger(id)) return { erro: "Meta inválida." };
  const [atual] = await db().select().from(meta).where(eq(meta.id, id));
  if (!atual) return { erro: "Meta inválida." };
  const alvoS = lerAlvo(form, atual.tipo);
  if (!alvoS) return { erro: ERRO_ALVO };
  const data = lerData(String(form.get("data") ?? ""));
  if (data === "invalida") return { erro: "Data inválida: usa dd/mm/aaaa." };
  const nome = String(form.get("nome") ?? "").trim();
  const extra: { distanciaM?: number; desnivelM?: number } = {};
  if (atual.tipo === "corrida" && !atual.percursoId && form.has("distancia")) {
    const km = lerNumero(String(form.get("distancia") ?? ""));
    if (km == null || km <= 0 || km > 300) return { erro: "Distância inválida (em km)." };
    const textoDesnivel = String(form.get("desnivel") ?? "").trim();
    const desnivel = textoDesnivel ? lerNumero(textoDesnivel) : km * DESNIVEL_POR_KM_OMISSAO;
    if (desnivel == null || desnivel < 0) return { erro: "D+ inválido (em metros)." };
    extra.distanciaM = km * 1000;
    extra.desnivelM = desnivel;
  }
  await db()
    .update(meta)
    .set({ tempoAlvoS: alvoS, ...extra, ...(data ? { dataProva: data } : {}), ...(nome ? { nome } : {}), atualizadoEm: new Date() })
    .where(eq(meta.id, id));
  await pedirPrevisao();
  revalidatePath(`/metas/${id}`);
  revalidatePath("/");
  return { ok: "Guardado. A previsão é recalculada dentro de segundos." };
}

/** As metas criadas na app são apagadas (com o GPX); as do seed só saem do painel, senão voltavam no deploy. */
export async function removerMeta(form: FormData) {
  const id = Number(form.get("id"));
  if (!Number.isInteger(id)) return;
  const [m] = await db().select().from(meta).where(eq(meta.id, id));
  if (!m) return;
  if (!metaDoSeed(m.nome)) {
    await db().delete(meta).where(eq(meta.id, id));
    if (m.percursoId) await db().delete(percurso).where(eq(percurso.id, m.percursoId));
  } else {
    await db().update(meta).set({ ativa: false, atualizadoEm: new Date() }).where(eq(meta.id, id));
  }
  revalidatePath("/");
  redirect("/");
}

/** Guarda os limites dos setores (metros) escolhidos no gráfico; lista vazia = automáticos. */
export async function guardarSetores(id: number, limites: number[]): Promise<EstadoMeta> {
  if (!Number.isInteger(id)) return { erro: "Meta inválida." };
  const validos = limites.filter((x) => Number.isFinite(x) && x > 0 && x < 1_000_000).map((x) => Math.round(x));
  if (validos.length > 200) return { erro: "Demasiados setores." };
  await db()
    .update(meta)
    .set({ limitesSetores: validos.length ? [...new Set(validos)].sort((a, b) => a - b) : null, atualizadoEm: new Date() })
    .where(eq(meta.id, id));
  revalidatePath(`/metas/${id}`);
  return { ok: validos.length ? "Setores guardados." : "Setores automáticos repostos." };
}
