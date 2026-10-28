# Esquema da base de dados

Definido em `src/db/schema.ts` (Drizzle); migrações em `drizzle/`. Princípio: **dados brutos são imutáveis, tudo o que é calculado é recalculável**. Quando uma constante ou um modelo muda, apagam-se e refazem-se as tabelas calculadas a partir dos streams.

Unidades base: metros, segundos, m/s, watts, bpm. Instantes em `timestamptz` (UTC); dias em `date` no fuso de Lisboa.

## Visão geral

| Grupo | Tabela | O que guarda | Natureza |
|---|---|---|---|
| Atleta | `constante` | FTP, FC máx/repouso, LTHR, zonas, peso, massas… com `data_efetiva` | editável |
| | `parametro_modelo` | Todos os parâmetros dos modelos, com valor, default e origem (`dados / heuristica / literatura`) | editável |
| Strava | `strava_conta` | Tokens OAuth (1 linha) | sistema |
| | `atividade` | Resumo de cada atividade + modalidade + flag "com crianças" | bruto |
| | `atividade_stream` | Streams completos em JSON+gzip | bruto, imutável |
| | `melhor_esforco` | Best efforts do Strava (corrida) | bruto |
| | `webhook_evento` | Eventos recebidos do webhook antes de processar | sistema |
| Cálculo | `atividade_metricas` | TSS, método, IF, TRIMP, esforço 0-10, tempo por zona, decomposição | recalculável |
| | `avaliacao` | Produtividade 0-100, componentes, frases de feedback, delta na previsão | recalculável |
| | `carga_diaria` | TSS do dia por modalidade, horas, CTL, ATL, TSB (e dias futuros projetados) | recalculável |
| Metas | `meta` | Prova, data, distância/percurso, alvo, referência | editável |
| | `percurso` | Percurso-alvo (de atividade Strava, GPX ou FIT), pontos reamostrados | editável |
| | `previsao_snapshot` | Previsão diária por meta: hoje, projeção, P10/P90, probabilidade, detalhes | histórico |
| Chat | `importacao` | Cada bloco JSON colado (ou chamada MCP), tal como chegou | histórico |
| | `prescricao` | Prescrições (id do chat), blocos, regras, estado, atividade associada | editável |
| | `prescricao_historico` | Versões anteriores de cada prescrição | histórico |
| | `avaliacao_chat` | Avaliações escritas no chat | histórico |
| Sistema | `sistema_estado` | Heartbeat do worker, progresso do backfill, etc. | sistema |

A fila de jobs do pg-boss vive no schema `pgboss` (criado por ele).

## Decisões

- **Constantes com histórico.** O valor válido numa data é o da maior `data_efetiva <= data`. Antes da primeira linha usa-se a mais antiga, porque não há histórico anterior a 22/10/2026. Na fase 2, o FTP histórico é estimado a partir do Zwift e entra com `origem = estimado`.
- **Zonas de FC** numa só constante (`zonas_fc` = limites superiores de Z1..Z4), iguais em todas as modalidades.
- **Streams** num único blob por atividade (gzip). É simples, compacto (≈100-300 kB por atividade) e chega para um atleta. Os cálculos descomprimem em memória.
- **Modalidades**: `corrida · zwift · btt · tenis · forca · outros` nas atividades. Nas prescrições acrescenta-se `descanso` e não existe `outros`.
- **"Com crianças"** é detetado pelo texto no título ou na descrição e fica guardado na atividade. A regra "ignorar voltas com FC média em Z1" é aplicada no motor BTT (parâmetro `btt.excluir_volta_fc_media_z1`), não aqui.
- **Prescrições alternativas** partilham `grupo_alternativas`. A prescrição cumprida fica `feito` e as outras passam a `substituido`.
- **Upsert por id**: cada alteração incrementa `versao` e guarda a versão anterior em `prescricao_historico`. O diff mostrado antes de gravar compara com a versão atual.
- **Associação prescrição ↔ atividade**: `prescricao.atividade_id` (única) + `associacao` (`auto | confirmada | ambigua | manual`).

## Tabelas que entram em fases seguintes

São adicionadas quando os motores forem implementados, para não fixar já a estrutura:

- Fase 2: blocos estáveis do Zwift e regressão FC/W por sessão, MMP por sessão.
- Fase 3: janelas estáveis de corrida (cache das janelas pré-processadas).
- Fase 4: `percurso_segmento` (segmentos homogéneos do percurso-alvo) e cache de segmentos das voltas BTT.
- Fase 7: clientes e tokens OAuth do servidor MCP.
