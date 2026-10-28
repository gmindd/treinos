import path from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { Db } from "./client";
import { seed } from "./seed";

/** Aplica as migrações pendentes (pasta drizzle/) e o seed. */
export async function migrarESemear(db: Db, pastaMigracoes = path.resolve("drizzle")) {
  await migrate(db, { migrationsFolder: pastaMigracoes });
  await seed(db);
}
