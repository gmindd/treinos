@AGENTS.md

# Treino 26/27

App pessoal de treino de um só atleta. O brief completo está em `docs/brief.md`. Este ficheiro guarda o que tem de estar sempre presente: secções 1, 2, 9 e 10 do brief, na íntegra, e as decisões tomadas desde então.

---

## 1. O que é

App pessoal (um só atleta) que:

1. Mostra os treinos que me são **prescritos no chat "Época 26/27"** (claude.ai).
2. Sincroniza as minhas atividades do Strava (corrida, Zwift, BTT) e **avalia cada treino** em **esforço** e **produtividade**.
3. Calcula **Fitness / Fadiga / Forma** (CTL / ATL / TSB).
4. **Estima com precisão a distância a que estou de cada meta**, com intervalo de confiança, e mostra a evolução dessa estimativa ao longo do tempo.

Idioma da UI: **português europeu**. Fuso: `Europe/Lisbon`. Unidades métricas, pace em min/km, datas `dd/mm/aaaa`.

## 2. Metas iniciais (editáveis na app)

| # | Meta | Data | Alvo | Referência atual |
|---|---|---|---|---|
| 1 | São Silvestre — 10 km corrida | 26/12/2026 | **< 60:00** | 2025: ~7:00/km sem preparação |
| 2 | Rota da Primavera — mesmo percurso de 2026 (BTT) | 01/05/2027 | **< 2:00:00 em movimento** | 2026: 36,0 km / 793 m D+ em **2:17:43** em movimento (Strava `18330245057`) |

Metas têm de ser genéricas: tipo (corrida / BTT), data, distância ou percurso (atividade Strava ou GPX/FIT), tempo-alvo. Mais tarde entra o 3 Cumes 2027 (2h45) com o mesmo motor.

> A São Silvestre é a de **Viana do Castelo**.

## 9. Carga: Fitness / Fadiga / Forma

- CTL (42 d) e ATL (7 d) exponenciais sobre o TSS combinado de todas as modalidades; TSB = CTL − ATL (também em %).
- Calculado desde o backfill; campo opcional de seed manual para alinhar com o intervals.icu numa data.
- Projeção da Forma até à próxima prova com base nas prescrições futuras (TSS estimado de cada prescrição).

## 10. Painel (ordem fixa, mobile-first)

1. **Próximos treinos prescritos** (hoje + próximos 7 dias), com estado.
2. **Gráfico das últimas 8-12 semanas** por modalidade (horas ou TSS empilhado: corrida / Zwift / BTT / outros).
3. **Últimas 3 atividades** com esforço (0-10 + TSS) e produtividade (0-100).
4. **Fitness / Fadiga / Forma** (gráfico + valores de hoje).
5. **Previsões**: um cartão por meta — "hoje", "projeção", intervalo, probabilidade, distância à meta, gráfico da evolução da previsão.

Páginas extra: detalhe da atividade (avaliação decomposta, gráficos, mapa) · detalhe da previsão BTT (tabela de segmentos + mapa) · análise Zwift · constantes e histórico · importar do chat.

PWA instalável. Gráficos legíveis em 380 px de largura.

---

## Regras de trabalho (secção 11 do brief)

- Trabalhar **fase a fase** (tabela em `docs/brief.md` §11). No fim de cada fase: testes verdes, correr a aceitação dessa fase e **parar** para o atleta validar.
- Antes de cada fase: listar as decisões tomadas e as que precisam do atleta.
- Se um backtest falhar o critério, **não afinar parâmetros à mão até passar**: reportar o erro por segmento/sessão e propor a correção ao modelo.
- Todos os parâmetros dos modelos vivem na tabela `parametro_modelo` (valor, default, origem `dados | heuristica | literatura`) e são visíveis na UI.
- **Nada de chamadas a LLM dentro da app.** Avaliações e previsões são cálculo determinístico e explicável (cada nota mostra a decomposição).
- Toda a matemática em `src/lib/analysis/*` como **funções puras** com testes Vitest e fixtures de atividades reais.
- Streams brutos guardados comprimidos: tudo tem de poder ser recalculado quando o modelo ou as constantes mudam.

## Respostas do atleta (28/10/2026) que completam o brief

- **Semanas A/B**: ignorar. O ténis de mesa passa a ser prescrito como qualquer treino.
- **Voltas com crianças**: o atleta escreve "com crianças" no título ou na descrição da atividade no Strava (a API não expõe etiquetas). Além disso, **voltas BTT com FC média em Z1 são ignoradas** nos estimadores.
- **Ténis de mesa e força**: registados no Strava e **entram no CTL** (hrTSS se houver FC; senão TSS estimado por hora, parâmetro).
- **Prescrições alternativas** ("BTT social ou descanso"): itens separados com o mesmo `grupo_alternativas`. Se um for cumprido, os outros passam a `substituido`.
- **Reforço/força** depois de uma corrida: prescrição separada com `modalidade: "forca"`.
- **FTP de trabalho**: 211 W, desde 22/10/2026. Pode ser alterado na app ou pela conversa "Época 26/27" (import JSON e, na fase 7, MCP).
- **FC repouso**: 51. **LTHR e zonas de FC**: as mesmas em todas as modalidades e editáveis, porque ainda aparecem máximos novos a cada prova.
- **Histórico de constantes anterior a 22/10/2026**: não existe. Antes da primeira data efetiva usa-se o valor mais antigo. Na fase 2 estima-se o FTP histórico a partir dos dados Zwift (linhas com origem `estimado`).
- **Pace de limiar** (rTSS): estimado a partir dos dados.
- **Fixtures** com `latlng` reais podem ir para o repositório.

## Stack e convenções

- Next.js 16 (App Router; ler `node_modules/next/dist/docs/` antes de usar APIs, porque há mudanças: `middleware` passou a `proxy.ts`). `cacheComponents` desligado: a app é dinâmica e de um só utilizador.
- Postgres + Drizzle (`src/db/schema.ts`; migrações em `drizzle/`). pg-boss para jobs (schema `pgboss`). Zod para validação. Vitest para testes.
- Código, tabelas e colunas em **português**, sem acentos e em `snake_case` na BD. Unidades base na BD: metros, segundos, m/s, watts, bpm. Datas/horas em `timestamptz` (UTC) e, quando preciso, `data_local` (Europe/Lisbon).
- Um processo `web` (Next.js) e um processo `worker` (pg-boss, `src/worker/`) na mesma imagem Docker; o `scripts/start.ts` arranca os dois em produção.
- Auth: utilizador único, password em `APP_PASSWORD`, cookie de sessão assinado (HMAC com `SESSION_SECRET`), verificado em `src/proxy.ts`.
- Segredos só em variáveis de ambiente (`.env` local, Coolify em produção). Nunca no repositório.
- Local sem Docker: `npm run dev` arranca um Postgres embutido (`embedded-postgres`, dados em `.data/`), aplica migrações e seed, e lança web + worker.
- Deploy: Coolify no VPS (Contabo, Ubuntu 24.04), domínio `treinos.pereiragabriel.com`. Guia em `docs/deploy-coolify.md`.

## Comandos

```bash
npm run dev          # Postgres local + migrações + seed + web + worker
npm test             # Vitest
npm run typecheck    # tsc --noEmit
npm run db:generate  # gera migração a partir de src/db/schema.ts
npm run build        # build de produção (Next standalone + worker)
```
