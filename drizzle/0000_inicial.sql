CREATE TYPE "public"."estado_prescricao" AS ENUM('planeado', 'feito', 'parcial', 'falhado', 'substituido');--> statement-breakpoint
CREATE TYPE "public"."estado_streams" AS ENUM('pendente', 'ok', 'sem_streams', 'erro');--> statement-breakpoint
CREATE TYPE "public"."intencao_treino" AS ENUM('facil', 'qualidade', 'longo', 'recuperacao', 'teste', 'prova', 'livre');--> statement-breakpoint
CREATE TYPE "public"."modalidade_atividade" AS ENUM('corrida', 'zwift', 'btt', 'tenis', 'forca', 'outros');--> statement-breakpoint
CREATE TYPE "public"."modalidade_prescricao" AS ENUM('corrida', 'zwift', 'btt', 'forca', 'tenis', 'descanso');--> statement-breakpoint
CREATE TYPE "public"."origem_atividade" AS ENUM('strava', 'fit', 'gpx');--> statement-breakpoint
CREATE TYPE "public"."origem_parametro" AS ENUM('dados', 'heuristica', 'literatura');--> statement-breakpoint
CREATE TYPE "public"."origem_valor" AS ENUM('manual', 'teste', 'chat', 'estimado', 'seed');--> statement-breakpoint
CREATE TYPE "public"."tipo_meta" AS ENUM('corrida', 'btt');--> statement-breakpoint
CREATE TABLE "atividade" (
	"id" serial PRIMARY KEY NOT NULL,
	"strava_id" bigint,
	"origem" "origem_atividade" NOT NULL,
	"nome" text NOT NULL,
	"descricao" text,
	"sport_type" text,
	"modalidade" "modalidade_atividade" NOT NULL,
	"trainer" boolean DEFAULT false NOT NULL,
	"inicio" timestamp with time zone NOT NULL,
	"data_local" date NOT NULL,
	"duracao_movimento_s" integer NOT NULL,
	"duracao_total_s" integer NOT NULL,
	"distancia_m" real,
	"desnivel_m" real,
	"fc_media" real,
	"fc_max" real,
	"potencia_media" real,
	"cadencia_media" real,
	"temperatura_media" real,
	"relative_effort" integer,
	"com_criancas" boolean DEFAULT false NOT NULL,
	"dados_origem" jsonb,
	"estado_streams" "estado_streams" DEFAULT 'pendente' NOT NULL,
	"apagada" boolean DEFAULT false NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "atividade_strava_id_unique" UNIQUE("strava_id")
);
--> statement-breakpoint
CREATE TABLE "atividade_metricas" (
	"atividade_id" integer PRIMARY KEY NOT NULL,
	"versao_modelo" text NOT NULL,
	"tss" real,
	"metodo_tss" text,
	"intensidade" real,
	"trimp" real,
	"esforco_0_10" real,
	"tempo_zonas_s" jsonb,
	"detalhes" jsonb,
	"calculado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "atividade_stream" (
	"atividade_id" integer PRIMARY KEY NOT NULL,
	"formato" text DEFAULT 'json-gzip' NOT NULL,
	"tipos" text[] NOT NULL,
	"n_amostras" integer NOT NULL,
	"dados" "bytea" NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "avaliacao" (
	"atividade_id" integer PRIMARY KEY NOT NULL,
	"prescricao_id" text,
	"versao_modelo" text NOT NULL,
	"produtividade" real,
	"componentes" jsonb NOT NULL,
	"feedback" jsonb NOT NULL,
	"delta_previsao_s" jsonb,
	"calculado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "avaliacao_chat" (
	"id" serial PRIMARY KEY NOT NULL,
	"atividade_strava_id" bigint,
	"prescricao_id" text,
	"resumo" text NOT NULL,
	"ajustes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"importacao_id" integer,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "carga_diaria" (
	"data" date PRIMARY KEY NOT NULL,
	"tss" real NOT NULL,
	"tss_por_modalidade" jsonb NOT NULL,
	"horas_por_modalidade" jsonb NOT NULL,
	"ctl" real NOT NULL,
	"atl" real NOT NULL,
	"tsb" real NOT NULL,
	"projetada" boolean DEFAULT false NOT NULL,
	"calculado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "constante" (
	"id" serial PRIMARY KEY NOT NULL,
	"chave" text NOT NULL,
	"data_efetiva" date NOT NULL,
	"valor" numeric,
	"valor_json" jsonb,
	"origem" "origem_valor" NOT NULL,
	"nota" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "constante_chave_data" UNIQUE("chave","data_efetiva")
);
--> statement-breakpoint
CREATE TABLE "importacao" (
	"id" serial PRIMARY KEY NOT NULL,
	"origem" text NOT NULL,
	"payload" jsonb NOT NULL,
	"resumo" jsonb,
	"aplicada_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "melhor_esforco" (
	"id" serial PRIMARY KEY NOT NULL,
	"atividade_id" integer NOT NULL,
	"nome" text NOT NULL,
	"distancia_m" real NOT NULL,
	"tempo_s" integer NOT NULL,
	"indice_inicio" integer,
	"indice_fim" integer,
	CONSTRAINT "melhor_esforco_atividade_nome" UNIQUE("atividade_id","nome")
);
--> statement-breakpoint
CREATE TABLE "meta" (
	"id" serial PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"tipo" "tipo_meta" NOT NULL,
	"data_prova" date NOT NULL,
	"distancia_m" real,
	"percurso_id" integer,
	"referencia_strava_id" bigint,
	"tempo_referencia_s" integer,
	"tempo_alvo_s" integer NOT NULL,
	"alvo_em_movimento" boolean DEFAULT false NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL,
	"notas" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parametro_modelo" (
	"chave" text PRIMARY KEY NOT NULL,
	"grupo" text NOT NULL,
	"descricao" text NOT NULL,
	"unidade" text,
	"valor" jsonb NOT NULL,
	"valor_default" jsonb NOT NULL,
	"origem" "origem_parametro" NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "percurso" (
	"id" serial PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"origem" "origem_atividade" NOT NULL,
	"atividade_id" integer,
	"ficheiro_original" "bytea",
	"pontos" "bytea",
	"distancia_m" real,
	"desnivel_m" real,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prescricao" (
	"id" text PRIMARY KEY NOT NULL,
	"data" date NOT NULL,
	"modalidade" "modalidade_prescricao" NOT NULL,
	"fase" text,
	"titulo" text NOT NULL,
	"intencao" "intencao_treino",
	"duracao_min" real,
	"blocos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"regras" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notas" text,
	"estado" "estado_prescricao" DEFAULT 'planeado' NOT NULL,
	"grupo_alternativas" text,
	"tss_estimado" real,
	"atividade_id" integer,
	"associacao" text,
	"versao" integer DEFAULT 1 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prescricao_atividade_id_unique" UNIQUE("atividade_id")
);
--> statement-breakpoint
CREATE TABLE "prescricao_historico" (
	"prescricao_id" text NOT NULL,
	"versao" integer NOT NULL,
	"dados" jsonb NOT NULL,
	"importacao_id" integer,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prescricao_historico_prescricao_id_versao_pk" PRIMARY KEY("prescricao_id","versao")
);
--> statement-breakpoint
CREATE TABLE "previsao_snapshot" (
	"id" serial PRIMARY KEY NOT NULL,
	"meta_id" integer NOT NULL,
	"data" date NOT NULL,
	"versao_modelo" text NOT NULL,
	"suficiente" boolean NOT NULL,
	"hoje_s" real,
	"hoje_p10_s" real,
	"hoje_p90_s" real,
	"projecao_s" real,
	"projecao_p10_s" real,
	"projecao_p90_s" real,
	"prob_alvo" real,
	"detalhes" jsonb NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "previsao_meta_data" UNIQUE("meta_id","data")
);
--> statement-breakpoint
CREATE TABLE "sistema_estado" (
	"chave" text PRIMARY KEY NOT NULL,
	"valor" jsonb NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "strava_conta" (
	"athlete_id" bigint PRIMARY KEY NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"scope" text NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_evento" (
	"id" serial PRIMARY KEY NOT NULL,
	"payload" jsonb NOT NULL,
	"recebido_em" timestamp with time zone DEFAULT now() NOT NULL,
	"processado_em" timestamp with time zone,
	"erro" text
);
--> statement-breakpoint
ALTER TABLE "atividade_metricas" ADD CONSTRAINT "atividade_metricas_atividade_id_atividade_id_fk" FOREIGN KEY ("atividade_id") REFERENCES "public"."atividade"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atividade_stream" ADD CONSTRAINT "atividade_stream_atividade_id_atividade_id_fk" FOREIGN KEY ("atividade_id") REFERENCES "public"."atividade"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "avaliacao" ADD CONSTRAINT "avaliacao_atividade_id_atividade_id_fk" FOREIGN KEY ("atividade_id") REFERENCES "public"."atividade"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "avaliacao" ADD CONSTRAINT "avaliacao_prescricao_id_prescricao_id_fk" FOREIGN KEY ("prescricao_id") REFERENCES "public"."prescricao"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "avaliacao_chat" ADD CONSTRAINT "avaliacao_chat_prescricao_id_prescricao_id_fk" FOREIGN KEY ("prescricao_id") REFERENCES "public"."prescricao"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "avaliacao_chat" ADD CONSTRAINT "avaliacao_chat_importacao_id_importacao_id_fk" FOREIGN KEY ("importacao_id") REFERENCES "public"."importacao"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "melhor_esforco" ADD CONSTRAINT "melhor_esforco_atividade_id_atividade_id_fk" FOREIGN KEY ("atividade_id") REFERENCES "public"."atividade"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta" ADD CONSTRAINT "meta_percurso_id_percurso_id_fk" FOREIGN KEY ("percurso_id") REFERENCES "public"."percurso"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "percurso" ADD CONSTRAINT "percurso_atividade_id_atividade_id_fk" FOREIGN KEY ("atividade_id") REFERENCES "public"."atividade"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescricao" ADD CONSTRAINT "prescricao_atividade_id_atividade_id_fk" FOREIGN KEY ("atividade_id") REFERENCES "public"."atividade"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescricao_historico" ADD CONSTRAINT "prescricao_historico_prescricao_id_prescricao_id_fk" FOREIGN KEY ("prescricao_id") REFERENCES "public"."prescricao"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescricao_historico" ADD CONSTRAINT "prescricao_historico_importacao_id_importacao_id_fk" FOREIGN KEY ("importacao_id") REFERENCES "public"."importacao"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "previsao_snapshot" ADD CONSTRAINT "previsao_snapshot_meta_id_meta_id_fk" FOREIGN KEY ("meta_id") REFERENCES "public"."meta"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "atividade_data_local_idx" ON "atividade" USING btree ("data_local");--> statement-breakpoint
CREATE INDEX "atividade_modalidade_data_idx" ON "atividade" USING btree ("modalidade","data_local");--> statement-breakpoint
CREATE INDEX "prescricao_data_idx" ON "prescricao" USING btree ("data");