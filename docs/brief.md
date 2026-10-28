# Brief para o Claude Code — App "Treino 26/27"

> Cola este ficheiro como primeira mensagem num repositório vazio.
> Primeiro passo do Claude Code: ler tudo, gerar o `CLAUDE.md` do projeto a partir deste brief (secções 1, 2, 9 e 10 na íntegra), propor o esquema da BD e só depois implementar, fase a fase (secção 11). No fim de cada fase corre os testes de aceitação dessa fase e para.

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

## 3. Dados do atleta (seed — com histórico por data efetiva)

Todas as constantes guardam-se numa tabela com `data_efetiva`, porque **após cada teste as potências de todos os treinos são recalculadas** com o valor válido à data do treino.

| Constante | Valor | Nota |
|---|---|---|
| FTP de trabalho | 211 W | Rampa Zwift 22/10/2026 deu 216 W; confirmar qual fica como "de trabalho" |
| FCmax | 190 | sprint final 27/09/2026 |
| FC repouso | *(preencher)* | necessário para TRIMP / %FCR |
| Zonas FC (Strava) | Z1 ≤124 · Z2 125-154 · Z3 155-169 · Z4 170-184 · Z5 ≥185 | |
| Peso | 79 kg | alvo ≤ 76 kg em agosto 2027 |
| Bike + equipamento | 12,5 + 6 kg | |
| Relação mais leve | 34/51 | |
| Corrida — referências | 10/08: 5 km a 6:21/km, FC ~158 · 10/10: 6,65 km a 6:38/km, FC 162 · melhor 5 km Strava: 30:00 | |
| Corrida — teto "fácil" | 152 bpm | regra da fase; pode subir em subidas |

Equipamento: rolo Kickr Core + Zwift (testes e blocos em ERG), GPS Bryton Rider S810 (barómetro) no BTT. **Potenciómetro só no rolo** — no BTT não há potência, só FC, velocidade, altitude, cadência.

## 4. Fonte de dados

**Primária: Strava API** (app própria, OAuth, single-athlete).
- Backfill desde **01/01/2026** (início do treino estruturado — chega para o CTL convergir sem seed manual).
- Streams por atividade: `time, distance, latlng, altitude, velocity_smooth, heartrate, cadence, watts, grade_smooth, moving, temp`.
- Sincronização contínua via **webhook do Strava** (push na criação/edição de atividade) + job de reconciliação diário.
- Respeitar os rate limits (por omissão 100 pedidos/15 min e 1000/dia de leitura — confirmar na documentação atual). Fila com backoff; o backfill pode demorar mais de um dia, tudo bem.
- Guardar streams brutos (comprimidos) — todos os cálculos têm de poder ser refeitos quando o modelo mudar.

**Secundária: upload manual de FIT/GPX** (para percursos-alvo e atividades que não estejam no Strava).

*Não usar intervals.icu como fonte: atividades que lá chegam via Strava não ficam acessíveis pela API deles.* (verificar; se a minha conta tiver sync direta do Zwift, pode servir de fonte extra de potência).

Classificação de modalidade: `Run/TrailRun` → corrida · `VirtualRide` ou `trainer=true` → Zwift · `MountainBikeRide` / `Ride` exterior → BTT · resto → outros (ténis de mesa, força).

## 5. Prescrições vindas do chat "Época 26/27"

O chat não consegue escrever na app sozinho. Solução em dois níveis:

**Nível 1 (MVP): contrato JSON + importação.** O chat passa a terminar cada prescrição/avaliação com um bloco JSON (ver Anexo A). Na app há um campo "Importar do chat" onde colo o bloco; a app valida (Zod), faz upsert por `id` e mostra o diff antes de gravar. Aceita vários itens de uma vez e também a semana completa.

**Nível 2 (fase 7): conector MCP remoto.** A app expõe um servidor MCP (`/mcp`, autenticado — OAuth conforme a especificação MCP, nunca aberto) que adiciono no claude.ai como conector. O chat passa a chamar diretamente:
`criar_prescricao`, `atualizar_prescricao`, `listar_semana`, `obter_avaliacao(atividade)`, `obter_previsoes`, `obter_forma`.
Assim "todos os treinos prescritos e avaliados na conversa refletem-se na app" sem copiar nada — e o chat lê as avaliações da app em vez de as recalcular.

