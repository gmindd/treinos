"use client";

// Altimetria com setores editáveis: arrastar as linhas, tocar no perfil para criar uma
// linha, tocar numa linha para a selecionar e remover. Os tempos de cada setor
// (referência, hoje, meta) recalculam-se na hora a partir dos segmentos do motor.
import { useMemo, useRef, useState, useTransition } from "react";
import { setoresPorLimites, type SetorContinuo } from "@/lib/analysis/previsao-btt";
import { formatarDuracao, formatarNumero } from "@/lib/formato";
import { corClasse, segundosCurtos } from "../graficos";
import { guardarSetores } from "./actions";

type Segmento = {
  dIni: number;
  comp: number;
  declive: number;
  classe: string;
  classeIdx: number;
  referenciaS: number | null;
  previstoS: number | null;
  necessarioS: number | null;
};

const L = 360;
const A = 110;
const B = 70;
/** Distância mínima entre duas linhas. */
const MIN_M = 150;
const NOME = { subida: "Subida", plano: "Plano", descida: "Descida" } as const;
const dur = (s: number | null | undefined) => (s != null && Number.isFinite(s) ? formatarDuracao(s) : "—");

export function AltimetriaEditavel({
  metaId,
  pontos,
  segmentos,
  limitesIniciais,
  limitesAutomaticos,
  modo,
  rotuloBase,
}: {
  metaId: number;
  pontos: [number, number][];
  segmentos: Segmento[];
  limitesIniciais: number[];
  limitesAutomaticos: number[];
  modo: "referencia" | "meta";
  rotuloBase: string;
}) {
  const [limites, setLimites] = useState(limitesIniciais);
  const [selecionada, setSelecionada] = useState<number | null>(null);
  const [arrastar, setArrastar] = useState<number | null>(null);
  const [alterado, setAlterado] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const svg = useRef<SVGSVGElement>(null);
  const moveu = useRef(false);

  const dMax = pontos.length ? pontos[pontos.length - 1][0] : 1;
  const fronteiras = useMemo(() => segmentos.map((s) => s.dIni).filter((d) => d > 0), [segmentos]);
  const setores = useMemo(() => setoresPorLimites(segmentos, limites), [segmentos, limites]);
  const base = (z: SetorContinuo) => (modo === "referencia" ? z.referenciaS : z.necessarioS);
  const delta = (z: SetorContinuo) => (z.previstoS != null && base(z) != null ? z.previstoS - (base(z) as number) : null);
  const total = setores.reduce((t, z) => t + (delta(z) ?? 0), 0);

  if (pontos.length < 2) return null;
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
  const maxDelta = Math.max(10, ...setores.map((z) => Math.abs(delta(z) ?? 0)));
  const meio = A + 18 + B / 2;

  /** Metros no ponto do ecrã, encaixados no limite de segmento mais próximo. */
  const metrosNoEcra = (clientX: number) => {
    const r = svg.current?.getBoundingClientRect();
    if (!r) return null;
    const d = ((clientX - r.left) / r.width) * dMax;
    let melhor: number | null = null;
    for (const f of fronteiras) if (melhor == null || Math.abs(f - d) < Math.abs(melhor - d)) melhor = f;
    return melhor;
  };

  const mudar = (novos: number[]) => {
    setLimites([...novos].sort((a, b) => a - b));
    setAlterado(true);
    setMensagem(null);
  };

  const aoMover = (e: React.PointerEvent) => {
    if (arrastar == null) return;
    const d = metrosNoEcra(e.clientX);
    if (d == null) return;
    const ordenados = [...limites].sort((a, b) => a - b);
    const atual = ordenados[arrastar];
    const antes = arrastar > 0 ? ordenados[arrastar - 1] : 0;
    const depois = arrastar < ordenados.length - 1 ? ordenados[arrastar + 1] : dMax;
    if (d <= antes + MIN_M || d >= depois - MIN_M || d === atual) return;
    moveu.current = true;
    ordenados[arrastar] = d;
    setLimites(ordenados);
    setAlterado(true);
    setMensagem(null);
  };

  const aoTocarPerfil = (e: React.MouseEvent) => {
    if (moveu.current) {
      moveu.current = false;
      return;
    }
    const d = metrosNoEcra(e.clientX);
    if (d == null || limites.some((l) => Math.abs(l - d) < MIN_M) || d < MIN_M || d > dMax - MIN_M) return;
    const novos = [...limites, d].sort((a, b) => a - b);
    mudar(novos);
    setSelecionada(novos.indexOf(d));
  };

  const guardar = (valores: number[]) =>
    iniciar(async () => {
      const r = await guardarSetores(metaId, valores);
      setMensagem(r.erro ?? r.ok ?? null);
      if (!r.erro) setAlterado(false);
    });

  const botao = "rounded-lg border border-zinc-300 px-3 py-1 text-xs disabled:opacity-40 dark:border-zinc-700";
  const ordenados = [...limites].sort((a, b) => a - b);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-zinc-600 dark:text-zinc-400">
        Arrasta as linhas para mudar os setores, toca no perfil para criar uma linha e toca numa linha para a selecionar.
      </p>
      <svg
        ref={svg}
        viewBox={`0 0 ${L} ${A + 16 + B}`}
        className="w-full select-none"
        role="img"
        aria-label="Perfil de altimetria com setores editáveis"
        onPointerMove={aoMover}
        onPointerUp={() => setArrastar(null)}
        onPointerLeave={() => setArrastar(null)}
      >
        <rect x={0} y={0} width={L} height={A + 16 + B} fill="transparent" onClick={aoTocarPerfil} />
        <path d={area} fill="currentColor" opacity={0.08} pointerEvents="none" />
        {segmentos.map((s) => (
          <path key={s.dIni} d={linha(s.dIni, s.dIni + s.comp)} fill="none" stroke={corClasse(s.classeIdx)} strokeWidth={2.5} pointerEvents="none" />
        ))}
        <text x={2} y={18} fontSize={9} fill="currentColor" opacity={0.6} pointerEvents="none">
          {Math.round(max)} m
        </text>
        <text x={2} y={A - 3} fontSize={9} fill="currentColor" opacity={0.6} pointerEvents="none">
          {Math.round(min)} m
        </text>
        {Array.from({ length: Math.floor(dMax / 5000) }, (_, i) => (i + 1) * 5000).map((d) => (
          <text key={d} x={x(d)} y={A + 12} fontSize={9} fill="currentColor" opacity={0.6} textAnchor="middle" pointerEvents="none">
            {d / 1000} km
          </text>
        ))}
        {setores.map((z) => (
          <text key={z.numero} x={x(z.dIni + z.comp / 2)} y={8} fontSize={7} fill="currentColor" opacity={0.7} textAnchor="middle" pointerEvents="none">
            {z.numero}
          </text>
        ))}
        <line x1={0} x2={L} y1={meio} y2={meio} stroke="currentColor" strokeOpacity={0.3} pointerEvents="none" />
        {setores.map((z) => {
          const dz = delta(z);
          if (dz == null) return null;
          const w = Math.max(1, x(z.comp) - 1.5);
          const h = (Math.abs(dz) / maxDelta) * (B / 2 - 9);
          const perde = dz > 0;
          return (
            <g key={z.numero} pointerEvents="none">
              <rect x={x(z.dIni) + 0.75} y={perde ? meio - h : meio} width={w} height={Math.max(0.5, h)} fill={perde ? "#dc2626" : "#16a34a"} opacity={0.75} />
              {w >= 14 && (
                <text x={x(z.dIni + z.comp / 2)} y={perde ? meio - h - 2 : meio + h + 7} fontSize={7} fill={perde ? "#dc2626" : "#16a34a"} textAnchor="middle">
                  {segundosCurtos(dz)}
                </text>
              )}
            </g>
          );
        })}
        {ordenados.map((l, i) => {
          const ativa = selecionada === i || arrastar === i;
          return (
            <g
              key={i}
              style={{ cursor: "ew-resize", touchAction: "none" }}
              onPointerDown={(e) => {
                e.stopPropagation();
                (e.target as Element).setPointerCapture?.(e.pointerId);
                moveu.current = false;
                setArrastar(i);
                setSelecionada(i);
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <rect x={x(l) - 7} y={0} width={14} height={A + 16 + B} fill="transparent" />
              <line
                x1={x(l)}
                x2={x(l)}
                y1={0}
                y2={A + 16 + B}
                stroke={ativa ? "#2563eb" : "currentColor"}
                strokeOpacity={ativa ? 1 : 0.3}
                strokeWidth={ativa ? 1.5 : 1}
                strokeDasharray={ativa ? undefined : "2 2"}
              />
              <circle cx={x(l)} cy={A + 2} r={ativa ? 5 : 3.5} fill={ativa ? "#2563eb" : "currentColor"} opacity={ativa ? 1 : 0.5} />
            </g>
          );
        })}
      </svg>
      <div className="flex flex-wrap items-center gap-2">
        <button
          className={botao}
          disabled={selecionada == null || selecionada >= ordenados.length}
          onClick={() => {
            if (selecionada == null) return;
            mudar(ordenados.filter((_, i) => i !== selecionada));
            setSelecionada(null);
          }}
        >
          Remover linha
        </button>
        <button
          className={botao}
          onClick={() => {
            mudar(limitesAutomaticos);
            setSelecionada(null);
          }}
        >
          Repor automático
        </button>
        <button
          className="rounded-lg bg-zinc-900 px-3 py-1 text-xs text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
          disabled={!alterado || pendente}
          onClick={() => {
            // Iguais aos automáticos: guarda-se "automático" (acompanha futuras mudanças do motor).
            const iguais =
              limites.length === limitesAutomaticos.length && [...limites].sort((a, b) => a - b).every((l, i) => l === limitesAutomaticos[i]);
            guardar(iguais ? [] : limites);
          }}
        >
          {pendente ? "A guardar…" : "Guardar setores"}
        </button>
        {mensagem && <span className="text-xs text-zinc-600 dark:text-zinc-400">{mensagem}</span>}
      </div>
      <p className="text-xs text-zinc-600 dark:text-zinc-400">
        Barras: segundos que <span className="text-red-700 dark:text-red-400">perdes (+)</span> ou{" "}
        <span className="text-green-700 dark:text-green-400">ganhas (−)</span> hoje em cada setor,{" "}
        {modo === "referencia" ? `face a ${rotuloBase}` : "face ao tempo necessário para a meta"}. No total: <strong>{segundosCurtos(total)}</strong>{" "}
        (mudar os setores não muda o total, só a forma como se reparte).
      </p>
      <table className="w-full text-xs">
        <thead className="text-left text-zinc-500">
          <tr>
            <th className="py-1 pr-1 font-normal">#</th>
            <th className="pr-1 font-normal">Setor</th>
            <th className="pr-1 font-normal">km</th>
            <th className="pr-1 font-normal">{modo === "referencia" ? "Ref." : "Meta"}</th>
            <th className="pr-1 font-normal">Hoje</th>
            <th className="font-normal">±</th>
          </tr>
        </thead>
        <tbody>
          {setores.map((z) => {
            const dz = delta(z);
            return (
              <tr key={z.numero} className="border-t border-zinc-200 dark:border-zinc-800">
                <td className="py-1 pr-1">{z.numero}</td>
                <td className="whitespace-nowrap pr-1">
                  {NOME[z.tipo]} {z.tipo !== "plano" ? `${formatarNumero(z.declive * 100, 1)}%` : ""}
                </td>
                <td className="whitespace-nowrap pr-1">
                  {formatarNumero(z.dIni / 1000, 1)}–{formatarNumero((z.dIni + z.comp) / 1000, 1)}
                </td>
                <td className="whitespace-nowrap pr-1">{dur(base(z))}</td>
                <td className="whitespace-nowrap pr-1">{dur(z.previstoS)}</td>
                <td className={`whitespace-nowrap ${dz == null ? "" : dz > 0 ? "text-red-700 dark:text-red-400" : "text-green-700 dark:text-green-400"}`}>
                  {dz == null ? "—" : segundosCurtos(dz)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
