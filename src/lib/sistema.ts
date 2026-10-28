import { eq, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { sistemaEstado } from "@/db/schema";

export const CHAVE_HEARTBEAT = "worker.heartbeat";

export type EstadoSistema = {
  bd: boolean;
  worker: { ultimoSinal: string | null; ativo: boolean };
};

/** Estado da BD e do worker (o worker é considerado ativo se deu sinal nos últimos 3 min). */
export async function estadoSistema(db: Db, agora = new Date()): Promise<EstadoSistema> {
  try {
    await db.execute(sql`select 1`);
  } catch {
    return { bd: false, worker: { ultimoSinal: null, ativo: false } };
  }
  const [linha] = await db
    .select({ atualizadoEm: sistemaEstado.atualizadoEm })
    .from(sistemaEstado)
    .where(eq(sistemaEstado.chave, CHAVE_HEARTBEAT));
  const ultimo = linha?.atualizadoEm ?? null;
  return {
    bd: true,
    worker: {
      ultimoSinal: ultimo?.toISOString() ?? null,
      ativo: ultimo !== null && agora.getTime() - ultimo.getTime() < 3 * 60 * 1000,
    },
  };
}
