// Ambiente local sem Docker: Postgres embutido (.data/pg) + migrações + seed + web + worker.
// Uso: npm run dev   (Ctrl+C pára tudo)
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { criarDb } from "../src/db/client";
import { migrarESemear } from "../src/db/migrar";

const PORTA_PG = 54329;
const PASTA_PG = path.resolve(".data/pg");

async function main() {
  if (!existsSync(".env")) {
    console.error("Falta o ficheiro .env — copia .env.example para .env e preenche-o.");
    process.exit(1);
  }
  process.loadEnvFile(".env");

  const pg = new EmbeddedPostgres({
    databaseDir: PASTA_PG,
    user: "postgres",
    password: "postgres",
    port: PORTA_PG,
    persistent: true,
    // Sem isto o initdb no Windows cria a BD em WIN1252 e rejeita acentos.
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
    onLog: () => {},
  });
  if (!existsSync(path.join(PASTA_PG, "PG_VERSION"))) {
    console.log("[dev] a criar a base de dados local…");
    await pg.initialise();
  }
  await pg.start();
  try {
    await pg.createDatabase("treinos");
  } catch {
    // Já existe.
  }
  console.log(`[dev] Postgres local na porta ${PORTA_PG}`);

  const bd = criarDb(process.env.DATABASE_URL!);
  try {
    await migrarESemear(bd);
  } catch (e) {
    await pg.stop();
    throw e;
  } finally {
    await bd.$client.end();
  }
  console.log("[dev] migrações e seed aplicados");

  const filhos: ChildProcess[] = [
    spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev"], { stdio: "inherit" }),
    spawn(process.execPath, ["node_modules/tsx/dist/cli.mjs", "watch", "src/worker/index.ts"], {
      stdio: "inherit",
    }),
  ];

  let aParar = false;
  const parar = async () => {
    if (aParar) return;
    aParar = true;
    for (const f of filhos) f.kill();
    await pg.stop();
    process.exit(0);
  };
  process.on("SIGINT", parar);
  process.on("SIGTERM", parar);
  for (const f of filhos) f.on("exit", parar);
}

main().catch((e) => {
  console.error("[dev] falhou:", e);
  process.exit(1);
});
