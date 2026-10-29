// Respostas da API do Strava que a app usa (só os campos lidos; o resto passa intacto).
import { z } from "zod";

const numero = z.number().nullish();

export const melhorEsforcoStrava = z.looseObject({
  name: z.string(),
  distance: z.number(),
  elapsed_time: z.number(),
  start_index: numero,
  end_index: numero,
});

/** Atividade (resumo da lista ou detalhe). */
export const atividadeStrava = z.looseObject({
  id: z.number(),
  name: z.string(),
  description: z.string().nullish(),
  sport_type: z.string().nullish(),
  trainer: z.boolean().nullish(),
  manual: z.boolean().nullish(),
  start_date: z.string(),
  moving_time: z.number(),
  elapsed_time: z.number(),
  distance: numero,
  total_elevation_gain: numero,
  average_heartrate: numero,
  max_heartrate: numero,
  average_watts: numero,
  device_watts: z.boolean().nullish(),
  average_cadence: numero,
  average_temp: numero,
  suffer_score: numero,
  best_efforts: z.array(melhorEsforcoStrava).nullish(),
});
export type AtividadeStrava = z.infer<typeof atividadeStrava>;

export const listaAtividadesStrava = z.array(atividadeStrava);

/** Streams com `key_by_type=true`: { heartrate: { data: [...] }, ... }. */
export const streamsStrava = z.record(z.string(), z.looseObject({ data: z.array(z.unknown()) }));
export type StreamsStrava = z.infer<typeof streamsStrava>;

/** Resposta de /oauth/token (troca de código ou renovação). */
export const tokensStrava = z.looseObject({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_at: z.number(),
  athlete: z.looseObject({ id: z.number() }).optional(),
});
export type TokensStrava = z.infer<typeof tokensStrava>;

/** Evento do webhook (https://developers.strava.com/docs/webhooks/). */
export const eventoWebhook = z.looseObject({
  object_type: z.enum(["activity", "athlete"]),
  object_id: z.number(),
  aspect_type: z.enum(["create", "update", "delete"]),
  owner_id: z.number(),
  subscription_id: z.number(),
  event_time: z.number(),
  updates: z.record(z.string(), z.unknown()).optional(),
});

export const subscricaoWebhook = z.looseObject({ id: z.number(), callback_url: z.string() });

/** Streams pedidos para cada atividade (brief §4). */
export const TIPOS_STREAMS = [
  "time",
  "distance",
  "latlng",
  "altitude",
  "velocity_smooth",
  "heartrate",
  "cadence",
  "watts",
  "grade_smooth",
  "moving",
  "temp",
] as const;
