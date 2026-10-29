// Job de recálculo das métricas e da carga.
import type { PgBoss } from "pg-boss";
import { db } from "@/db/client";
import { recalcularTudo } from "@/lib/calculo/recalcular";
import { recalcularPrevisoes } from "@/lib/previsao/calcular";
import { FILAS } from "@/lib/fila";

export async function registarJobsCalculo(boss: PgBoss) {
  // stately: no máximo um à espera, por isso pedidos seguidos juntam-se num só cálculo.
  await boss.createQueue(FILAS.recalcular, { policy: "stately", retryLimit: 3, retryDelay: 60, expireInSeconds: 1800 });
  await boss.createQueue(FILAS.previsao, { policy: "stately", retryLimit: 2, retryDelay: 120, expireInSeconds: 3600 });

  await boss.work(FILAS.recalcular, async () => {
    const r = await recalcularTudo(db());
    console.log(
      `[calculo] ${r.atividades} atividades em ${r.duracaoMs} ms; métodos ${JSON.stringify(r.metodos)};` +
        ` hoje CTL ${r.hoje?.ctl.toFixed(1)} ATL ${r.hoje?.atl.toFixed(1)}`,
    );
    // As previsões dependem das métricas e das constantes: correm a seguir.
    await boss.send(FILAS.previsao, {});
  });

  await boss.work(FILAS.previsao, async () => {
    const r = await recalcularPrevisoes(db());
    console.log(`[previsao] ${r.snapshots} snapshots em ${r.duracaoMs} ms; dados ${JSON.stringify(r.dados)}`);
  });

  // Todos os dias (a carga de hoje decai mesmo sem treinos) e a cada arranque (deploy novo).
  await boss.schedule(FILAS.recalcular, "15 0 * * *", null, { tz: "Europe/Lisbon" });
  await boss.send(FILAS.recalcular, {});
}
