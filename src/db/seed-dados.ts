// Valores iniciais (brief §2, §3, §6-§9 e respostas do atleta de 28/10/2026).
// O seed só insere o que ainda não existe: editar na app nunca é desfeito por um novo deploy.

type Origem = "manual" | "teste" | "chat" | "estimado" | "seed";
type OrigemParametro = "dados" | "heuristica" | "literatura";

export const constantesIniciais: {
  chave: string;
  dataEfetiva: string;
  valor?: number;
  valorJson?: unknown;
  origem: Origem;
  nota?: string;
}[] = [
  {
    chave: "ftp_w",
    dataEfetiva: "2026-10-22",
    valor: 216,
    origem: "teste",
    nota: "Ramp test Zwift de 22/10/2026 (método sempre usado para o FTP).",
  },
  { chave: "fc_max", dataEfetiva: "2026-09-27", valor: 190, origem: "teste", nota: "Sprint final 27/09/2026." },
  { chave: "fc_repouso", dataEfetiva: "2026-10-28", valor: 51, origem: "manual" },
  {
    chave: "lthr",
    dataEfetiva: "2026-10-28",
    valor: 170,
    origem: "estimado",
    nota: "Provisório: início da Z4 do Strava. Igual em todas as modalidades.",
  },
  {
    chave: "zonas_fc",
    dataEfetiva: "2026-10-28",
    // Limite superior de Z1..Z4 (Z5 = acima). Z1 ≤124 · Z2 125-154 · Z3 155-169 · Z4 170-184 · Z5 ≥185.
    valorJson: [124, 154, 169, 184],
    origem: "manual",
    nota: "Zonas do Strava, iguais em todas as modalidades.",
  },
  { chave: "fc_teto_facil", dataEfetiva: "2026-10-28", valor: 152, origem: "manual", nota: "Regra da fase; pode subir em subidas." },
  { chave: "peso_kg", dataEfetiva: "2026-10-28", valor: 79, origem: "manual", nota: "Alvo ≤ 76 kg em agosto 2027." },
  { chave: "massa_bike_kg", dataEfetiva: "2026-10-28", valor: 12.5, origem: "manual" },
  { chave: "massa_equipamento_kg", dataEfetiva: "2026-10-28", valor: 6, origem: "manual" },
  { chave: "relacao_mais_leve", dataEfetiva: "2026-10-28", valorJson: [34, 51], origem: "manual" },
];

