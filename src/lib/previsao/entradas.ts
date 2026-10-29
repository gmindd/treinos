// Entradas dos motores de previsão a partir dos streams brutos e dos parâmetros
// (partilhado pelo worker e pelo script de backtest local).
import type { StreamsBtt } from "@/lib/analysis/btt";
import { amostrasCorrida, janelasEstaveis } from "@/lib/analysis/corrida";
import { prepararVolta, type ParametrosBtt, type SessaoZwift, type VoltaBtt } from "@/lib/analysis/previsao-btt";
import { esforcosSessao, type ParametrosCorrida, type SessaoCorrida } from "@/lib/analysis/previsao-corrida";
import { numeros, reamostrar1Hz, type Streams } from "@/lib/analysis/series";
import { janelasPotencia } from "@/lib/analysis/zwift";

export type Parametros = Map<string, unknown>;

export function num(p: Parametros, chave: string, omissao: number): number {
  const v = p.get(chave);
  return typeof v === "number" ? v : omissao;
}

function lista<T>(p: Parametros, chave: string, omissao: T[]): T[] {
  const v = p.get(chave);
  return Array.isArray(v) ? (v as T[]) : omissao;
}

export function parametrosCorrida(p: Parametros): ParametrosCorrida {
  return {
    semanasHistorico: num(p, "corrida.historico_semanas", 6),
    meiaVidaDias: num(p, "corrida.meia_vida_dias", 14),
    minJanelas: num(p, "corrida.min_janelas_modelo", 15),
    diasEsforcos: num(p, "corrida.limiar_dias_esforcos", 90),
    meiaVidaEsforcosDias: num(p, "corrida.meia_vida_esforcos_dias", 30),
    riegel: num(p, "corrida.riegel_expoente", 1.06),
    fcProvaDefault: num(p, "corrida.fc_prova_default", 172),
    fcProvaDesconto: num(p, "corrida.fc_prova_desconto_5k", 3),
    extrapolacaoBpm: num(p, "corrida.extrapolacao_bpm", 10),
    fatorIcExtrapolacao: num(p, "corrida.fator_ic_extrapolacao", 1.5),
    divergencia: num(p, "corrida.divergencia_ab", 0.04),
    durabilidadeLongaMin: num(p, "corrida.durabilidade_longa_min", 50),
    durabilidadeVolumeKm: num(p, "corrida.durabilidade_volume_km", 20),
    penalizacaoDurabilidade: num(p, "corrida.penalizacao_durabilidade", 0.02),
    fcEficiencia: num(p, "corrida.fc_eficiencia", 150),
    semanasTendencia: num(p, "corrida.semanas_tendencia", 12),
    tauSemanas: num(p, "previsao.tau_semanas", 6),
    ganhoMax: num(p, "previsao.ganho_max", 0.08),
    bootstrapN: num(p, "previsao.bootstrap_n", 200),
    sensibilidadeFc: lista(p, "corrida.sensibilidade_fc", [168, 172, 176]),
  };
}

export function parametrosBtt(p: Parametros, fcZ1Max: number): ParametrosBtt {
  return {
    passoM: num(p, "btt.grelha_m", 25),
    atrasoFcS: num(p, "btt.atraso_fc_s", 25),
    vParagemMs: num(p, "btt.v_paragem_kmh", 3) / 3.6,
    vAPeMs: num(p, "btt.v_a_pe_kmh", 6) / 3.6,
    maxLacunaS: num(p, "carga.max_lacuna_s", 10),
    medianaAltitudeM: num(p, "btt.mediana_altitude_m", 100),
    janelaDecliveM: num(p, "btt.janela_declive_m", 100),
    classes: lista(p, "btt.classes_declive", [-10, -6, -3, -1, 1, 3, 5, 7, 9, 12]),
    segmentoMinM: num(p, "btt.segmento_min_m", 150),
    fcEsforcoMin: num(p, "btt.fc_esforco_min", 160),
    fcEsforcoLimiar: num(p, "btt.fc_esforco_limiar", 155),
    fracAcimaLimiar: num(p, "btt.fracao_acima_limiar", 0.7),
    fracVoltaEsforco: num(p, "btt.fracao_volta_esforco", 0.2),
    excluirZ1: p.get("btt.excluir_volta_fc_media_z1") !== false,
    fcZ1Max,
    sportTypesExcluidos: lista(p, "btt.sport_types_excluidos", ["GravelRide", "EBikeRide", "EMountainBikeRide"]),
    bufferM: num(p, "btt.buffer_troco_m", 25),
    sobreposicao: num(p, "btt.sobreposicao_troco", 0.7),
    pesoMesmoTroco: num(p, "btt.peso_mesmo_troco", 3),
    meiaVidaDias: num(p, "btt.meia_vida_dias", 28),
    eta: num(p, "btt.eta", 0.97),
    rho: num(p, "btt.rho", 1.2),
    cda: num(p, "btt.cda", 0.5),
    zwiftSemanas: num(p, "btt.zwift_semanas", 6),
    fcArranque: num(p, "btt.fc_arranque_controlado", 168),
    kmArranque: num(p, "btt.km_arranque_controlado", 10),
    divergencia: num(p, "btt.divergencia_ab", 0.05),
    fcProvaDefault: num(p, "btt.fc_prova_default", 165),
    semanasTendencia: num(p, "btt.semanas_tendencia", 12),
    tauSemanas: num(p, "previsao.tau_semanas", 6),
    ganhoMax: num(p, "previsao.ganho_max", 0.08),
    bootstrapN: num(p, "previsao.bootstrap_n", 200),
    marcoSubidaMin: num(p, "btt.marco_subida_min", 12),
    declSubidaMin: num(p, "btt.declive_subida_min", 5) / 100,
    gruposSinuosidade: num(p, "btt.grupos_sinuosidade", 3),
  };
}

