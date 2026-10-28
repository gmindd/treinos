// Arranque em produção (contentor Docker): migrações + seed, depois web e worker.
// Se um dos processos terminar, o contentor termina e o Coolify reinicia-o.
import { spawn, type ChildProcess } from "node:child_process";
import { criarDb } from "../src/db/client";
import { migrarESemear } from "../src/db/migrar";
import { env } from "../src/lib/env";

async function main() {
  const { DATABASE_URL } = env();
  const bd = criarDb(DATABASE_URL);
  await migrarESemear(bd);
  await bd.$client.end();
  console.log("[start] migrações e seed aplicados");

  const filhos: ChildProcess[] = [
    spawn(process.execPath, ["server.js"], { stdio: "inherit" }),
    spawn(process.execPath, ["dist/worker.mjs"], { stdio: "inherit" }),
  ];

  // O processo sai sozinho quando os dois filhos tiverem terminado (ou à força ao fim de 12 s).
  let aTerminar = false;
  const terminar = (codigo: number) => {
    if (aTerminar) return;
    aTerminar = true;
    process.exitCode = codigo;
    for (const f of filhos) f.kill("SIGTERM");
    setTimeout(() => process.exit(codigo), 12_000).unref();
  };
  for (const f of filhos) f.on("exit", (c) => terminar(c ?? 1));
  process.on("SIGTERM", () => terminar(0));
  process.on("SIGINT", () => terminar(0));
}

main().catch((e) => {
  console.error("[start] falhou:", e);
  process.exit(1);
});
