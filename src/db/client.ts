import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type Db = ReturnType<typeof criarDb>;

export function criarDb(connectionString: string) {
  const pool = new Pool({ connectionString, max: 5 });
  return drizzle(pool, { schema });
}

const global = globalThis as unknown as { __db?: Db };

/** Ligação partilhada (reutilizada entre hot reloads em dev). */
export function db(): Db {
  if (!global.__db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL não definida");
    global.__db = criarDb(url);
  }
  return global.__db;
}
