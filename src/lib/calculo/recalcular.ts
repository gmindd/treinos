// Recálculo completo das métricas: FTP dos testes → TSS/TRIMP/zonas por atividade →
// CTL/ATL/TSB por dia. Parte sempre dos streams brutos, por isso pode correr as vezes
// que for preciso (ex.: depois de mudar uma constante).
import { and, asc, eq, isNotNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import {
  atividade,
  atividadeMetricas,
  atividadeStream,
  cargaDiaria,
  constante,
  melhorEsforco,
  parametroModelo,
} from "@/db/schema";
import { diasEntre, esforco010, serieCarga } from "@/lib/analysis/carga";
import { jsonNaData, numeroNaData, type LinhaConstante } from "@/lib/analysis/constantes";
import {
  amostrasCorrida,
  janelasEstaveis,
  rTss,
  velocidadeLimiar,
  velocidadeNormalizada,
  type JanelaEstavel,
} from "@/lib/analysis/corrida";
import { hrTss, tempoZonas, trimp, trimpFcMedia, type ConstantesFc } from "@/lib/analysis/fc";
import { ftpDaDescricao, ftpDoTeste, tipoTesteFtp } from "@/lib/analysis/ftp";
import {
  blocoMaisLongo,
  curvaPotencia,
  potenciaNormalizada,
  tempoAcima,
  tssPotencia,
} from "@/lib/analysis/potencia";
import { duracoes, numeros, reamostrar1Hz, type Streams } from "@/lib/analysis/series";
import { desacoplamento, janelasPotencia, relacaoFcPotencia } from "@/lib/analysis/zwift";
import { dataIsoLisboa, FUSO } from "@/lib/formato";
import { gravarEstado } from "@/lib/sistema";
import { desempacotarStreams } from "@/lib/strava/mapear";
import { INICIO_BACKFILL } from "@/lib/strava/sincronizar";

export const VERSAO_MODELO = "fase2-2";
export const ESTADO_CALCULO = "calculo.ultimo";

type Parametros = Map<string, unknown>;

function num(p: Parametros, chave: string, omissao: number): number {
  const v = p.get(chave);
  return typeof v === "number" ? v : omissao;
}

async function lerParametros(db: Db): Promise<Parametros> {
  const linhas = await db.select({ chave: parametroModelo.chave, valor: parametroModelo.valor }).from(parametroModelo);
  return new Map(linhas.map((l) => [l.chave, l.valor]));
}

async function lerConstantes(db: Db): Promise<LinhaConstante[]> {
  return db
    .select({
      chave: constante.chave,
      dataEfetiva: constante.dataEfetiva,
      valor: constante.valor,
      valorJson: constante.valorJson,
    })
    .from(constante);
}

async function lerStreams(db: Db, atividadeId: number): Promise<Streams | null> {
  const [s] = await db
    .select({ dados: atividadeStream.dados })
    .from(atividadeStream)
    .where(eq(atividadeStream.atividadeId, atividadeId));
  return s ? desempacotarStreams(s.dados) : null;
}

type Atividade = typeof atividade.$inferSelect;

/**
 * FTP a partir das atividades do Zwift: valor escrito na descrição ou, num teste sem
 * valor escrito, calculado da curva de potência. As linhas assim criadas têm
 * `atividade_strava_id` e são refeitas; as linhas manuais nunca são tocadas.
 */
async function derivarFtp(db: Db, atividades: Atividade[], maxLacuna: number) {
  const porData = new Map<string, typeof constante.$inferInsert>();
  for (const a of atividades) {
    if (a.modalidade !== "zwift") continue;
    const tipo = tipoTesteFtp(a.nome);
    const escrito = ftpDaDescricao(a.descricao);
    if (!tipo && escrito == null) continue;

    let valor = escrito;
    let nota: string;
    if (escrito != null) {
      nota = `${tipo ? "Teste" : "Zwift"}: FTP escrito na descrição de "${a.nome}"`;
    } else {
      const s = a.estadoStreams === "ok" ? await lerStreams(db, a.id) : null;
      const time = s ? numeros(s, "time") : null;
      const watts = s ? numeros(s, "watts") : null;
      if (!time || !watts) continue;
      const curva = curvaPotencia(reamostrar1Hz(time as number[], watts, maxLacuna, 0) as number[]);
      valor = ftpDoTeste(tipo!, curva);
      nota =
        tipo === "rampa"
          ? `Ramp test "${a.nome}": 75% da melhor potência de 1 min (${Math.round(curva[60] ?? 0)} W)`
          : `Teste "${a.nome}": 95% da melhor potência de 20 min (${Math.round(curva[1200] ?? 0)} W)`;
    }
    if (valor == null) continue;
    porData.set(a.dataLocal, {
      chave: "ftp_w",
      dataEfetiva: a.dataLocal,
      valor,
      origem: tipo ? "teste" : "estimado",
      nota,
      atividadeStravaId: a.stravaId,
    });
  }
  await db.transaction(async (tx) => {
    await tx.delete(constante).where(and(eq(constante.chave, "ftp_w"), isNotNull(constante.atividadeStravaId)));
    if (porData.size) await tx.insert(constante).values([...porData.values()]).onConflictDoNothing();
  });
  return porData.size;
}

type Resultado = {
  tss: number | null;
  metodo: string;
  intensidade: number | null;
  trimp: number | null;
  zonas: number[] | null;
  detalhes: Record<string, unknown>;
};

/** Métricas de uma atividade. `historicoCorrida` traz as janelas e esforços anteriores. */
function calcularAtividade(
  a: Atividade,
  s: Streams | null,
  linhas: LinhaConstante[],
  p: Parametros,
  historicoCorrida: { janelas: JanelaEstavel[]; esforcos: { distanciaM: number; tempoS: number }[] },
): Resultado & { janelasCorrida?: JanelaEstavel[] } {
  const data = a.dataLocal;
  const c: ConstantesFc = {
    fcRepouso: numeroNaData(linhas, "fc_repouso", data) ?? 51,
    fcMax: numeroNaData(linhas, "fc_max", data) ?? 190,
    lthr: numeroNaData(linhas, "lthr", data) ?? 170,
  };
  const ftp = numeroNaData(linhas, "ftp_w", data);
  const limitesZonas = jsonNaData<number[]>(linhas, "zonas_fc", data) ?? [124, 154, 169, 184];
  const maxLacuna = num(p, "carga.max_lacuna_s", 10);
  const detalhes: Record<string, unknown> = { constantes: { ...c, ftp } };

  const time = s ? (numeros(s, "time") as number[] | null) : null;
  const fc = s ? numeros(s, "heartrate") : null;
  const dt = time ? duracoes(time, maxLacuna) : null;

  let valorTrimp: number | null = null;
  let zonas: number[] | null = null;
  if (time && fc && dt) {
    valorTrimp = trimp(fc, dt, c);
    zonas = tempoZonas(fc, dt, limitesZonas);
  } else if (a.fcMedia) {
    valorTrimp = trimpFcMedia(a.fcMedia, a.duracaoMovimentoS, c);
    detalhes.trimpAproximado = "FC média × duração (sem streams de FC)";
  }
  const tssFc = valorTrimp != null ? hrTss(valorTrimp, c) : null;
  detalhes.hrTss = tssFc;
  const porFc = (): Resultado | null =>
    tssFc != null
      ? { tss: tssFc, metodo: "hrTSS", intensidade: null, trimp: valorTrimp, zonas, detalhes }
      : null;

  // Zwift com potenciómetro: TSS pela potência.
  const watts = s ? numeros(s, "watts") : null;
  if (a.modalidade === "zwift" && time && watts && a.potenciaMedia != null && ftp) {
    const w1 = reamostrar1Hz(time, watts, maxLacuna, 0) as number[];
    const fc1 = fc ? reamostrar1Hz(time, fc, maxLacuna, null) : w1.map(() => null);
    const np = potenciaNormalizada(w1);
    if (np) {
      const { tss, intensidade } = tssPotencia(np, w1.length, ftp);
      const janelas = janelasPotencia(w1, fc1, {
        janelaS: num(p, "zwift.janela_estavel_s", 180),
        cvMax: num(p, "zwift.cv_potencia_max", 0.05),
        descartarInicioS: num(p, "zwift.descartar_inicio_bloco_s", 120),
        variacaoBloco: num(p, "zwift.variacao_bloco", 0.075),
      });
      const fracoes = (p.get("zwift.limiares_ftp") as number[] | undefined) ?? [0.88, 0.95];
      detalhes.np = np;
      detalhes.zwift = {
        curva: curvaPotencia(w1),
        relacao: relacaoFcPotencia(janelas),
        janelas: janelas.length,
        ef: a.fcMedia ? np / a.fcMedia : null,
        z2: intensidade < num(p, "zwift.ef_if_max", 0.75),
        desacoplamento: desacoplamento(w1, fc1),
        tempoAcimaFtp: Object.fromEntries(fracoes.map((f) => [f, tempoAcima(w1, f * ftp)])),
        blocoMaisLongo88: blocoMaisLongo(w1, (fracoes[0] ?? 0.88) * ftp),
        hora: new Intl.DateTimeFormat("pt-PT", { timeZone: FUSO, hour: "2-digit", minute: "2-digit" }).format(a.inicio),
        temperatura: a.temperaturaMedia,
      };
      return { tss, metodo: "potencia", intensidade, trimp: valorTrimp, zonas, detalhes };
    }
  }

  // Corrida: rTSS pelo ritmo ajustado ao declive, relativo à velocidade de limiar.
  if (a.modalidade === "corrida" && time) {
    const amostras = amostrasCorrida(time, numeros(s!, "distance"), numeros(s!, "altitude"), fc, {
      vParagem: num(p, "corrida.v_paragem_ms", 1.5),
      janelaDecliveM: num(p, "corrida.janela_declive_min_m", 30),
      maxLacuna,
      vMax: num(p, "corrida.v_max_ms", 8),
    });
    if (amostras) {
      const janelasCorrida = fc
        ? janelasEstaveis(amostras, {
            aquecimentoS: num(p, "corrida.aquecimento_descartado_min", 8) * 60,
            janelaS: num(p, "corrida.janela_estavel_s", 150),
            cvMax: num(p, "corrida.cv_velocidade_max", 0.05),
            atrasoFcS: num(p, "corrida.atraso_fc_s", 20),
          })
        : [];
      const limiar = velocidadeLimiar(historicoCorrida.janelas, historicoCorrida.esforcos, c.lthr, {
        minJanelas: num(p, "corrida.limiar_min_janelas", 15),
        riegel: num(p, "corrida.riegel_expoente", 1.06),
      });
      const vn = velocidadeNormalizada(amostras.gap1Hz);
      detalhes.limiar = limiar;
      detalhes.vNormalizada = vn;
      if (limiar.v && vn) {
        const { tss, intensidade } = rTss(vn, amostras.duracaoMovimentoS, limiar.v);
        return { tss, metodo: "rTSS", intensidade, trimp: valorTrimp, zonas, detalhes, janelasCorrida };
      }
      const r = porFc();
      if (r) return { ...r, janelasCorrida };
    }
  }

  const r = porFc();
  if (r) return r;
  // Sem FC nem potência: TSS estimado por hora.
  const tssHora = num(p, "carga.tss_hora_sem_fc", 30);
  return {
    tss: (a.duracaoMovimentoS / 3600) * tssHora,
    metodo: "estimado_hora",
    intensidade: null,
    trimp: null,
    zonas: null,
    detalhes: { ...detalhes, tssHora },
  };
}

const MODALIDADES = ["corrida", "zwift", "btt", "tenis", "forca", "outros"] as const;

/** Recalcula tudo. Devolve um resumo para o log. */
export async function recalcularTudo(db: Db) {
  const inicio = Date.now();
  const p = await lerParametros(db);
  const maxLacuna = num(p, "carga.max_lacuna_s", 10);
  const atividades = await db
    .select()
    .from(atividade)
    .where(eq(atividade.apagada, false))
    .orderBy(asc(atividade.inicio));

  const ftps = await derivarFtp(db, atividades, maxLacuna);
  const linhas = await lerConstantes(db);

  const esforcos = await db
    .select({ distanciaM: melhorEsforco.distanciaM, tempoS: melhorEsforco.tempoS, data: atividade.dataLocal })
    .from(melhorEsforco)
    .innerJoin(atividade, eq(atividade.id, melhorEsforco.atividadeId))
    .where(eq(atividade.apagada, false));

  const escala = num(p, "carga.esforco_escala_tss", 100);
  const semanasLimiar = num(p, "corrida.historico_semanas", 6);
  const diasEsforcos = num(p, "corrida.limiar_dias_esforcos", 90);
  const janelasPorData: { data: string; janelas: JanelaEstavel[] }[] = [];
  const porDia = new Map<string, { tss: Record<string, number>; horas: Record<string, number> }>();
  const contagem: Record<string, number> = {};

  for (const a of atividades) {
    const s = a.estadoStreams === "ok" ? await lerStreams(db, a.id) : null;
    const desde = (dias: number) => {
      const d = new Date(`${a.dataLocal}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - dias);
      return d.toISOString().slice(0, 10);
    };
    const historico = {
      janelas: janelasPorData
        .filter((j) => j.data >= desde(semanasLimiar * 7) && j.data < a.dataLocal)
        .flatMap((j) => j.janelas),
      esforcos: esforcos.filter((e) => e.data >= desde(diasEsforcos) && e.data <= a.dataLocal),
    };
    const r = calcularAtividade(a, s, linhas, p, historico);
    if (r.janelasCorrida?.length) janelasPorData.push({ data: a.dataLocal, janelas: r.janelasCorrida });
    contagem[r.metodo] = (contagem[r.metodo] ?? 0) + 1;

    const valores = {
      versaoModelo: VERSAO_MODELO,
      tss: r.tss,
      metodoTss: r.metodo,
      intensidade: r.intensidade,
      trimp: r.trimp,
      esforco010: r.tss != null ? esforco010(r.tss, escala) : null,
      tempoZonasS: r.zonas,
      detalhes: r.detalhes,
      calculadoEm: new Date(),
    };
    await db
      .insert(atividadeMetricas)
      .values({ atividadeId: a.id, ...valores })
      .onConflictDoUpdate({ target: atividadeMetricas.atividadeId, set: valores });

    const dia = porDia.get(a.dataLocal) ?? { tss: {}, horas: {} };
    dia.tss[a.modalidade] = (dia.tss[a.modalidade] ?? 0) + (r.tss ?? 0);
    dia.horas[a.modalidade] = (dia.horas[a.modalidade] ?? 0) + a.duracaoMovimentoS / 3600;
    porDia.set(a.dataLocal, dia);
  }

  // CTL / ATL / TSB por dia, desde o início do backfill até hoje.
  const primeiro = atividades[0]?.dataLocal;
  const inicioCarga = primeiro && primeiro < INICIO_BACKFILL.toISOString().slice(0, 10) ? primeiro : INICIO_BACKFILL.toISOString().slice(0, 10);
  const dias = diasEntre(inicioCarga, dataIsoLisboa(new Date()));
  const sementes: Record<string, { ctl?: number; atl?: number }> = {};
  for (const l of linhas) {
    if ((l.chave === "ctl_semente" || l.chave === "atl_semente") && l.valor != null) {
      sementes[l.dataEfetiva] = { ...sementes[l.dataEfetiva], [l.chave === "ctl_semente" ? "ctl" : "atl"]: l.valor };
    }
  }
  const serie = serieCarga(
    dias.map((data) => ({
      data,
      tss: Object.values(porDia.get(data)?.tss ?? {}).reduce((x, y) => x + y, 0),
    })),
    { ctlDias: num(p, "carga.ctl_dias", 42), atlDias: num(p, "carga.atl_dias", 7), sementes },
  );
  const vazio = Object.fromEntries(MODALIDADES.map((m) => [m, 0]));
  await db.transaction(async (tx) => {
    await tx.delete(cargaDiaria);
    for (let i = 0; i < serie.length; i += 500) {
      await tx.insert(cargaDiaria).values(
        serie.slice(i, i + 500).map((d) => ({
          data: d.data,
          tss: d.tss,
          tssPorModalidade: { ...vazio, ...porDia.get(d.data)?.tss },
          horasPorModalidade: { ...vazio, ...porDia.get(d.data)?.horas },
          ctl: d.ctl,
          atl: d.atl,
          tsb: d.tsb,
          projetada: false,
        })),
      );
    }
  });

  const hoje = serie.at(-1);
  const resumo = {
    em: new Date().toISOString(),
    versao: VERSAO_MODELO,
    atividades: atividades.length,
    ftpsDerivados: ftps,
    metodos: contagem,
    hoje: hoje ? { data: hoje.data, ctl: hoje.ctl, atl: hoje.atl, tsb: hoje.tsb } : null,
    duracaoMs: Date.now() - inicio,
  };
  await gravarEstado(db, ESTADO_CALCULO, resumo);
  return resumo;
}