Associação prescrição ↔ atividade: automática por data + modalidade + duração (± tolerância); se houver ambiguidade, pedir confirmação na UI. Estados: `planeado · feito · parcial · falhado · substituído`.

## 6. Avaliação de cada treino

Toda a avaliação é **determinística e explicável** — cada nota mostra a decomposição. Nada de caixa negra.

### 6.1 Esforço (carga)
- **Zwift:** TSS por potência (NP, IF com o FTP válido à data).
- **Corrida:** rTSS por pace ajustado ao declive (GAP, secção 7.1) relativo ao pace de limiar estimado; fallback hrTSS.
- **BTT:** hrTSS (TRIMP normalizado: 1 h ao LTHR = 100).
- Guardar também TRIMP, distribuição por zonas e o Relative Effort do Strava (para comparar).
- Escala 0-10 apresentada ao lado do TSS.

### 6.2 Produtividade (0-100)
Com prescrição:
- **Cumprimento da estrutura (40):** detetar blocos (intervalos por potência no Zwift; por pace/FC na corrida) e casar com os blocos prescritos — duração, alvo (±3% em ERG, teto de FC respeitado, pace no intervalo).
- **Intenção respeitada (30):** "fácil é fácil" (% tempo acima do teto), arranque controlado, recuperações cumpridas.
- **Duração / volume (15):** ±10% do prescrito.
- **Regras da fase (15):** sem dois dias de qualidade seguidos, nada de qualidade no dia a seguir ao ténis, progressão ≤ +10% km/semana na corrida.

Sem prescrição: avaliar só contra as regras da fase e contra a intenção inferida (fácil / qualidade / longo).

Feedback em frases curtas e diretas, geradas por regras (ex.: "Corrida fácil com 38% do tempo acima de 152 bpm — não foi fácil.").

### 6.3 Contributo para a meta
Para cada treino, mostrar se e quanto alterou a previsão da meta associada (delta de segundos), quando o modelo o permitir.

## 7. Motores de previsão — o núcleo da app

Regra geral para os dois motores:
- Devolvem **estimativa central + intervalo 80% + probabilidade de bater o alvo** (bootstrap por sessão, não por amostra).
- Mostram **"se a prova fosse hoje"** e **"projeção para o dia da prova"** (tendência com rendimentos decrescentes, limitada).
- Mostram **suficiência de dados** (n sessões, cobertura) e recusam dar número se os dados não chegarem — mostram o que falta.
- Snapshot diário guardado → gráfico da previsão ao longo do tempo com a linha da meta.

### 7.1 Corrida 10 km — pace em função da FC

Problema: treino a ~155 bpm, a prova vai ser > 170. Pace de treino ≠ pace de prova.

**Pré-processamento por corrida**
1. Remover paragens (`moving=false`, v < 1,5 m/s) e os primeiros 8 min (aquecimento + cinética da FC).
2. Pace ajustado ao declive com o custo energético de Minetti:
   `C(i) = 155.4i⁵ − 30.4i⁴ − 43.3i³ + 46.3i² + 19.5i + 3.6` (J/kg/m, i = declive em fração, calculado sobre janelas ≥ 30 m)
   `v_GAP = v · C(i) / C(0)`
3. Atraso da FC: alinhar a FC ~20 s à frente do ritmo (parametrizável).
4. Janelas estáveis de 2-3 min (CV da velocidade < 5%); descartar picos/quedas de FC impossíveis (artefactos do sensor).

**Modelo A — relação FC → velocidade (principal)**
- Regressão robusta (Huber) sobre as janelas das últimas 6 semanas, ponderada por recência (meia-vida 14 dias):
  `v_GAP = a + b·FC + c·t_decorrido` (o termo `t` absorve a deriva cardíaca).
