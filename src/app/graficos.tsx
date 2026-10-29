// Gráficos simples em SVG (desenhados no servidor, legíveis a 380 px).
import { formatarData, formatarDuracao, formatarNumero } from "@/lib/formato";

export const COR_MODALIDADE: Record<string, string> = {
  corrida: "#ea580c",
  zwift: "#7c3aed",
  btt: "#16a34a",
  outros: "#71717a",
};

const L = 360;

type PontoCarga = { data: string; ctl: number; atl: number; tsb: number };

/** CTL (azul) e ATL (roxo) em cima; TSB em barras (verde ≥ 0, vermelho < 0) em baixo. */
export function GraficoCarga({ pontos }: { pontos: PontoCarga[] }) {
  if (pontos.length < 2) return null;
  const A = 140;
  const B = 50;
  const max = Math.max(10, ...pontos.flatMap((p) => [p.ctl, p.atl])) * 1.1;
  const maxTsb = Math.max(10, ...pontos.map((p) => Math.abs(p.tsb)));
  const x = (i: number) => (i / (pontos.length - 1)) * L;
  const y = (v: number) => A - (v / max) * A;
  const linha = (k: "ctl" | "atl") => pontos.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[k]).toFixed(1)}`).join("");
  const largura = Math.max(1, L / pontos.length - 0.5);
  const meio = A + 12 + B / 2;

  return (
    <figure className="flex flex-col gap-1">
      <svg viewBox={`0 0 ${L} ${A + B + 30}`} className="w-full" role="img" aria-label="Fitness, Fadiga e Forma">
        {[0.25, 0.5, 0.75].map((f) => (
          <g key={f}>
            <line x1={0} x2={L} y1={y(max * f)} y2={y(max * f)} stroke="currentColor" strokeOpacity={0.1} />
            <text x={2} y={y(max * f) - 2} fontSize={9} fill="currentColor" opacity={0.5}>
              {Math.round(max * f)}
            </text>
          </g>
        ))}
        <path d={linha("ctl")} fill="none" stroke="#0284c7" strokeWidth={2} />
        <path d={linha("atl")} fill="none" stroke="#9333ea" strokeWidth={1.2} />
        <line x1={0} x2={L} y1={meio} y2={meio} stroke="currentColor" strokeOpacity={0.3} />
        {pontos.map((p, i) => {
          const h = (Math.abs(p.tsb) / maxTsb) * (B / 2);
          return (
            <rect
              key={p.data}
              x={x(i) - largura / 2}
              y={p.tsb >= 0 ? meio - h : meio}
              width={largura}
              height={h}
              fill={p.tsb >= 0 ? "#16a34a" : "#dc2626"}
              opacity={0.7}
            />
          );
        })}
        <text x={0} y={A + B + 28} fontSize={9} fill="currentColor" opacity={0.6}>
          {formatarData(pontos[0].data)}
        </text>
        <text x={L} y={A + B + 28} fontSize={9} fill="currentColor" opacity={0.6} textAnchor="end">
          {formatarData(pontos.at(-1)!.data)}
        </text>
      </svg>
      <figcaption className="flex gap-3 text-xs text-zinc-600 dark:text-zinc-400">
        <span style={{ color: "#0284c7" }}>━ Fitness (CTL)</span>
        <span style={{ color: "#9333ea" }}>━ Fadiga (ATL)</span>
        <span>▮ Forma (TSB)</span>
      </figcaption>
    </figure>
  );
}

export type Semana = { inicio: string; valores: Record<string, number> };

/** Barras empilhadas por semana e modalidade (corrida / Zwift / BTT / outros). */
export function GraficoSemanas({ semanas, unidade }: { semanas: Semana[]; unidade: string }) {
  if (!semanas.length) return null;
  const A = 140;
  const ordem = ["corrida", "zwift", "btt", "outros"];
  const totais = semanas.map((s) => ordem.reduce((t, m) => t + (s.valores[m] ?? 0), 0));
  const max = Math.max(1, ...totais) * 1.1;
  const passo = L / semanas.length;
  const larg = passo * 0.7;

  return (
    <figure className="flex flex-col gap-1">
      <svg viewBox={`0 0 ${L} ${A + 20}`} className="w-full" role="img" aria-label={`${unidade} por semana`}>
        {semanas.map((s, i) => {
          let topo = A;
          return (
            <g key={s.inicio}>
              {ordem.map((m) => {
                const h = ((s.valores[m] ?? 0) / max) * A;
                topo -= h;
                return h > 0 ? (
                  <rect key={m} x={i * passo + (passo - larg) / 2} y={topo} width={larg} height={h} fill={COR_MODALIDADE[m]} />
                ) : null;
              })}
              <text x={i * passo + passo / 2} y={topo - 3} fontSize={8} textAnchor="middle" fill="currentColor" opacity={0.7}>
                {totais[i] ? (unidade === "h" ? formatarNumero(totais[i], 1) : Math.round(totais[i])) : ""}
              </text>
              <text x={i * passo + passo / 2} y={A + 14} fontSize={8} textAnchor="middle" fill="currentColor" opacity={0.6}>
                {s.inicio.slice(8, 10)}/{s.inicio.slice(5, 7)}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="flex flex-wrap gap-3 text-xs text-zinc-600 dark:text-zinc-400">
        {ordem.map((m) => (
          <span key={m} style={{ color: COR_MODALIDADE[m] }}>
            ■ {m === "zwift" ? "Zwift" : m === "btt" ? "BTT" : m === "corrida" ? "Corrida" : "Outros"}
          </span>
        ))}
        <span>· {unidade} por semana (início à segunda)</span>
      </figcaption>
    </figure>
  );
}

/** Linha simples de uma série (ex.: tendência de uma métrica do Zwift). */
export function Sparkline({ valores, cor = "#0284c7" }: { valores: number[]; cor?: string }) {
  if (valores.length < 2) return null;
  const A = 30;
  const W = 120;
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  const y = (v: number) => (max === min ? A / 2 : A - ((v - min) / (max - min)) * A);
  const d = valores.map((v, i) => `${i ? "L" : "M"}${((i / (valores.length - 1)) * W).toFixed(1)},${y(v).toFixed(1)}`).join("");
  return (
    <svg viewBox={`0 0 ${W} ${A}`} className="h-8 w-28" aria-hidden>
      <path d={d} fill="none" stroke={cor} strokeWidth={1.5} />
    </svg>
  );
}

type PontoPrevisao = { data: string; hoje: number | null; projecao: number | null };

/** Data curta: "2026-10-29" → "29/10". */
const diaMes = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/**
 * Evolução da previsão (hoje e projeção) com a linha da meta; eixo em minutos. Cada ponto
 * mostra a data e os valores ao passar o rato. `futuro`: estimativa dos próximos dias sem
 * treinar, a laranja depois da linha "hoje".
 */
export function GraficoPrevisao({
  pontos,
  alvoS,
  futuro = [],
}: {
  pontos: PontoPrevisao[];
  alvoS: number;
  futuro?: { data: string; tempoS: number }[];
}) {
  const validos = pontos.filter((p) => p.hoje != null || p.projecao != null);
  if (validos.length < 2) return null;
  const A = 120;
  const n = validos.length + futuro.length;
  const vals = [...validos.flatMap((p) => [p.hoje, p.projecao]), ...futuro.map((f) => f.tempoS)].filter((v): v is number => v != null);
  const min = Math.min(alvoS, ...vals) * 0.98;
  const max = Math.max(alvoS, ...vals) * 1.02;
  const x = (i: number) => 6 + (i / Math.max(1, n - 1)) * (L - 12);
  const y = (v: number) => A - ((v - min) / (max - min)) * A;
  const linha = (k: "hoje" | "projecao") =>
    validos
      .map((p, i) => (p[k] != null ? `${x(i).toFixed(1)},${y(p[k] as number).toFixed(1)}` : null))
      .filter(Boolean)
      .map((c, i) => `${i ? "L" : "M"}${c}`)
      .join("");
  const iHoje = validos.length - 1;
  const ultimoHoje = validos[iHoje].hoje;
  const linhaFuturo =
    futuro.length && ultimoHoje != null
      ? [`M${x(iHoje).toFixed(1)},${y(ultimoHoje).toFixed(1)}`, ...futuro.map((f, k) => `L${x(iHoje + 1 + k).toFixed(1)},${y(f.tempoS).toFixed(1)}`)].join("")
      : "";
  const min2 = (v: number) => `${Math.floor(v / 60)}'`;
  const fmt = (v: number | null) => (v != null ? formatarDuracao(v) : "—");
  // Datas no eixo: ~5 marcas espaçadas, mais a de hoje.
  const datas = [...validos.map((p) => p.data), ...futuro.map((f) => f.data)];
  const passo = Math.max(1, Math.round(n / 5));
  const marcas = datas.map((d, i) => ({ d, i })).filter(({ i }) => i % passo === 0 && Math.abs(i - iHoje) >= passo / 2);
  return (
    <figure className="flex flex-col gap-1">
      <svg viewBox={`0 0 ${L} ${A + 22}`} className="w-full" role="img" aria-label="Evolução da previsão">
        <line x1={0} x2={L} y1={y(alvoS)} y2={y(alvoS)} stroke="#16a34a" strokeDasharray="4 3" />
        <text x={L} y={y(alvoS) - 3} fontSize={9} fill="#16a34a" textAnchor="end">
          meta {min2(alvoS)}
        </text>
        <text x={2} y={9} fontSize={9} fill="currentColor" opacity={0.5}>
          {min2(max)}
        </text>
        <text x={2} y={A - 2} fontSize={9} fill="currentColor" opacity={0.5}>
          {min2(min)}
        </text>
        {futuro.length > 0 && (
          <g>
            <line x1={x(iHoje)} x2={x(iHoje)} y1={0} y2={A} stroke="currentColor" strokeOpacity={0.25} strokeDasharray="2 2" />
            <text x={x(iHoje)} y={A + 9} fontSize={8} fill="currentColor" opacity={0.7} textAnchor="middle">
              hoje
            </text>
          </g>
        )}
        <path d={linha("projecao")} fill="none" stroke="#9333ea" strokeWidth={1.2} strokeDasharray="3 2" />
        <path d={linha("hoje")} fill="none" stroke="#0284c7" strokeWidth={2} />
        {linhaFuturo && <path d={linhaFuturo} fill="none" stroke="#ea580c" strokeWidth={2} strokeDasharray="2 2" />}
        {marcas.map(({ d, i }) => (
          <text key={d} x={x(i)} y={A + 19} fontSize={8} fill="currentColor" opacity={0.6} textAnchor="middle">
            {diaMes(d)}
          </text>
        ))}
        {/* Pontos invisíveis com a dica ao passar o rato. */}
        {validos.map((p, i) => (
          <circle key={p.data} cx={x(i)} cy={y(p.hoje ?? p.projecao ?? min)} r={6} fill="transparent">
            <title>{`${formatarData(p.data)}: se fosse nesse dia ${fmt(p.hoje)} · projeção ${fmt(p.projecao)}`}</title>
          </circle>
        ))}
        {futuro.map((f, k) => (
          <circle key={f.data} cx={x(iHoje + 1 + k)} cy={y(f.tempoS)} r={6} fill="transparent">
            <title>{`${formatarData(f.data)}: sem treinar ${fmt(f.tempoS)}`}</title>
          </circle>
        ))}
      </svg>
      <figcaption className="flex flex-wrap gap-x-3 text-xs text-zinc-600 dark:text-zinc-400">
        <span style={{ color: "#0284c7" }}>━ Se fosse nesse dia</span>
        <span style={{ color: "#9333ea" }}>┅ Projeção para a prova</span>
        {futuro.length > 0 && <span style={{ color: "#ea580c" }}>┅ Próximos {futuro.length} dias sem treinar</span>}
      </figcaption>
    </figure>
  );
}