const RE_MAXIMO = /\b(teste|test|prova|race|corrida oficial)\b/i;

export type InfoAtividade = {
  id: number;
  data: string;
  nome: string;
  descricao: string | null;
  sportType: string | null;
  comCriancas: boolean;
  duracaoMovimentoS: number;
  distanciaM: number | null;
  /** workout_type do Strava (1 = prova na corrida). */
  workoutType?: number | null;
};

export function sessaoCorrida(a: InfoAtividade, s: Streams, p: Parametros): SessaoCorrida | null {
  const time = numeros(s, "time") as number[] | null;
  if (!time) return null;
  const amostras = amostrasCorrida(time, numeros(s, "distance"), numeros(s, "altitude"), numeros(s, "heartrate"), {
    vParagem: num(p, "corrida.v_paragem_ms", 1.5),
    janelaDecliveM: num(p, "corrida.janela_declive_min_m", 30),
    maxLacuna: num(p, "carga.max_lacuna_s", 10),
    vMax: num(p, "corrida.v_max_ms", 8),
  });
  if (!amostras) return null;
  const janelas = numeros(s, "heartrate")
    ? janelasEstaveis(amostras, {
        aquecimentoS: num(p, "corrida.aquecimento_descartado_min", 8) * 60,
        janelaS: num(p, "corrida.janela_estavel_s", 150),
        cvMax: num(p, "corrida.cv_velocidade_max", 0.05),
        atrasoFcS: num(p, "corrida.atraso_fc_s", 20),
        suavizarS: num(p, "corrida.suavizacao_cv_s", 30),
      })
    : [];
  return {
    id: a.id,
    data: a.data,
    nome: a.nome,
    esforcoMaximo: a.workoutType === 1 || RE_MAXIMO.test(`${a.nome} ${a.descricao ?? ""}`),
    distanciaM: a.distanciaM ?? 0,
    duracaoMovimentoS: a.duracaoMovimentoS,
    amostras,
    janelas,
    esforcos: esforcosSessao(amostras),
  };
}

export function streamsBtt(s: Streams): StreamsBtt | null {
  const time = numeros(s, "time") as number[] | null;
  const distance = numeros(s, "distance");
  if (!time || !distance) return null;
  const ll = s.latlng;
  return {
    time,
    distance,
    altitude: numeros(s, "altitude"),
    heartrate: numeros(s, "heartrate"),
    latlng: Array.isArray(ll)
      ? ll.map((x) => (Array.isArray(x) && typeof x[0] === "number" && typeof x[1] === "number" ? [x[0], x[1]] : null))
      : null,
    cadence: numeros(s, "cadence"),
  };
}

export function voltaBtt(a: InfoAtividade, s: Streams, pb: ParametrosBtt): VoltaBtt | null {
  const sb = streamsBtt(s);
  if (!sb) return null;
  return prepararVolta(
    {
      id: a.id,
      data: a.data,
      nome: a.nome,
      sportType: a.sportType,
      comCriancas: a.comCriancas,
      duracaoMovimentoS: a.duracaoMovimentoS,
    },
    sb,
    pb,
  );
}

export function sessaoZwift(a: InfoAtividade, s: Streams, p: Parametros): SessaoZwift | null {
  const time = numeros(s, "time") as number[] | null;
  const watts = numeros(s, "watts");
  const fc = numeros(s, "heartrate");
  if (!time || !watts || !fc) return null;
  const maxLacuna = num(p, "carga.max_lacuna_s", 10);
  const w1 = reamostrar1Hz(time, watts, maxLacuna, 0) as number[];
  const fc1 = reamostrar1Hz(time, fc, maxLacuna, null);
  const janelas = janelasPotencia(w1, fc1, {
    janelaS: num(p, "zwift.janela_estavel_s", 180),
    cvMax: num(p, "zwift.cv_potencia_max", 0.05),
    descartarInicioS: num(p, "zwift.descartar_inicio_bloco_s", 120),
    variacaoBloco: num(p, "zwift.variacao_bloco", 0.075),
    suavizarS: num(p, "zwift.suavizacao_cv_s", 30),
  });
  return { id: a.id, data: a.data, janelas };
}