- Velocidade de prova = modelo avaliado na **FC média de prova** para ~60 min. FC de prova: parâmetro (default 172), substituído automaticamente por um valor derivado dos dados quando houver esforços fortes (ex.: teste de 5 km: FC média − ~3 bpm).
- Tabela de sensibilidade sempre visível: tempo previsto a 168 / 172 / 176 bpm.
- **Aviso explícito de extrapolação**: se o máximo de FC nas janelas usadas estiver > 10 bpm abaixo da FC de prova, marcar a previsão como extrapolada e alargar o intervalo.

**Modelo B — esforços máximos reais (âncora)**
- Melhores esforços (best efforts do Strava + blocos de qualidade detetados) convertidos para 10 km com Riegel: `T₂ = T₁·(D₂/D₁)^1.06`.
- O **teste de 5 km (~15/11)** é a âncora principal quando existir. Regra do plano: < 28:00 no 5 km → alvo 57-58'.

**Fator de durabilidade (heurístico, documentado)**
- Penalização se a corrida contínua mais longa dos últimos 21 dias < 50 min ou se o volume semanal < 20 km. Valores configuráveis, marcados como heurística na UI.

**Combinação**: média ponderada A/B por qualidade de dados (B pesa mais quanto mais recente e mais longo o esforço). Mostrar os dois valores lado a lado; se divergirem > 4%, destacar.

**Tendência**: eficiência = velocidade GAP a 150 bpm, por sessão → curva de evolução e projeção para 26/12.

**Percurso**: se eu carregar o GPX da prova, aplicar o perfil (GAP inverso por troço); senão, assumir plano.

### 7.2 BTT — Rota da Primavera < 2h

Dois estimadores independentes + combinação. O primeiro é o que pedi; o segundo existe porque só faço BTT na rua 2-3×/mês e o terreno (alcatrão vs trilho) pesa tanto como o declive — a inclinação sozinha não chega.

**Segmentação do percurso-alvo** (`18330245057`, e qualquer percurso futuro)
1. Reamostrar a uma grelha de 25 m de distância.
2. Altitude suavizada (mediana móvel ~100 m; a altitude do S810 é barométrica — usar a do ficheiro, não a corrigida por DEM).
3. Declive em janelas de 100 m → intervalos: `≤−10 · −10/−6 · −6/−3 · −3/−1 · −1/+1 · +1/+3 · +3/+5 · +5/+7 · +7/+9 · +9/+12 · >+12 %`.
4. Fundir em segmentos homogéneos com comprimento mínimo de 150 m.
5. Guardar por segmento: distância, declive médio, tempo e velocidade de 2026, FC de 2026.

**Filtro de esforço nos treinos BTT** (regra central)
- Mesma segmentação em todas as voltas BTT.
- FC do segmento avaliada com atraso (~20-30 s à frente).
- **Plano e subidas (declive ≥ −1%)**: só contam segmentos com FC média ≥ **160 bpm** (parametrizável) **e** ≥ 70% do tempo acima de 155. Isto exclui automaticamente as voltas em conversa (17-18 km/h) e com o meu filho (~10 km/h), sem depender de etiquetas.
- **Descidas (< −1%)**: a velocidade depende de técnica e terreno, não da FC. Usar só descidas de voltas "com esforço" (≥ 20% do tempo da volta acima de 160 bpm), para não contaminar com voltas lentas. Atividades com a etiqueta Strava `WITH_KID` ficam fora das descidas.
- Excluir paragens (< 3 km/h). Troços a pé em rampas fortes (cadência 0, v < 6 km/h) marcados à parte, não descartados.

**Estimador A — empírico por segmento**
Para cada segmento do percurso, velocidade prevista pela hierarquia:
1. **Mesmo troço geográfico** (sobreposição ≥ 70% dentro de um buffer de 25 m) feito em esforço → peso 3×.
2. Mesmo intervalo de declive, voltas recentes em esforço (meia-vida 28 dias).
3. Interpolação entre intervalos vizinhos.
4. Fallback para o estimador B.
Tempo previsto = Σ distância / velocidade.

