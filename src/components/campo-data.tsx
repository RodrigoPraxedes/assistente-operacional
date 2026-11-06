"use client";

import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { estilos } from "@/components/ui";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/**
 * Seletor de data (e hora) com calendário em grade de mês, no lugar do
 * <input type="date|datetime-local"> nativo. Mantém os mesmos formatos de valor
 * ("YYYY-MM-DD" e "YYYY-MM-DDTHH:mm") e o mesmo `name` no formulário.
 */
type Props = {
  tipo?: "date" | "datetime-local";
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (valor: string) => void;
  required?: boolean;
  min?: string; // YYYY-MM-DD
  max?: string; // YYYY-MM-DD
  className?: string;
  title?: string;
  "aria-label"?: string;
};

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const DIAS = ["D", "S", "T", "Q", "Q", "S", "S"];

const p2 = (n: number) => String(n).padStart(2, "0");
const ymd = (a: number, m: number, d: number) => `${a}-${p2(m + 1)}-${p2(d)}`;

function ler(valor: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(valor);
  if (!m) return null;
  return { a: +m[1], m: +m[2] - 1, d: +m[3], h: m[4] ? +m[4] : 9, mi: m[5] ? +m[5] : 0 };
}

function formatar(valor: string, comHora: boolean) {
  const v = ler(valor);
  if (!v) return "";
  const data = `${p2(v.d)}/${p2(v.m + 1)}/${v.a}`;
  return comHora ? `${data} ${p2(v.h)}:${p2(v.mi)}` : data;
}

function hojeLocal() {
  const n = new Date();
  return { a: n.getFullYear(), m: n.getMonth(), d: n.getDate() };
}

