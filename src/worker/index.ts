// Processo worker: fila pg-boss (schema `pgboss`) para sincronização, cálculos e snapshots.
// Na fase 0 só regista um heartbeat a cada minuto.
import { PgBoss } from "pg-boss";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { sistemaEstado } from "@/db/schema";
import { CHAVE_HEARTBEAT } from "@/lib/sistema";

const FILA_HEARTBEAT = "heartbeat";

async function heartbeat() {
  await db()
    .insert(sistemaEstado)
    .values({ chave: CHAVE_HEARTBEAT, valor: { pid: process.pid } })
    .onConflictDoUpdate({
      target: sistemaEstado.chave,
      set: { valor: { pid: process.pid }, atualizadoEm: sql`now()` },
    });
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definida");

  const boss = new PgBoss({ connectionString: url, schema: "pgboss" });
  boss.on("error", (e) => console.error("[worker] erro pg-boss:", e));
  await boss.start();

  await boss.createQueue(FILA_HEARTBEAT);
  await boss.work(FILA_HEARTBEAT, async () => heartbeat());
  await boss.schedule(FILA_HEARTBEAT, "* * * * *", null, { tz: "Europe/Lisbon" });
  await heartbeat();
  console.log("[worker] a correr");

  const parar = async () => {
    console.log("[worker] a parar…");
    await boss.stop({ graceful: true, timeout: 10_000 });
    process.exit(0);
  };
  process.on("SIGINT", parar);
  process.on("SIGTERM", parar);
}

main().catch((e) => {
  console.error("[worker] falhou ao arrancar:", e);
  process.exit(1);
});