/**
 * Mapa do percurso sem fundo (projeção equirretangular), cada segmento com a sua cor.
 * `pontos` são [lat, lon] na grelha; `segmentos` indicam [i0, i1] nessa grelha.
 */
export function MapaPercurso({
  pontos,
  segmentos,
  passo = 1,
}: {
  pontos: ([number | null, number | null] | null)[];
  segmentos: { pontos: [number, number]; cor: string }[];
  passo?: number;
}) {
  const ok = pontos.filter((p): p is [number, number] => !!p && p[0] != null && p[1] != null);
  if (ok.length < 2) return null;
  const lats = ok.map((p) => p[0]);
  const lons = ok.map((p) => p[1]);
  const cos = Math.cos((((Math.min(...lats) + Math.max(...lats)) / 2) * Math.PI) / 180);
  const w = (Math.max(...lons) - Math.min(...lons)) * cos;
  const h = Math.max(...lats) - Math.min(...lats);
  const esc = (L - 10) / Math.max(w, h, 1e-9);
  const altura = h * esc + 10;
  const px = (p: [number, number]) => [5 + (p[1] - Math.min(...lons)) * cos * esc, altura - 5 - (p[0] - Math.min(...lats)) * esc];
  return (
    <svg viewBox={`0 0 ${L} ${altura}`} className="w-full" role="img" aria-label="Mapa do percurso">
      {segmentos.map((s, k) => {
        const d = [];
        for (let i = Math.floor(s.pontos[0] / passo); i <= Math.ceil(s.pontos[1] / passo) && i < pontos.length; i++) {
          const p = pontos[i];
          if (p && p[0] != null && p[1] != null) d.push(px(p as [number, number]));
        }
        if (d.length < 2) return null;
        return (
          <path
            key={k}
            d={d.map((c, i) => `${i ? "L" : "M"}${c[0].toFixed(1)},${c[1].toFixed(1)}`).join("")}
            fill="none"
            stroke={s.cor}
            strokeWidth={3}
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
}

/** Cor de uma classe de declive: descidas em azul, plano em cinzento, subidas de amarelo a vermelho. */
export function corClasse(idx: number, nClasses = 11): string {
  const plano = Math.floor(nClasses / 2) - 1;
  const cores = ["#1e3a8a", "#1d4ed8", "#3b82f6", "#93c5fd", "#a1a1aa", "#fde047", "#facc15", "#f97316", "#ea580c", "#dc2626", "#7f1d1d"];
  if (nClasses === cores.length) return cores[idx] ?? "#a1a1aa";
  return idx < plano ? "#3b82f6" : idx === plano ? "#a1a1aa" : "#f97316";
}

/** Segundos com sinal, curto: "+42", "−1:05". */
export function segundosCurtos(s: number): string {
  const a = Math.round(Math.abs(s));
  const txt = a >= 60 ? `${Math.floor(a / 60)}:${String(a % 60).padStart(2, "0")}` : String(a);
  return `${s > 0 ? "+" : s < 0 ? "−" : ""}${txt}`;
}

/**
 * Perfil de altimetria: [distância m, altitude m] e as zonas de declive por cima, cada
 * segmento pintado com a cor da sua classe. Com `setores`, divide o perfil em setores
 * numerados e desenha por baixo uma barra por setor com os segundos que se perdem
 * (vermelho, para cima) ou ganham (verde, para baixo).
 */
export function GraficoAltimetria({
  pontos,
  segmentos,
  setores,
}: {
  pontos: [number, number][];
  segmentos: { dIni: number; comp: number; classeIdx: number }[];
  setores?: { numero: number; dIni: number; comp: number; delta: number | null }[];
}) {
  if (pontos.length < 2) return null;
  const A = 110;
  const B = setores ? 70 : 0;
  const dMax = pontos.at(-1)![0];
  const alts = pontos.map((p) => p[1]);
  const min = Math.min(...alts);
  const max = Math.max(...alts, min + 10);
  const x = (d: number) => (d / dMax) * L;
  const y = (a: number) => A - ((a - min) / (max - min)) * (A - 14);
  const area = `M0,${A} ${pontos.map((p) => `L${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(" ")} L${L},${A} Z`;
  const linha = (d0: number, d1: number) =>
    pontos
      .filter((p) => p[0] >= d0 - 100 && p[0] <= d1 + 100)
      .map((p, i) => `${i ? "L" : "M"}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`)
      .join("");
  const maxDelta = Math.max(10, ...(setores ?? []).map((z) => Math.abs(z.delta ?? 0)));
  const meio = A + 18 + B / 2;
  return (
    <figure className="flex flex-col gap-1">
      <svg viewBox={`0 0 ${L} ${A + 16 + B}`} className="w-full" role="img" aria-label="Perfil de altimetria">
        <path d={area} fill="currentColor" opacity={0.08} />
        {segmentos.map((s) => (
          <path key={s.dIni} d={linha(s.dIni, s.dIni + s.comp)} fill="none" stroke={corClasse(s.classeIdx)} strokeWidth={2.5} />
        ))}
        {setores?.map((z) => (
          <g key={z.numero}>
            {z.dIni > 0 && <line x1={x(z.dIni)} x2={x(z.dIni)} y1={0} y2={A + 16 + B} stroke="currentColor" strokeOpacity={0.15} strokeDasharray="2 2" />}
            <text x={x(z.dIni + z.comp / 2)} y={8} fontSize={7} fill="currentColor" opacity={0.7} textAnchor="middle">
              {z.numero}
            </text>
          </g>
        ))}
        <text x={2} y={18} fontSize={9} fill="currentColor" opacity={0.6}>
          {Math.round(max)} m
        </text>
        <text x={2} y={A - 3} fontSize={9} fill="currentColor" opacity={0.6}>
          {Math.round(min)} m
        </text>
        {Array.from({ length: Math.floor(dMax / 5000) }, (_, i) => (i + 1) * 5000).map((d) => (
          <text key={d} x={x(d)} y={A + 12} fontSize={9} fill="currentColor" opacity={0.6} textAnchor="middle">
            {d / 1000} km
          </text>
        ))}
        {setores && (
          <g>
            <line x1={0} x2={L} y1={meio} y2={meio} stroke="currentColor" strokeOpacity={0.3} />
            {setores.map((z) => {
              if (z.delta == null) return null;
              const w = Math.max(1, x(z.comp) - 1.5);
              const h = (Math.abs(z.delta) / maxDelta) * (B / 2 - 9);
              const perde = z.delta > 0;
              const cx = x(z.dIni + z.comp / 2);
              return (
                <g key={z.numero}>
                  <rect x={x(z.dIni) + 0.75} y={perde ? meio - h : meio} width={w} height={Math.max(0.5, h)} fill={perde ? "#dc2626" : "#16a34a"} opacity={0.75} />
                  {w >= 14 && (
                    <text x={cx} y={perde ? meio - h - 2 : meio + h + 7} fontSize={7} fill={perde ? "#dc2626" : "#16a34a"} textAnchor="middle">
                      {segundosCurtos(z.delta)}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        )}
      </svg>
    </figure>
  );
}
