// Gráficos simples em SVG (desenhados no servidor, legíveis a 380 px).
import { formatarData, formatarNumero } from "@/lib/formato";

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

/** Evolução da previsão (hoje e projeção) com a linha da meta; eixo em minutos. */
export function GraficoPrevisao({ pontos, alvoS }: { pontos: PontoPrevisao[]; alvoS: number }) {
  const validos = pontos.filter((p) => p.hoje != null || p.projecao != null);
  if (validos.length < 2) return null;
  const A = 120;
  const vals = validos.flatMap((p) => [p.hoje, p.projecao]).filter((v): v is number => v != null);
  const min = Math.min(alvoS, ...vals) * 0.98;
  const max = Math.max(alvoS, ...vals) * 1.02;
  const x = (i: number) => (i / (validos.length - 1)) * L;
  const y = (v: number) => A - ((v - min) / (max - min)) * A;
  const linha = (k: "hoje" | "projecao") =>
    validos
      .map((p, i) => (p[k] != null ? `${x(i).toFixed(1)},${y(p[k] as number).toFixed(1)}` : null))
      .filter(Boolean)
      .map((c, i) => `${i ? "L" : "M"}${c}`)
      .join("");
  const min2 = (s: number) => `${Math.floor(s / 60)}'`;
  return (
    <figure className="flex flex-col gap-1">
      <svg viewBox={`0 0 ${L} ${A + 20}`} className="w-full" role="img" aria-label="Evolução da previsão">
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
        <path d={linha("projecao")} fill="none" stroke="#9333ea" strokeWidth={1.2} strokeDasharray="3 2" />
        <path d={linha("hoje")} fill="none" stroke="#0284c7" strokeWidth={2} />
        <text x={0} y={A + 16} fontSize={9} fill="currentColor" opacity={0.6}>
          {formatarData(validos[0].data)}
        </text>
        <text x={L} y={A + 16} fontSize={9} fill="currentColor" opacity={0.6} textAnchor="end">
          {formatarData(validos.at(-1)!.data)}
        </text>
      </svg>
      <figcaption className="flex gap-3 text-xs text-zinc-600 dark:text-zinc-400">
        <span style={{ color: "#0284c7" }}>━ Se fosse nesse dia</span>
        <span style={{ color: "#9333ea" }}>┅ Projeção para a prova</span>
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
