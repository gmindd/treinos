import { eq } from "drizzle-orm";
import type { Db } from "./client";
import { constante, meta, parametroModelo } from "./schema";
import { constantesIniciais, metasIniciais, parametrosIniciais } from "./seed-dados";

/** Insere os valores iniciais que ainda não existem. Idempotente. */
export async function seed(db: Db) {
  await db
    .insert(constante)
    .values(constantesIniciais)
    .onConflictDoNothing({ target: [constante.chave, constante.dataEfetiva] });

  await db
    .insert(parametroModelo)
    .values(parametrosIniciais.map((p) => ({ ...p, valorDefault: p.valor })))
    .onConflictDoNothing({ target: parametroModelo.chave });

  for (const m of metasIniciais) {
    const existe = await db.select({ id: meta.id }).from(meta).where(eq(meta.nome, m.nome)).limit(1);
    if (existe.length === 0) await db.insert(meta).values(m);
  }
}
