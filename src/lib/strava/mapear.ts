// Conversão de respostas do Strava para linhas da BD (funções puras).
import { gunzipSync, gzipSync } from "node:zlib";
import { dataIsoLisboa } from "@/lib/formato";
import { classificarModalidade, contemFrase, type Modalidade } from "./classificar";
import type { AtividadeStrava, StreamsStrava } from "./tipos";

export type LinhaAtividade = {
  stravaId: number;
  origem: "strava";
  nome: string;
  descricao: string | null;
  sportType: string | null;
  modalidade: Modalidade;
  trainer: boolean;
  inicio: Date;
  dataLocal: string;
  duracaoMovimentoS: number;
  duracaoTotalS: number;
  distanciaM: number | null;
  desnivelM: number | null;
  fcMedia: number | null;
  fcMax: number | null;
  potenciaMedia: number | null;
  cadenciaMedia: number | null;
  temperaturaMedia: number | null;
  relativeEffort: number | null;
  comCriancas: boolean;
};

/**
 * Atividade detalhada → linha de `atividade`. A potência só é guardada se vier de um
 * medidor (`device_watts`); a que o Strava estima para bicicletas sem potenciómetro é ignorada.
 */
export function mapearAtividade(a: AtividadeStrava, fraseCriancas: string): LinhaAtividade {
  const inicio = new Date(a.start_date);
  const trainer = a.trainer ?? false;
  return {
    stravaId: a.id,
    origem: "strava",
    nome: a.name,
    descricao: a.description ?? null,
    sportType: a.sport_type ?? null,
    modalidade: classificarModalidade(a.sport_type, trainer),
    trainer,
    inicio,
    dataLocal: dataIsoLisboa(inicio),
    duracaoMovimentoS: Math.round(a.moving_time),
    duracaoTotalS: Math.round(a.elapsed_time),
    distanciaM: a.distance ?? null,
    desnivelM: a.total_elevation_gain ?? null,
    fcMedia: a.average_heartrate ?? null,
    fcMax: a.max_heartrate ?? null,
    potenciaMedia: a.device_watts ? (a.average_watts ?? null) : null,
    cadenciaMedia: a.average_cadence ?? null,
    temperaturaMedia: a.average_temp ?? null,
    relativeEffort: a.suffer_score != null ? Math.round(a.suffer_score) : null,
    comCriancas: contemFrase([a.name, a.description], fraseCriancas),
  };
}

export function mapearMelhoresEsforcos(a: AtividadeStrava, atividadeId: number) {
  return (a.best_efforts ?? []).map((e) => ({
    atividadeId,
    nome: e.name,
    distanciaM: e.distance,
    tempoS: Math.round(e.elapsed_time),
    indiceInicio: e.start_index ?? null,
    indiceFim: e.end_index ?? null,
  }));
}

export type StreamsBrutos = Record<string, unknown[]>;

/** Streams da API → { tipo: dados[] } em JSON+gzip. */
export function empacotarStreams(s: StreamsStrava) {
  const brutos: StreamsBrutos = {};
  for (const [tipo, serie] of Object.entries(s)) brutos[tipo] = serie.data;
  const tipos = Object.keys(brutos).sort();
  const nAmostras = brutos.time?.length ?? Math.max(0, ...Object.values(brutos).map((d) => d.length));
  return { tipos, nAmostras, dados: gzipSync(JSON.stringify(brutos)) };
}

export function desempacotarStreams(dados: Buffer): StreamsBrutos {
  return JSON.parse(gunzipSync(dados).toString("utf8")) as StreamsBrutos;
}