export const parametrosIniciais: {
  chave: string;
  grupo: string;
  descricao: string;
  unidade?: string;
  valor: unknown;
  origem: OrigemParametro;
}[] = [
  // Carga (§9)
  { chave: "carga.ctl_dias", grupo: "carga", descricao: "Constante de tempo do Fitness (CTL)", unidade: "dias", valor: 42, origem: "literatura" },
  { chave: "carga.atl_dias", grupo: "carga", descricao: "Constante de tempo da Fadiga (ATL)", unidade: "dias", valor: 7, origem: "literatura" },
  { chave: "carga.tss_hora_sem_fc", grupo: "carga", descricao: "TSS por hora de atividades sem FC (ténis, força, outros)", unidade: "TSS/h", valor: 30, origem: "heuristica" },
  { chave: "carga.max_lacuna_s", grupo: "carga", descricao: "Intervalo entre amostras acima do qual é pausa", unidade: "s", valor: 10, origem: "heuristica" },
  { chave: "carga.esforco_escala_tss", grupo: "carga", descricao: "Escala do esforço 0-10: 10·(1 − e^(−TSS/escala))", unidade: "TSS", valor: 100, origem: "heuristica" },

  // Corrida (§7.1)
  { chave: "corrida.aquecimento_descartado_min", grupo: "corrida", descricao: "Minutos iniciais descartados (aquecimento + cinética da FC)", unidade: "min", valor: 8, origem: "heuristica" },
  { chave: "corrida.v_paragem_ms", grupo: "corrida", descricao: "Velocidade abaixo da qual é paragem", unidade: "m/s", valor: 1.5, origem: "heuristica" },
  { chave: "corrida.v_max_ms", grupo: "corrida", descricao: "Velocidade acima da qual a amostra é um salto do GPS (conta como paragem)", unidade: "m/s", valor: 8, origem: "heuristica" },
  { chave: "corrida.janela_declive_min_m", grupo: "corrida", descricao: "Janela mínima para o declive do GAP", unidade: "m", valor: 30, origem: "heuristica" },
  { chave: "corrida.atraso_fc_s", grupo: "corrida", descricao: "Atraso da FC face ao ritmo", unidade: "s", valor: 20, origem: "heuristica" },
  { chave: "corrida.janela_estavel_s", grupo: "corrida", descricao: "Duração das janelas estáveis", unidade: "s", valor: 150, origem: "heuristica" },
  { chave: "corrida.cv_velocidade_max", grupo: "corrida", descricao: "CV máximo da velocidade numa janela estável", unidade: "fração", valor: 0.05, origem: "heuristica" },
  { chave: "corrida.historico_semanas", grupo: "corrida", descricao: "Semanas de dados no modelo FC → velocidade", unidade: "semanas", valor: 6, origem: "heuristica" },
  { chave: "corrida.meia_vida_dias", grupo: "corrida", descricao: "Meia-vida da ponderação por recência", unidade: "dias", valor: 14, origem: "heuristica" },
  { chave: "corrida.fc_prova_default", grupo: "corrida", descricao: "FC média de prova (10 km) até haver esforços fortes", unidade: "bpm", valor: 172, origem: "heuristica" },
  { chave: "corrida.fc_prova_desconto_5k", grupo: "corrida", descricao: "FC de prova = FC média do 5 km menos isto", unidade: "bpm", valor: 3, origem: "heuristica" },
  { chave: "corrida.sensibilidade_fc", grupo: "corrida", descricao: "FC da tabela de sensibilidade", unidade: "bpm", valor: [168, 172, 176], origem: "heuristica" },
  { chave: "corrida.extrapolacao_bpm", grupo: "corrida", descricao: "Diferença máx. entre FC observada e FC de prova antes de marcar extrapolação", unidade: "bpm", valor: 10, origem: "heuristica" },
  { chave: "corrida.riegel_expoente", grupo: "corrida", descricao: "Expoente de Riegel", valor: 1.06, origem: "literatura" },
  { chave: "corrida.durabilidade_longa_min", grupo: "corrida", descricao: "Corrida contínua mais longa (21 d) abaixo da qual há penalização", unidade: "min", valor: 50, origem: "heuristica" },
  { chave: "corrida.durabilidade_volume_km", grupo: "corrida", descricao: "Volume semanal abaixo do qual há penalização", unidade: "km", valor: 20, origem: "heuristica" },
  { chave: "corrida.divergencia_ab", grupo: "corrida", descricao: "Divergência A/B a partir da qual se destaca", unidade: "fração", valor: 0.04, origem: "heuristica" },
  { chave: "corrida.limiar_min_janelas", grupo: "corrida", descricao: "Janelas estáveis mínimas para estimar o limiar pela FC", valor: 15, origem: "heuristica" },
  { chave: "corrida.limiar_dias_esforcos", grupo: "corrida", descricao: "Dias de melhores esforços usados para o limiar", unidade: "dias", valor: 90, origem: "heuristica" },
  { chave: "corrida.suavizacao_cv_s", grupo: "corrida", descricao: "Média móvel onde se mede o CV das janelas estáveis (o ruído de 1 s do GPS não é variação de ritmo)", unidade: "s", valor: 30, origem: "heuristica" },
  { chave: "corrida.min_janelas_modelo", grupo: "corrida", descricao: "Janelas estáveis mínimas para o modelo A (FC → velocidade)", valor: 15, origem: "heuristica" },
  { chave: "corrida.meia_vida_esforcos_dias", grupo: "corrida", descricao: "Meia-vida do peso de um esforço no modelo B", unidade: "dias", valor: 30, origem: "heuristica" },
  { chave: "corrida.fator_ic_extrapolacao", grupo: "corrida", descricao: "Alargamento do intervalo quando a FC de prova é extrapolada", valor: 1.5, origem: "heuristica" },
  { chave: "corrida.penalizacao_durabilidade", grupo: "corrida", descricao: "Penalização no tempo por cada critério de durabilidade falhado", unidade: "fração", valor: 0.02, origem: "heuristica" },
  { chave: "corrida.semanas_tendencia", grupo: "corrida", descricao: "Semanas da tendência da eficiência (projeção)", unidade: "semanas", valor: 12, origem: "heuristica" },
  { chave: "corrida.backtest_fc_min", grupo: "corrida", descricao: "FC média mínima (melhor 5 km/3 km) para um esforço entrar no backtest", unidade: "bpm", valor: 160, origem: "heuristica" },
  { chave: "corrida.fc_eficiencia", grupo: "corrida", descricao: "FC de referência da eficiência (velocidade GAP a X bpm)", unidade: "bpm", valor: 150, origem: "heuristica" },

  // BTT (§7.2)
  { chave: "btt.grelha_m", grupo: "btt", descricao: "Passo da reamostragem", unidade: "m", valor: 25, origem: "heuristica" },
  { chave: "btt.mediana_altitude_m", grupo: "btt", descricao: "Janela da mediana móvel da altitude", unidade: "m", valor: 100, origem: "heuristica" },
  { chave: "btt.janela_declive_m", grupo: "btt", descricao: "Janela do declive", unidade: "m", valor: 100, origem: "heuristica" },
  { chave: "btt.classes_declive", grupo: "btt", descricao: "Limites das classes de declive", unidade: "%", valor: [-10, -6, -3, -1, 1, 3, 5, 7, 9, 12], origem: "heuristica" },
  { chave: "btt.segmento_min_m", grupo: "btt", descricao: "Comprimento mínimo de um segmento", unidade: "m", valor: 150, origem: "heuristica" },
  { chave: "btt.atraso_fc_s", grupo: "btt", descricao: "Atraso da FC face ao segmento", unidade: "s", valor: 25, origem: "heuristica" },
  { chave: "btt.fc_esforco_min", grupo: "btt", descricao: "FC média mínima de um segmento plano/subida para contar", unidade: "bpm", valor: 160, origem: "heuristica" },
  { chave: "btt.fc_esforco_limiar", grupo: "btt", descricao: "FC acima da qual se conta o tempo em esforço", unidade: "bpm", valor: 155, origem: "heuristica" },
  { chave: "btt.fracao_acima_limiar", grupo: "btt", descricao: "Fração mínima do tempo do segmento acima do limiar", unidade: "fração", valor: 0.7, origem: "heuristica" },
  { chave: "btt.fracao_volta_esforco", grupo: "btt", descricao: "Fração da volta acima de 160 bpm para as descidas contarem", unidade: "fração", valor: 0.2, origem: "heuristica" },
  { chave: "btt.excluir_volta_fc_media_z1", grupo: "btt", descricao: "Ignorar voltas com FC média em Z1", valor: true, origem: "heuristica" },
  { chave: "btt.texto_com_criancas", grupo: "btt", descricao: "Texto no título/descrição que marca voltas com crianças", valor: "com crianças", origem: "heuristica" },
  { chave: "btt.v_paragem_kmh", grupo: "btt", descricao: "Velocidade abaixo da qual é paragem", unidade: "km/h", valor: 3, origem: "heuristica" },
  { chave: "btt.v_a_pe_kmh", grupo: "btt", descricao: "Velocidade abaixo da qual (com cadência 0) é troço a pé", unidade: "km/h", valor: 6, origem: "heuristica" },
  { chave: "btt.buffer_troco_m", grupo: "btt", descricao: "Buffer para considerar o mesmo troço geográfico", unidade: "m", valor: 25, origem: "heuristica" },
  { chave: "btt.sobreposicao_troco", grupo: "btt", descricao: "Sobreposição mínima para o mesmo troço", unidade: "fração", valor: 0.7, origem: "heuristica" },
  { chave: "btt.peso_mesmo_troco", grupo: "btt", descricao: "Peso dos dados do mesmo troço", valor: 3, origem: "heuristica" },
  { chave: "btt.meia_vida_dias", grupo: "btt", descricao: "Meia-vida da ponderação por recência", unidade: "dias", valor: 28, origem: "heuristica" },
  { chave: "btt.eta", grupo: "btt", descricao: "Eficiência da transmissão (η)", valor: 0.97, origem: "literatura" },
  { chave: "btt.rho", grupo: "btt", descricao: "Densidade do ar (ρ)", unidade: "kg/m³", valor: 1.2, origem: "literatura" },
  { chave: "btt.cda", grupo: "btt", descricao: "CdA", unidade: "m²", valor: 0.5, origem: "literatura" },
  { chave: "btt.fc_arranque_controlado", grupo: "btt", descricao: "FC máxima no cenário de arranque controlado", unidade: "bpm", valor: 168, origem: "heuristica" },
  { chave: "btt.km_arranque_controlado", grupo: "btt", descricao: "Até que km vale o arranque controlado", unidade: "km", valor: 10, origem: "heuristica" },
  { chave: "btt.zwift_semanas", grupo: "btt", descricao: "Semanas de sessões Zwift na relação FC → W", unidade: "semanas", valor: 6, origem: "heuristica" },
  { chave: "btt.fc_prova_default", grupo: "btt", descricao: "FC por segmento quando não há perfil de referência", unidade: "bpm", valor: 165, origem: "heuristica" },
  { chave: "btt.sport_types_excluidos", grupo: "btt", descricao: "Tipos Strava fora dos estimadores (outra bicicleta)", valor: ["GravelRide", "EBikeRide", "EMountainBikeRide"], origem: "heuristica" },
  { chave: "btt.semanas_tendencia", grupo: "btt", descricao: "Semanas da tendência da potência a 160 bpm (projeção)", unidade: "semanas", valor: 12, origem: "heuristica" },
  { chave: "btt.marco_subida_min", grupo: "btt", descricao: "Marco do plano: tempo-alvo na maior subida (0 = sem marco)", unidade: "min", valor: 12, origem: "heuristica" },
  { chave: "btt.declive_subida_min", grupo: "btt", descricao: "Declive mínimo dos segmentos que formam a maior subida", unidade: "%", valor: 5, origem: "heuristica" },
  {
    chave: "btt.backtests",
    grupo: "btt",
    descricao: "Provas do backtest (atividades Strava; dados só até à véspera)",
    valor: [
      { stravaId: 18330245057, nome: "Rota da Primavera 2026" },
      { stravaId: 20350045096, nome: "3 Cumes 2026" },
      { stravaId: 20633496725, nome: "Raid BTT da Trofa 2026" },
    ],
    origem: "dados",
  },
  { chave: "btt.grupos_sinuosidade", grupo: "btt", descricao: "Fator de terreno: grupos de sinuosidade (quantis dos dados) dentro de cada classe de declive; 1 = desligado", valor: 3, origem: "heuristica" },
  { chave: "btt.divergencia_ab", grupo: "btt", descricao: "Divergência A/B a partir da qual se destaca", unidade: "fração", valor: 0.05, origem: "heuristica" },

  // Zwift (§8)
  { chave: "zwift.janela_estavel_s", grupo: "zwift", descricao: "Duração das janelas estáveis", unidade: "s", valor: 180, origem: "heuristica" },
  { chave: "zwift.cv_potencia_max", grupo: "zwift", descricao: "CV máximo da potência numa janela estável", unidade: "fração", valor: 0.05, origem: "heuristica" },
  { chave: "zwift.descartar_inicio_bloco_s", grupo: "zwift", descricao: "Início de cada bloco descartado (cinética da FC)", unidade: "s", valor: 120, origem: "heuristica" },
  { chave: "zwift.variacao_bloco", grupo: "zwift", descricao: "Variação da média de 30 s que inicia um novo bloco", unidade: "fração", valor: 0.075, origem: "heuristica" },
  { chave: "zwift.limiares_ftp", grupo: "zwift", descricao: "Frações do FTP para o tempo acumulado por semana", unidade: "fração", valor: [0.88, 0.95], origem: "heuristica" },
  { chave: "zwift.ef_if_max", grupo: "zwift", descricao: "IF máximo para uma sessão contar como Z2 no EF", unidade: "fração", valor: 0.75, origem: "heuristica" },
  { chave: "zwift.suavizacao_cv_s", grupo: "zwift", descricao: "Média móvel onde se mede o CV das janelas estáveis (fora do ERG a potência de 1 s oscila muito)", unidade: "s", valor: 30, origem: "heuristica" },
  { chave: "zwift.desacoplamento_bom", grupo: "zwift", descricao: "Desacoplamento Pa:HR abaixo do qual a durabilidade é boa", unidade: "fração", valor: 0.05, origem: "literatura" },

  // Previsões (§7)
  { chave: "previsao.bootstrap_n", grupo: "previsao", descricao: "Reamostragens do bootstrap por sessão", valor: 200, origem: "heuristica" },
  { chave: "previsao.tau_semanas", grupo: "previsao", descricao: "Constante dos rendimentos decrescentes da projeção", unidade: "semanas", valor: 6, origem: "heuristica" },
  { chave: "previsao.ganho_max", grupo: "previsao", descricao: "Melhoria (ou perda) máxima projetada até à prova", unidade: "fração", valor: 0.08, origem: "heuristica" },

  // Avaliação (§6.2)
  { chave: "avaliacao.tolerancia_erg", grupo: "avaliacao", descricao: "Tolerância ao alvo de potência em ERG", unidade: "fração", valor: 0.03, origem: "heuristica" },
  { chave: "avaliacao.tolerancia_duracao", grupo: "avaliacao", descricao: "Tolerância à duração prescrita", unidade: "fração", valor: 0.1, origem: "heuristica" },
  { chave: "avaliacao.progressao_km_semana", grupo: "avaliacao", descricao: "Progressão semanal máxima do volume de corrida", unidade: "fração", valor: 0.1, origem: "heuristica" },
  { chave: "avaliacao.pesos", grupo: "avaliacao", descricao: "Pesos da produtividade (estrutura, intenção, duração, regras)", valor: [40, 30, 15, 15], origem: "heuristica" },
];

export const metasIniciais = [
  {
    nome: "São Silvestre de Viana do Castelo — 10 km",
    tipo: "corrida" as const,
    dataProva: "2026-12-26",
    distanciaM: 10000,
    tempoAlvoS: 60 * 60,
    tempoReferenciaS: 7 * 60 * 10,
    alvoEmMovimento: false,
    notas: "Referência 2025: ~7:00/km sem preparação.",
  },
  {
    nome: "Rota da Primavera 2027 (BTT)",
    tipo: "btt" as const,
    dataProva: "2027-05-01",
    distanciaM: 36000,
    referenciaStravaId: 18330245057,
    tempoReferenciaS: 2 * 3600 + 17 * 60 + 43,
    tempoAlvoS: 2 * 3600,
    alvoEmMovimento: true,
    notas: "Mesmo percurso de 2026: 36,0 km / 793 m D+ em 2:17:43 em movimento.",
  },
];
