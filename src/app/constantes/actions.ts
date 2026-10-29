"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { constante, parametroModelo } from "@/db/schema";
import { fila, FILAS } from "@/lib/fila";

export type EstadoForm = { erro?: string; ok?: string };

/** Constantes guardadas como lista (valor_json) em vez de número. */
const CHAVES_JSON = new Set(["zonas_fc", "relacao_mais_leve"]);

async function pedirRecalculo() {
  await (await fila()).send(FILAS.recalcular, {});
}

export async function guardarConstante(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  const chave = String(form.get("chave") ?? "").trim();
  const data = String(form.get("data") ?? "");
  const texto = String(form.get("valor") ?? "").trim().replace(",", CHAVES_JSON.has(chave) ? "," : ".");
  const nota = String(form.get("nota") ?? "").trim() || null;
  if (!/^[a-z_]+$/.test(chave)) return { erro: "Chave inválida." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return { erro: "Data inválida." };

  let valor: number | null = null;
  let valorJson: number[] | null = null;
  if (CHAVES_JSON.has(chave)) {
    valorJson = texto.split(/[,;\s]+/).filter(Boolean).map(Number);
    if (!valorJson.length || valorJson.some((n) => !Number.isFinite(n))) {
      return { erro: "Escreve os números separados por vírgulas (ex.: 124, 154, 169, 184)." };
    }
  } else {
    valor = Number(texto);
    if (!texto || !Number.isFinite(valor)) return { erro: "O valor tem de ser um número." };
  }

  await db()
    .insert(constante)
    .values({ chave, dataEfetiva: data, valor, valorJson, origem: "manual", nota })
    .onConflictDoUpdate({
      target: [constante.chave, constante.dataEfetiva],
      set: { valor, valorJson, origem: "manual", nota, atividadeStravaId: null },
    });
  await pedirRecalculo();
  revalidatePath("/constantes");
  return { ok: "Guardado. As métricas vão ser recalculadas dentro de momentos." };
}

/** Apaga uma linha manual (as tiradas de atividades são refeitas a cada recálculo). */
export async function apagarConstante(form: FormData) {
  const id = Number(form.get("id"));
  if (!Number.isInteger(id)) return;
  await db().delete(constante).where(and(eq(constante.id, id), isNull(constante.atividadeStravaId)));
  await pedirRecalculo();
  revalidatePath("/constantes");
}

export async function guardarParametro(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  const chave = String(form.get("chave") ?? "");
  const repor = form.get("repor") === "1";
  const [p] = await db().select().from(parametroModelo).where(eq(parametroModelo.chave, chave));
  if (!p) return { erro: "Parâmetro desconhecido." };

  let valor: unknown = p.valorDefault;
  if (!repor) {
    try {
      valor = JSON.parse(String(form.get("valor") ?? "").replace(/(\d),(\d)/g, "$1.$2"));
    } catch {
      return { erro: 'Valor inválido. Exemplos: 42 · 0.05 · [124, 154] · true · "texto"' };
    }
    if (typeof valor !== typeof p.valorDefault || Array.isArray(valor) !== Array.isArray(p.valorDefault)) {
      return { erro: "O valor tem de ser do mesmo tipo do valor por omissão." };
    }
  }
  await db().update(parametroModelo).set({ valor, atualizadoEm: new Date() }).where(eq(parametroModelo.chave, chave));
  await pedirRecalculo();
  revalidatePath("/constantes");
  return { ok: repor ? "Reposto o valor por omissão." : "Guardado." };
}
