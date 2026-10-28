import { connection } from "next/server";
import { db } from "@/db/client";
import { estadoSistema } from "@/lib/sistema";

/** Healthcheck do Coolify: 200 se a BD responde. O estado do worker vai no corpo. */
export async function GET() {
  await connection();
  const estado = await estadoSistema(db());
  return Response.json(estado, { status: estado.bd ? 200 : 503 });
}