**Estimador B — física calibrada com o Zwift**
1. Do Zwift: relação **FC → potência** atual (secção 8).
2. Calibração em 2026: aplicar a relação FC→W de abril/maio 2026 à FC registada em cada segmento da Rota 2026 → potência estimada por segmento → ajustar um `Crr_efetivo` por classe de declive para o modelo reproduzir os tempos reais de 2026. (A diferença de FC interior/exterior fica absorvida nesta calibração.)
3. Modelo: `P·η = v·m·g·(sin θ + Crr·cos θ) + ½·ρ·CdA·v³`, com m = peso atual + 12,5 + 6 kg, η = 0,97, ρ = 1,2, CdA = 0,5 (parametrizáveis).
4. Previsão: perfil de FC alvo da prova → potência atual por segmento → velocidade → tempo.

**Cenários de pacing** (aplicados aos dois estimadores)
- "Como em 2026": perfil de FC real de 2026.
- "Arranque controlado": FC ≤ 168 até ao km 10 (lição repetida em 3 provas), depois perfil de prova.

**Combinação e saída**
- Média ponderada A/B por cobertura (% da distância do percurso coberta por dados de nível 1-2 no estimador A). Divergência > 5% → destacar.
- Tabela por segmento: tempo 2026 · previsto · **necessário para 2:00:00**. O "necessário" distribui a poupança pelos segmentos onde a forma conta (plano e subida), mantendo as descidas.
- Marcos do plano visíveis: subida de 10% < 12 min.
- Mapa do percurso com segmentos coloridos por diferença previsto vs necessário.
- Indicador de progresso: `(T_2026 − T_previsto) / (T_2026 − T_meta)`.

## 8. Análise Zwift (FC/W e potências sustentadas)

- **Blocos estáveis**: janelas de 3 min com CV da potência < 5%, sem os primeiros 2 min de cada bloco (cinética da FC).
- Por sessão: regressão `FC = α + β·P` → **FC a 150 / 180 / 200 W** e **W a 150 / 160 bpm**.
- **EF** (NP / FC média) em sessões Z2; **desacoplamento Pa:HR** (1.ª vs 2.ª metade) em sessões estáveis ≥ 60 min (< 5% = boa durabilidade).
- **Evolução**: tendência com mediana móvel de 4 semanas e declive com IC 95%. A UI diz "melhorou / piorou / inconclusivo" — **nunca "melhorou" se o IC incluir zero**.
- **Tempo segurado por potência**: curva de potência média máxima (5 s → 60 min), janelas 30/90 dias vs período anterior; tempo acumulado por semana ≥ 88% e ≥ 95% do FTP; bloco contínuo mais longo ≥ X W por sessão.
- **CP / W'** (modelo de 2 parâmetros sobre MMP 3-20 min). Aviso: em ERG a potência é imposta, não máxima — a curva é "observada", não "máxima", exceto em testes.
- Contexto guardado por sessão: TSB do dia, hora, temperatura (se houver).

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

## 11. Stack e fases

**Stack (decidido)**: TypeScript em tudo — um só ecossistema, um só deploy.
- Next.js (App Router) · Postgres + Drizzle · pg-boss para jobs (fila em Postgres, sem Redis) · Zod · Vitest.
- Parsing FIT: `@garmin/fitsdk`. GPX: parser leve. Mapas: MapLibre/Leaflet com OSM. Gráficos: ECharts ou uPlot.
- Toda a matemática em `src/lib/analysis/*` como **funções puras**, com testes unitários e fixtures de atividades reais (incluir os streams da Rota 2026).
- Deploy: Dockerfile para **Coolify no meu VPS** (Contabo, Ubuntu 24.04). Postgres no Coolify. HTTPS por subdomínio.
- Auth: utilizador único (password em env + cookie de sessão). Segredos do Strava só em env.

**Fases** (cada uma termina com testes verdes e paragem para eu validar)

