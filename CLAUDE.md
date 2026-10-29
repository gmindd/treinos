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
- **FTP de trabalho**: 216 W, desde 22/10/2026 (ramp test do Zwift, confirmado a 29/10/2026). O FTP é **sempre** medido com o ramp test do Zwift. Pode ser alterado na app ou pela conversa "Época 26/27" (import JSON e, na fase 7, MCP).
- **FC repouso**: 51. **LTHR e zonas de FC**: as mesmas em todas as modalidades e editáveis, porque ainda aparecem máximos novos a cada prova.
- **Histórico de constantes anterior a 22/10/2026**: não existe. Antes da primeira data efetiva usa-se o valor mais antigo. Na fase 2 o FTP histórico obtém-se dos ramp tests anteriores no Zwift (FTP = 75% da melhor potência de 1 min) e, se faltarem, estima-se dos dados Zwift (origem `estimado`).
- **Pace de limiar** (rTSS): estimado a partir dos dados.
- **Referência intervals.icu (29/10/2026)**: Fitness (CTL) 39, Fadiga (ATL) 27, Forma +12 (31%). Na tradução PT do intervals.icu o rótulo "Forma" é o CTL e "Fitness %" é o TSB%.
- **Fixtures** com `latlng` reais podem ir para o repositório.

## Stack e convenções

- Next.js 16 (App Router; ler `node_modules/next/dist/docs/` antes de usar APIs, porque há mudanças: `middleware` passou a `proxy.ts`). `cacheComponents` desligado: a app é dinâmica e de um só utilizador.
- Postgres + Drizzle (`src/db/schema.ts`; migrações em `drizzle/`). pg-boss para jobs (schema `pgboss`). Zod para validação. Vitest para testes.
- Código, tabelas e colunas em **português**, sem acentos e em `snake_case` na BD. Unidades base na BD: metros, segundos, m/s, watts, bpm. Datas/horas em `timestamptz` (UTC) e, quando preciso, `data_local` (Europe/Lisbon).
- Um processo `web` (Next.js) e um processo `worker` (pg-boss, `src/worker/`) na mesma imagem Docker; o `scripts/start.ts` arranca os dois em produção.
- Auth: utilizador único, password em `APP_PASSWORD`, cookie de sessão assinado (HMAC com `SESSION_SECRET`), verificado em `src/proxy.ts`.
- Strava (`src/lib/strava/`):
  - Só o worker faz pedidos à API: o web limita-se a pôr jobs na fila (`src/lib/fila.ts`).
  - Os limites de pedidos são lidos dos cabeçalhos e guardados em `sistema_estado`. Ao atingi-los, o job é adiado para a janela seguinte.
  - Os eventos do webhook nunca são confiados: a atividade é sempre pedida de novo ao Strava.
  - `STRAVA_BASE_URL` serve para testar localmente contra um Strava simulado.
- Cálculo (`src/lib/calculo/recalcular.ts`):
  - Um só job (`calculo-recalcular`) refaz tudo a partir dos streams: FTP dos testes, TSS/TRIMP/zonas de cada atividade e CTL/ATL/TSB por dia.
  - Corre depois de cada importação (com 30 s de atraso, para juntar várias), quando se muda uma constante ou um parâmetro, todos os dias às 00:15 e a cada arranque do worker.
  - Os métodos de TSS são: potência (Zwift), rTSS (corrida, GAP face ao limiar estimado), hrTSS (resto, com FC) e `estimado_hora` (sem FC).
  - As janelas estáveis (corrida e Zwift) medem o CV na média móvel de 30 s (`*.suavizacao_cv_s`): com 1 s o ruído do GPS/pedalada não deixava passar quase nenhuma.
