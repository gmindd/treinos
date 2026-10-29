// Esquema da BD. Explicação em docs/esquema-bd.md.
// Unidades base: metros, segundos, m/s, watts, bpm. Instantes em timestamptz (UTC).
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  customType,
  date,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  serial,
  text,
  timestamp,
  unique,
  index,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer }>({
  dataType: () => "bytea",
});

const criadoEm = () => timestamp("criado_em", { withTimezone: true }).notNull().defaultNow();
const atualizadoEm = () =>
  timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow();

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** Modalidade de uma atividade realizada (classificação a partir do sport_type do Strava). */
export const modalidadeAtividade = pgEnum("modalidade_atividade", [
  "corrida",
  "zwift",
  "btt",
  "tenis",
  "forca",
  "outros",
]);

/** Modalidade de uma prescrição (contrato JSON, Anexo A). */
export const modalidadePrescricao = pgEnum("modalidade_prescricao", [
  "corrida",
  "zwift",
  "btt",
  "forca",
  "tenis",
  "descanso",
]);

export const estadoPrescricao = pgEnum("estado_prescricao", [
  "planeado",
  "feito",
  "parcial",
  "falhado",
  "substituido",
]);

export const intencaoTreino = pgEnum("intencao_treino", [
  "facil",
  "qualidade",
  "longo",
  "recuperacao",
  "teste",
  "prova",
  "livre",
]);

export const origemValor = pgEnum("origem_valor", [
  "manual",
  "teste",
  "chat",
  "estimado",
  "seed",
]);

export const origemParametro = pgEnum("origem_parametro", ["dados", "heuristica", "literatura"]);

export const origemAtividade = pgEnum("origem_atividade", ["strava", "fit", "gpx"]);

export const estadoStreams = pgEnum("estado_streams", ["pendente", "ok", "sem_streams", "erro"]);

export const tipoMeta = pgEnum("tipo_meta", ["corrida", "btt"]);

// ---------------------------------------------------------------------------
// Atleta: constantes com data efetiva e parâmetros dos modelos
// ---------------------------------------------------------------------------

/**
 * Constantes do atleta com histórico. O valor válido numa data é a linha com a
 * maior data_efetiva <= data; antes da primeira linha usa-se a mais antiga.
 * Numéricas em `valor`; estruturadas (ex.: limites das zonas) em `valor_json`.
 */
export const constante = pgTable(
  "constante",
  {
    id: serial("id").primaryKey(),
    chave: text("chave").notNull(),
    dataEfetiva: date("data_efetiva").notNull(),
    valor: numeric("valor", { mode: "number" }),
    valorJson: jsonb("valor_json"),
    origem: origemValor("origem").notNull(),
    nota: text("nota"),
    /** Atividade de onde o valor foi tirado (ex.: ramp test). Estas linhas são refeitas a cada recálculo. */
    atividadeStravaId: bigint("atividade_strava_id", { mode: "number" }),
    criadoEm: criadoEm(),
  },
  (t) => [unique("constante_chave_data").on(t.chave, t.dataEfetiva)],
);

/** Parâmetros dos modelos, visíveis e editáveis na UI. */
export const parametroModelo = pgTable("parametro_modelo", {
  chave: text("chave").primaryKey(),
  grupo: text("grupo").notNull(),
  descricao: text("descricao").notNull(),
  unidade: text("unidade"),
  valor: jsonb("valor").notNull(),
  valorDefault: jsonb("valor_default").notNull(),
  origem: origemParametro("origem").notNull(),
  atualizadoEm: atualizadoEm(),
});

// ---------------------------------------------------------------------------
// Strava e atividades
// ---------------------------------------------------------------------------

