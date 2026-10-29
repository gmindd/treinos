// Sincronização Strava → BD: importação de uma atividade, comparação com a lista do
// Strava (backfill e reconciliação) e subscrição do webhook.
import { and, eq, gte, inArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import { atividade, atividadeStream, melhorEsforco, parametroModelo } from "@/db/schema";
import { gravarEstado } from "@/lib/sistema";
import {
  apagarSubscricao,
  configStrava,
  criarSubscricao,
  listarSubscricoes,
  pedirApi,
} from "./api";
import { empacotarStreams, mapearAtividade, mapearMelhoresEsforcos } from "./mapear";
import {
  atividadeStrava,
  listaAtividadesStrava,
  streamsStrava,
  TIPOS_STREAMS,
  type AtividadeStrava,
} from "./tipos";

export const ESTADO_SINCRONIZACAO = "strava.sincronizacao";
export const ESTADO_WEBHOOK = "strava.webhook";

/** Início do treino estruturado: o backfill vai até aqui (brief §4). */
export const INICIO_BACKFILL = new Date("2026-01-01T00:00:00Z");

async function fraseCriancas(db: Db): Promise<string> {
  const [p] = await db
    .select({ valor: parametroModelo.valor })
    .from(parametroModelo)
    .where(eq(parametroModelo.chave, "btt.texto_com_criancas"));
  return typeof p?.valor === "string" ? p.valor : "com crianças";
}

export type ResultadoImportacao = "importada" | "apagada";

/**
 * Pede o detalhe ao Strava e grava a atividade (upsert por strava_id). Os streams só são
 * pedidos se ainda não existirem: são imutáveis. Um 404 marca a atividade como apagada.
 */
export async function importarAtividade(db: Db, stravaId: number): Promise<ResultadoImportacao> {
  const detalhe = await pedirApi(db, `/activities/${stravaId}`, atividadeStrava, {
    include_all_efforts: "false",
  });
  if (!detalhe) {
    await db
      .update(atividade)
      .set({ apagada: true, atualizadoEm: new Date() })
      .where(eq(atividade.stravaId, stravaId));
    return "apagada";
  }

  const linha = mapearAtividade(detalhe, await fraseCriancas(db));
  const [gravada] = await db
    .insert(atividade)
    .values({ ...linha, dadosOrigem: detalhe })
    .onConflictDoUpdate({
      target: atividade.stravaId,
      set: { ...linha, dadosOrigem: detalhe, apagada: false, atualizadoEm: new Date() },
    })
    .returning({ id: atividade.id, estadoStreams: atividade.estadoStreams });

  await db.transaction(async (tx) => {
    await tx.delete(melhorEsforco).where(eq(melhorEsforco.atividadeId, gravada.id));
    const esforcos = mapearMelhoresEsforcos(detalhe, gravada.id);
    if (esforcos.length) await tx.insert(melhorEsforco).values(esforcos);
  });

  if (gravada.estadoStreams === "pendente" || gravada.estadoStreams === "erro") {
    await importarStreams(db, gravada.id, detalhe);
  }
  return "importada";
}

async function importarStreams(db: Db, atividadeId: number, detalhe: AtividadeStrava) {
  const definir = (estadoStreams: "ok" | "sem_streams") =>
    db.update(atividade).set({ estadoStreams }).where(eq(atividade.id, atividadeId));

  if (detalhe.manual) return definir("sem_streams");
  const streams = await pedirApi(db, `/activities/${detalhe.id}/streams`, streamsStrava, {
    keys: TIPOS_STREAMS.join(","),
    key_by_type: "true",
  });
  const pacote = streams ? empacotarStreams(streams) : null;
  if (!pacote || pacote.nAmostras === 0) return definir("sem_streams");

  await db.insert(atividadeStream).values({ atividadeId, ...pacote }).onConflictDoNothing();
  return definir("ok");
}

type Local = {
  stravaId: number;
  nome: string;
  sportType: string | null;
  estadoStreams: string;
  apagada: boolean;
};

/**
 * Que atividades (re)importar, comparando a lista do Strava com a BD no mesmo período:
 * novas, sem streams, com título/tipo alterado (webhook perdido) ou que desapareceram
 * do Strava (o pedido do detalhe confirma se foram apagadas).
 */
export function escolherParaImportar(remotas: AtividadeStrava[], locais: Local[]): number[] {
  const porId = new Map(locais.map((l) => [l.stravaId, l]));
  const ids = new Set<number>();
  for (const r of remotas) {
    const l = porId.get(r.id);
    if (
      !l ||
      l.apagada ||
      l.estadoStreams === "pendente" ||
      l.estadoStreams === "erro" ||
      l.nome !== r.name ||
      l.sportType !== (r.sport_type ?? null)
    ) {
      ids.add(r.id);
    }
  }
  const remotasIds = new Set(remotas.map((r) => r.id));
  for (const l of locais) if (!l.apagada && !remotasIds.has(l.stravaId)) ids.add(l.stravaId);
  return [...ids];
}

async function listarDesde(db: Db, desde: Date): Promise<AtividadeStrava[]> {
  const todas: AtividadeStrava[] = [];
  for (let pagina = 1; ; pagina++) {
    const lote =
      (await pedirApi(db, "/athlete/activities", listaAtividadesStrava, {
        after: String(Math.floor(desde.getTime() / 1000)),
        per_page: "200",
        page: String(pagina),
      })) ?? [];
    todas.push(...lote);
    if (lote.length < 200) return todas;
  }
}

/** Lista as atividades do Strava desde `desde` e põe na fila as que faltam ou mudaram. */
export async function sincronizarDesde(
  db: Db,
  desde: Date,
  tipo: "backfill" | "reconciliacao",
  enfileirar: (stravaIds: number[]) => Promise<void>,
) {
  const remotas = await listarDesde(db, desde);
  const remotasIds = remotas.map((r) => r.id);
  const locais = await db
    .select({
      stravaId: atividade.stravaId,
      nome: atividade.nome,
      sportType: atividade.sportType,
      estadoStreams: atividade.estadoStreams,
      apagada: atividade.apagada,
    })
    .from(atividade)
    .where(and(eq(atividade.origem, "strava"), gte(atividade.inicio, desde)));
  // Atividades editadas para uma data anterior a `desde` também têm de ser comparadas.
  const foraDoPeriodo = remotasIds.length
    ? await db
        .select({
          stravaId: atividade.stravaId,
          nome: atividade.nome,
          sportType: atividade.sportType,
          estadoStreams: atividade.estadoStreams,
          apagada: atividade.apagada,
        })
        .from(atividade)
        .where(inArray(atividade.stravaId, remotasIds))
    : [];
  const vistas = new Map<number, Local>();
  for (const l of [...locais, ...foraDoPeriodo]) if (l.stravaId !== null) vistas.set(l.stravaId, l as Local);

  const ids = escolherParaImportar(remotas, [...vistas.values()]);
  await enfileirar(ids);
  await gravarEstado(db, ESTADO_SINCRONIZACAO, {
    tipo,
    desde: desde.toISOString(),
    listadas: remotas.length,
    enfileiradas: ids.length,
    em: new Date().toISOString(),
  });
  return { listadas: remotas.length, enfileiradas: ids.length };
}

export type EstadoWebhook = { ativo: boolean; id?: number; callbackUrl?: string; motivo?: string; em: string };

/** Garante uma (e uma só) subscrição do webhook a apontar para esta app. */
export async function garantirSubscricao(db: Db): Promise<EstadoWebhook> {
  const c = configStrava();
  const em = new Date().toISOString();
  let estado: EstadoWebhook;
  if (!c || !c.verifyToken) {
    estado = { ativo: false, motivo: "Faltam variáveis STRAVA_* no servidor", em };
  } else if (!c.appUrl.startsWith("https://")) {
    estado = { ativo: false, motivo: "Webhook só em produção (APP_URL com https)", em };
  } else {
    const callbackUrl = `${c.appUrl}/api/strava/webhook`;
    const existentes = await listarSubscricoes();
    const certa = existentes.find((s) => s.callback_url === callbackUrl);
    if (certa) {
      estado = { ativo: true, id: certa.id, callbackUrl, em };
    } else {
      for (const s of existentes) await apagarSubscricao(s.id);
      const nova = await criarSubscricao(callbackUrl, c.verifyToken);
      estado = { ativo: true, id: nova.id, callbackUrl, em };
    }
  }
  await gravarEstado(db, ESTADO_WEBHOOK, estado);
  return estado;
}