| Fase | Entrega | Aceitação |
|---|---|---|
| 0 | Repo, CLAUDE.md, Docker, BD, auth | Sobe local e no Coolify |
| 1 | OAuth Strava, backfill desde 01/01/2026, webhook, streams guardados | Todas as atividades de 2026 com streams; atividade nova aparece em < 2 min |
| 2 | Constantes com data efetiva, TSS/TRIMP, CTL/ATL/TSB, análise Zwift (secção 8) | CTL/ATL de hoje dentro de ±3 do intervals.icu |
| 3 | Motor de corrida (7.1) | **Backtest**: prever cada esforço forte de corrida só com dados anteriores → erro mediano < 3% |
| 4 | Motor BTT (7.2) | **Backtest 1**: prever a Rota 2026 só com dados até 30/04/2026, usando o perfil de FC real → erro < 4% sobre 2:17:43. **Backtest 2**: o mesmo para o 3 Cumes 2026 e a Trofa 2026 (percursos diferentes — prova que o motor é genérico) |
| 5 | Prescrições (import JSON), associação a atividades, avaliações (6) | Importar o Anexo B; associar e avaliar uma semana real |
| 6 | Painel completo (10), PWA, snapshots diários das previsões | Painel utilizável no telemóvel |
| 7 | Servidor MCP remoto autenticado (5, nível 2) | O chat no claude.ai cria uma prescrição que aparece na app |

**Regras para o Claude Code**
- Se um backtest falhar o critério, não ajustar parâmetros à mão até passar: reportar o erro por segmento/sessão e propor a correção ao modelo.
- Todos os parâmetros dos modelos ficam numa tabela de configuração visível na UI, com o valor default e a origem (dados / heurística).
- Nada de chamadas a LLM dentro da app: avaliações e previsões são cálculo. A conversa fica no chat.
- Antes de cada fase, lista as decisões que tomaste e as que precisam de mim.

---

## Anexo A — Contrato JSON das prescrições/avaliações

```json
{
  "versao": 1,
  "origem": "chat-epoca-26-27",
  "itens": [
    {
      "tipo": "prescricao",
      "id": "2026-10-29-zwift-ss",
      "data": "2026-10-29",
      "modalidade": "zwift",
      "fase": "Fase 1 — Corrida + manutenção BTT",
      "semana": "A",
      "titulo": "SS 3×12' a 182 W",
      "intencao": "qualidade",
      "duracao_min": 60,
      "blocos": [
        { "tipo": "aquecimento", "duracao_s": 600, "alvo": { "potencia_pct_ftp": [55, 65] } },
        { "tipo": "intervalo", "repeticoes": 3, "duracao_s": 720, "alvo": { "potencia_w": 182, "erg": true },
          "recuperacao": { "duracao_s": 300, "alvo": { "potencia_pct_ftp": [50, 55] } } },
        { "tipo": "retorno_calma", "duracao_s": 300, "alvo": { "potencia_pct_ftp": [45, 55] } }
      ],
      "regras": { "fc_teto": null, "cadencia_rpm": null },
      "notas": "ERG. 5' entre blocos.",
      "estado": "planeado"
    },
    {
      "tipo": "avaliacao_chat",
      "atividade_strava_id": "0000000000",
      "prescricao_id": "2026-10-26-corrida-aceleracoes",
      "resumo": "Acelerações longas demais (45\" em vez de 20\"), passada certa (180+ ppm).",
      "ajustes": ["Próximas acelerações a 20\""]
    }
  ]
}
```

Campos de `alvo` aceites: `potencia_w`, `potencia_pct_ftp [min,max]`, `fc_teto`, `fc_intervalo [min,max]`, `pace_s_km [min,max]`, `cadencia [min,max]`, `erg`. `modalidade`: `corrida | zwift | btt | forca | tenis | descanso`. `estado`: `planeado | feito | parcial | falhado | substituido`.

## Anexo B — Semana atual para teste de importação

| Dia | Sessão |
|---|---|
| Qua 28/10 | Corrida fácil 30-35', FC ≤ 152 |
| Qui 29/10 | Zwift SS 3×12' a 182 W, ERG, 5' entre blocos |
| Sex 30/10 | Descanso |
| Sáb 31/10 | Corrida longa 40-45', FC ≤ 152, percurso plano + reforço 12' |
| Dom 01/11 | BTT social ou descanso |

## Anexo C — Instrução para colar no chat "Época 26/27"

> A partir de agora, sempre que prescreveres ou avaliares um treino, termina a resposta com um bloco ```json no formato "versao 1" da app Treino 26/27 (tipos `prescricao` e `avaliacao_chat`). Um item por treino, `id` no formato `aaaa-mm-dd-modalidade-descritor`. Se alterares uma prescrição, repete o mesmo `id` com os campos novos.