/** Ligação OAuth ao Strava (uma só linha: app single-athlete). */
export const stravaConta = pgTable("strava_conta", {
  athleteId: bigint("athlete_id", { mode: "number" }).primaryKey(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  expiraEm: timestamp("expira_em", { withTimezone: true }).notNull(),
  scope: text("scope").notNull(),
  atualizadoEm: atualizadoEm(),
});

export const atividade = pgTable(
  "atividade",
  {
    id: serial("id").primaryKey(),
    stravaId: bigint("strava_id", { mode: "number" }).unique(),
    origem: origemAtividade("origem").notNull(),
    nome: text("nome").notNull(),
    descricao: text("descricao"),
    sportType: text("sport_type"),
    modalidade: modalidadeAtividade("modalidade").notNull(),
    trainer: boolean("trainer").notNull().default(false),
    inicio: timestamp("inicio", { withTimezone: true }).notNull(),
    dataLocal: date("data_local").notNull(),
    duracaoMovimentoS: integer("duracao_movimento_s").notNull(),
    duracaoTotalS: integer("duracao_total_s").notNull(),
    distanciaM: real("distancia_m"),
    desnivelM: real("desnivel_m"),
    fcMedia: real("fc_media"),
    fcMax: real("fc_max"),
    potenciaMedia: real("potencia_media"),
    cadenciaMedia: real("cadencia_media"),
    temperaturaMedia: real("temperatura_media"),
    relativeEffort: integer("relative_effort"),
    /** "com crianças" no título/descrição. */
    comCriancas: boolean("com_criancas").notNull().default(false),
    /** Resumo bruto devolvido pela API (atividade detalhada). */
    dadosOrigem: jsonb("dados_origem"),
    estadoStreams: estadoStreams("estado_streams").notNull().default("pendente"),
    apagada: boolean("apagada").notNull().default(false),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [
    index("atividade_data_local_idx").on(t.dataLocal),
    index("atividade_modalidade_data_idx").on(t.modalidade, t.dataLocal),
  ],
);

/**
 * Streams brutos: um objeto JSON { time: [...], heartrate: [...], ... } em gzip.
 * Nunca é alterado depois de gravado; todos os cálculos partem daqui.
 */
export const atividadeStream = pgTable("atividade_stream", {
  atividadeId: integer("atividade_id")
    .primaryKey()
    .references(() => atividade.id, { onDelete: "cascade" }),
  formato: text("formato").notNull().default("json-gzip"),
  tipos: text("tipos").array().notNull(),
  nAmostras: integer("n_amostras").notNull(),
  dados: bytea("dados").notNull(),
  criadoEm: criadoEm(),
});

/** Best efforts do Strava (corrida): âncora do modelo B. */
export const melhorEsforco = pgTable(
  "melhor_esforco",
  {
    id: serial("id").primaryKey(),
    atividadeId: integer("atividade_id")
      .notNull()
      .references(() => atividade.id, { onDelete: "cascade" }),
    nome: text("nome").notNull(),
    distanciaM: real("distancia_m").notNull(),
    tempoS: integer("tempo_s").notNull(),
    indiceInicio: integer("indice_inicio"),
    indiceFim: integer("indice_fim"),
  },
  (t) => [unique("melhor_esforco_atividade_nome").on(t.atividadeId, t.nome)],
);

/**
 * Métricas de carga calculadas (recalculáveis). `detalhes` guarda a decomposição
 * (constantes usadas, NP, IF, tempo por zona, etc.).
 */
export const atividadeMetricas = pgTable("atividade_metricas", {
  atividadeId: integer("atividade_id")
    .primaryKey()
    .references(() => atividade.id, { onDelete: "cascade" }),
  versaoModelo: text("versao_modelo").notNull(),
  tss: real("tss"),
  metodoTss: text("metodo_tss"),
  intensidade: real("intensidade"),
  trimp: real("trimp"),
  esforco010: real("esforco_0_10"),
  tempoZonasS: jsonb("tempo_zonas_s"),
  detalhes: jsonb("detalhes"),
  calculadoEm: timestamp("calculado_em", { withTimezone: true }).notNull().defaultNow(),
});

/** Avaliação de produtividade (0-100) com decomposição e frases de feedback. */
export const avaliacao = pgTable("avaliacao", {
  atividadeId: integer("atividade_id")
    .primaryKey()
    .references(() => atividade.id, { onDelete: "cascade" }),
  prescricaoId: text("prescricao_id").references(() => prescricao.id, { onDelete: "set null" }),
  versaoModelo: text("versao_modelo").notNull(),
  produtividade: real("produtividade"),
  componentes: jsonb("componentes").notNull(),
  feedback: jsonb("feedback").$type<string[]>().notNull(),
  deltaPrevisaoS: jsonb("delta_previsao_s"),
  calculadoEm: timestamp("calculado_em", { withTimezone: true }).notNull().defaultNow(),
});

/** CTL/ATL/TSB por dia (recalculável). `projetada` = dias futuros a partir de prescrições. */
export const cargaDiaria = pgTable("carga_diaria", {
  data: date("data").primaryKey(),
  tss: real("tss").notNull(),
  tssPorModalidade: jsonb("tss_por_modalidade").notNull(),
  horasPorModalidade: jsonb("horas_por_modalidade").notNull(),
  ctl: real("ctl").notNull(),
  atl: real("atl").notNull(),
  tsb: real("tsb").notNull(),
  projetada: boolean("projetada").notNull().default(false),
  calculadoEm: timestamp("calculado_em", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Metas, percursos e previsões
// ---------------------------------------------------------------------------

/** Percurso-alvo: pontos reamostrados [{d, lat, lon, ele}] em gzip. */
export const percurso = pgTable("percurso", {
  id: serial("id").primaryKey(),
  nome: text("nome").notNull(),
  origem: origemAtividade("origem").notNull(),
  atividadeId: integer("atividade_id").references(() => atividade.id, { onDelete: "set null" }),
  ficheiroOriginal: bytea("ficheiro_original"),
  pontos: bytea("pontos"),
  distanciaM: real("distancia_m"),
  desnivelM: real("desnivel_m"),
  criadoEm: criadoEm(),
});

export const meta = pgTable("meta", {
  id: serial("id").primaryKey(),
  nome: text("nome").notNull(),
  tipo: tipoMeta("tipo").notNull(),
  dataProva: date("data_prova").notNull(),
  distanciaM: real("distancia_m"),
  /** Desnível positivo (m) de metas de corrida sem GPX; null = plano. */
  desnivelM: real("desnivel_m"),
  /** Limites dos setores escolhidos pelo atleta (metros desde o início); null = automáticos. */
  limitesSetores: jsonb("limites_setores"),
  percursoId: integer("percurso_id").references(() => percurso.id, { onDelete: "set null" }),
  /** Atividade Strava de referência (ex.: edição anterior da prova). */
  referenciaStravaId: bigint("referencia_strava_id", { mode: "number" }),
  tempoReferenciaS: integer("tempo_referencia_s"),
  tempoAlvoS: integer("tempo_alvo_s").notNull(),
  /** true: tempo-alvo é em movimento (BTT); false: tempo oficial. */
  alvoEmMovimento: boolean("alvo_em_movimento").notNull().default(false),
  ativa: boolean("ativa").notNull().default(true),
  notas: text("notas"),
  criadoEm: criadoEm(),
  atualizadoEm: atualizadoEm(),
});

/** Snapshot diário da previsão de cada meta (para o gráfico de evolução). */
export const previsaoSnapshot = pgTable(
  "previsao_snapshot",
  {
    id: serial("id").primaryKey(),
    metaId: integer("meta_id")
      .notNull()
      .references(() => meta.id, { onDelete: "cascade" }),
    data: date("data").notNull(),
    versaoModelo: text("versao_modelo").notNull(),
    suficiente: boolean("suficiente").notNull(),
    hojeS: real("hoje_s"),
    hojeP10S: real("hoje_p10_s"),
    hojeP90S: real("hoje_p90_s"),
    projecaoS: real("projecao_s"),
    projecaoP10S: real("projecao_p10_s"),
    projecaoP90S: real("projecao_p90_s"),
    probAlvo: real("prob_alvo"),
    /** Estimadores individuais, pesos, avisos e o que falta quando não é suficiente. */
    detalhes: jsonb("detalhes").notNull(),
    criadoEm: criadoEm(),
  },
  (t) => [unique("previsao_meta_data").on(t.metaId, t.data)],
);

// ---------------------------------------------------------------------------
// Prescrições vindas do chat "Época 26/27"
// ---------------------------------------------------------------------------

/** Cada colagem/chamada do chat, tal como chegou. */
export const importacao = pgTable("importacao", {
  id: serial("id").primaryKey(),
  origem: text("origem").notNull(),
  payload: jsonb("payload").notNull(),
  resumo: jsonb("resumo"),
  aplicadaEm: timestamp("aplicada_em", { withTimezone: true }),
  criadoEm: criadoEm(),
});

export const prescricao = pgTable(
  "prescricao",
  {
    /** `aaaa-mm-dd-modalidade-descritor`, vindo do chat. */
    id: text("id").primaryKey(),
    data: date("data").notNull(),
    modalidade: modalidadePrescricao("modalidade").notNull(),
    fase: text("fase"),
    titulo: text("titulo").notNull(),
    intencao: intencaoTreino("intencao"),
    duracaoMin: real("duracao_min"),
    blocos: jsonb("blocos").notNull().default(sql`'[]'::jsonb`),
    regras: jsonb("regras").notNull().default(sql`'{}'::jsonb`),
    notas: text("notas"),
    estado: estadoPrescricao("estado").notNull().default("planeado"),
    /** Prescrições alternativas entre si ("BTT social ou descanso") partilham o grupo. */
    grupoAlternativas: text("grupo_alternativas"),
    tssEstimado: real("tss_estimado"),
    atividadeId: integer("atividade_id")
      .unique()
      .references(() => atividade.id, { onDelete: "set null" }),
    /** auto | confirmada | ambigua | manual */
    associacao: text("associacao"),
    versao: integer("versao").notNull().default(1),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [index("prescricao_data_idx").on(t.data)],
);

/** Versões anteriores de cada prescrição (o upsert por id nunca perde histórico). */
export const prescricaoHistorico = pgTable(
  "prescricao_historico",
  {
    prescricaoId: text("prescricao_id")
      .notNull()
      .references(() => prescricao.id, { onDelete: "cascade" }),
    versao: integer("versao").notNull(),
    dados: jsonb("dados").notNull(),
    importacaoId: integer("importacao_id").references(() => importacao.id),
    criadoEm: criadoEm(),
  },
  (t) => [primaryKey({ columns: [t.prescricaoId, t.versao] })],
);

/** Avaliações escritas no chat (tipo `avaliacao_chat`), mostradas ao lado da avaliação da app. */
export const avaliacaoChat = pgTable("avaliacao_chat", {
  id: serial("id").primaryKey(),
  atividadeStravaId: bigint("atividade_strava_id", { mode: "number" }),
  prescricaoId: text("prescricao_id").references(() => prescricao.id, { onDelete: "set null" }),
  resumo: text("resumo").notNull(),
  ajustes: jsonb("ajustes").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  importacaoId: integer("importacao_id").references(() => importacao.id),
  criadoEm: criadoEm(),
});

// ---------------------------------------------------------------------------
// Sistema
// ---------------------------------------------------------------------------

/** Eventos do webhook do Strava, guardados antes de processar. */
export const webhookEvento = pgTable("webhook_evento", {
  id: serial("id").primaryKey(),
  payload: jsonb("payload").notNull(),
  recebidoEm: timestamp("recebido_em", { withTimezone: true }).notNull().defaultNow(),
  processadoEm: timestamp("processado_em", { withTimezone: true }),
  erro: text("erro"),
});

/** Estado chave-valor do sistema (heartbeat do worker, progresso do backfill, ...). */
export const sistemaEstado = pgTable("sistema_estado", {
  chave: text("chave").primaryKey(),
  valor: jsonb("valor").notNull(),
  atualizadoEm: atualizadoEm(),
});