export function CampoData({ tipo = "date", name, value, defaultValue, onChange, required, min, max, className, title, ...resto }: Props) {
  const comHora = tipo === "datetime-local";
  const controlado = value !== undefined;
  const [interno, setInterno] = useState(defaultValue ?? "");
  const atual = controlado ? value : interno;
  const [aberto, setAberto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);

  const sel = ler(atual);
  const hoje = hojeLocal();
  const [vis, setVis] = useState({ a: sel?.a ?? hoje.a, m: sel?.m ?? hoje.m });

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAberto(false);
    };
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("pointerdown", fora);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("pointerdown", fora);
      document.removeEventListener("keydown", tecla);
    };
  }, [aberto]);

  function definir(v: string) {
    if (!controlado) setInterno(v);
    onChange?.(v);
  }

  function abrir() {
    const base = ler(atual);
    setVis({ a: base?.a ?? hoje.a, m: base?.m ?? hoje.m });
    setAberto(true);
  }

  function escolherDia(d: number) {
    const dia = ymd(vis.a, vis.m, d);
    if (comHora) {
      const h = sel?.h ?? 9;
      const mi = sel?.mi ?? 0;
      definir(`${dia}T${p2(h)}:${p2(mi)}`);
    } else {
      definir(dia);
      setAberto(false);
    }
  }

  function mudarHora(h: number, mi: number) {
    if (!sel) return;
    definir(`${ymd(sel.a, sel.m, sel.d)}T${p2(h)}:${p2(mi)}`);
  }

  function irHoje() {
    const dia = ymd(hoje.a, hoje.m, hoje.d);
    definir(comHora ? `${dia}T${p2(sel?.h ?? 9)}:${p2(sel?.mi ?? 0)}` : dia);
    setVis({ a: hoje.a, m: hoje.m });
    if (!comHora) setAberto(false);
  }

  function mes(delta: number) {
    const t = vis.a * 12 + vis.m + delta;
    setVis({ a: Math.floor(t / 12), m: ((t % 12) + 12) % 12 });
  }

  const primeiro = new Date(vis.a, vis.m, 1).getDay();
  const total = new Date(vis.a, vis.m + 1, 0).getDate();
  const celulas: (number | null)[] = [...Array(primeiro).fill(null), ...Array.from({ length: total }, (_, i) => i + 1)];

  const minutos = Array.from({ length: 12 }, (_, i) => i * 5);
  if (sel && !minutos.includes(sel.mi)) minutos.push(sel.mi);
  minutos.sort((x, y) => x - y);

  return (
    <div ref={raiz} className="relative">
      {/* Campo real do formulário: leva o name e faz o "required" funcionar. */}
      <input
        tabIndex={-1}
        aria-hidden
        name={name}
        value={atual}
        required={required}
        onChange={() => {}}
        className="pointer-events-none absolute inset-0 opacity-0"
      />
      <button
        type="button"
        onClick={() => (aberto ? setAberto(false) : abrir())}
        title={title}
        aria-label={resto["aria-label"]}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        className={cx(estilos.input, "flex items-center justify-between gap-2 text-left", className)}
      >
        <span className={atual ? "" : "text-slate-400"}>{atual ? formatar(atual, comHora) : comHora ? "dd/mm/aaaa hh:mm" : "dd/mm/aaaa"}</span>
        <CalendarDays className="size-4 shrink-0 text-slate-500" aria-hidden />
      </button>

      {aberto && (
        <div
          role="dialog"
          className="absolute left-0 z-50 mt-1 w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200 bg-superficie p-3 shadow-lg"
        >
          <div className="mb-2 flex items-center justify-between">
            <button type="button" onClick={() => mes(-1)} aria-label="Mês anterior" className="rounded-lg p-2 hover:bg-slate-100">
              <ChevronLeft className="size-4" />
            </button>
            <span className="text-sm font-semibold capitalize text-slate-900">
              {MESES[vis.m]} de {vis.a}
            </span>
            <button type="button" onClick={() => mes(1)} aria-label="Próximo mês" className="rounded-lg p-2 hover:bg-slate-100">
              <ChevronRight className="size-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-xs text-slate-500">
            {DIAS.map((d, i) => (
              <span key={i} className="py-1">
                {d}
              </span>
            ))}
            {celulas.map((d, i) => {
              if (d === null) return <span key={i} />;
              const dia = ymd(vis.a, vis.m, d);
              const bloqueado = (min && dia < min) || (max && dia > max);
              const marcado = sel && sel.a === vis.a && sel.m === vis.m && sel.d === d;
              const ehHoje = hoje.a === vis.a && hoje.m === vis.m && hoje.d === d;
              return (
                <button
                  key={i}
                  type="button"
                  disabled={!!bloqueado}
                  onClick={() => escolherDia(d)}
                  className={cx(
                    "aspect-square rounded-full text-sm disabled:opacity-30",
                    marcado ? "bg-blue-600 font-semibold text-white" : ehHoje ? "font-semibold text-blue-600 hover:bg-slate-100" : "text-slate-800 hover:bg-slate-100",
                  )}
                >
                  {d}
                </button>
              );
            })}
          </div>

          {comHora && (
            <div className="mt-3 flex items-center gap-2 border-t border-slate-200 pt-3">
              <span className="text-sm text-slate-600">Hora</span>
              <select
                disabled={!sel}
                value={sel?.h ?? 9}
                onChange={(e) => mudarHora(+e.target.value, sel?.mi ?? 0)}
                className={cx(estilos.input, "w-auto")}
                aria-label="Hora"
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>
                    {p2(h)}
                  </option>
                ))}
              </select>
              <span>:</span>
              <select
                disabled={!sel}
                value={sel?.mi ?? 0}
                onChange={(e) => mudarHora(sel?.h ?? 9, +e.target.value)}
                className={cx(estilos.input, "w-auto")}
                aria-label="Minutos"
              >
                {minutos.map((mi) => (
                  <option key={mi} value={mi}>
                    {p2(mi)}
                  </option>
                ))}
              </select>
              <button type="button" onClick={() => setAberto(false)} className="ml-auto rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white">
                OK
              </button>
            </div>
          )}

          <div className="mt-2 flex justify-between text-sm">
            <button type="button" onClick={irHoje} className="rounded-lg px-2 py-1 text-blue-600 hover:bg-slate-100">
              Hoje
            </button>
            {!required && atual && (
              <button
                type="button"
                onClick={() => {
                  definir("");
                  setAberto(false);
                }}
                className="rounded-lg px-2 py-1 text-red-600 hover:bg-slate-100"
              >
                Limpar
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