- Previsões (`src/lib/analysis/previsao-*.ts`, `btt.ts`, `estatistica.ts`; job `previsao-recalcular` em `src/lib/previsao/calcular.ts`, que corre depois de cada recálculo):
  - Corrida (§7.1): modelo A (Huber v = a + b·FC + c·t, 6 semanas) + modelo B (melhores esforços GAP ≥ 3 km, Riegel), bootstrap por sessão, durabilidade e projeção com rendimentos decrescentes.
  - BTT (§7.2): grelha de 25 m, segmentos por declive, estimador A (mesmo troço → classe → vizinhas → B) e B (física com Crr calibrado e relação FC → W do Zwift, que precisa de ≥ 5 janelas e r² ≥ 0,3).
  - Fator de terreno (`btt.grupos_sinuosidade`, 3; 1 = desligado): dentro de cada classe de declive, A e B usam só os segmentos do mesmo terço de sinuosidade (graus de mudança de direção por 100 m; limites = quantis dos dados).
  - O "tempo em movimento" do resumo do Strava (aparelho) é maior do que o dos streams (Rota +7%, 3 Cumes +11%, Trofa +17%). Os motores trabalham em segundos dos streams; as metas convertem para segundos do Strava com o fator da edição de referência e os backtests comparam com o tempo da prova medido nos streams.
  - Snapshot de hoje (com bootstrap) e semanais desde 02/03/2026 (só valor central) em `previsao_snapshot`; backtests em `sistema_estado` (`previsao.backtests`), página /backtests.
  - Estimativa "próximos 5 dias sem treinar" (`projecaoDescanso` em `carga.ts`): CTL e ATL decaem; desempenho de Banister P = CTL − 2·ATL; fator de tempo 1 − 3%·ΔP/CTL (limitado a ±3%). Guardada em `detalhes.descanso` do snapshot de hoje e desenhada a laranja no gráfico da previsão.
  - Setores da altimetria editáveis no gráfico (`src/app/metas/altimetria-editavel.tsx`): arrastar, criar e remover linhas; os tempos por setor recalculam-se no browser a partir dos segmentos do motor (o total não muda). Os limites ficam em `meta.limites_setores` (null = automáticos).
  - Unidades: o tempo de BTT é sempre o tempo em movimento do Strava. Um GPX que seja uma volta tua (mesmo dia, distância a ±8%) usa o tempo dessa atividade; senão, o fator mediano Strava/streams das voltas recentes.
  - Corrida: metas manuais (distância, D+ — vazio = 10 m/km —, tempo-alvo) e GPX de corrida. O modelo prevê a distância plana equivalente (Minetti: troço a troço com GPX; sem GPX, metade a subir e metade a descer). Metas criadas na app apagam-se; as do seed só saem do painel.
  - Peso das voltas pela distância face à prova, em km-esforço (km + D+/100): `btt.razao_distancia` 1,5 (2× mais longa ou curta pesa 23%). O peso pela posição no esforço (cansaço, `btt.desvio_posicao`) existe mas está desligado: piorou a Rota de +4,4% para +7,6%.
  - O piso não se vê no GPS: nos backtests o plano e as descidas erram ±10% e as subidas ±2%. Essa incerteza entra no intervalo (`btt.incerteza_terreno_*`) nos segmentos sem dados do mesmo troço; nos três backtests o tempo real ficou dentro do intervalo de 80%.
  - Metas a partir de GPX (`/metas/nova`, `src/lib/gpx.ts`): o ficheiro fica em `percurso` (original + pontos em gzip) e a meta aponta para ele. O motor BTT usa-o como alvo (nunca como dado de treino). Com horas no GPX há tempos de referência por segmento; sem horas, a meta distribui-se na proporção do previsto. A página da meta mostra a altimetria, o mapa e os tempos por setor (subidas/plano/descidas) e por zona de declive (hoje vs. necessário). O tempo-alvo e a data editam-se na página.
  - `scripts/backtest-local.ts` corre os backtests com streams reais em `.data/strava-real` (descarregados pelo MCP do Strava, fora do repositório).
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
