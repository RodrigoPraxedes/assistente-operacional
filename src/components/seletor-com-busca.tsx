"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { estilos } from "@/components/ui";

type Opcao = { id: string; nome: string };

const normalizar = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Lista longa com campo de busca no topo (substitui o select nativo). Grava um campo escondido com o id escolhido.
export function SeletorComBusca({
  name,
  opcoes,
  inicial = "",
  vazio = "—",
  className,
}: {
  name: string;
  opcoes: Opcao[];
  inicial?: string;
  vazio?: string;
  className?: string;
}) {
  const [valor, setValor] = useState(inicial);
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const raiz = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!aberto) return;
    campo.current?.focus();
    const fora = (e: PointerEvent) => {
      if (!raiz.current?.contains(e.target as Node)) setAberto(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAberto(false);
    };
    document.addEventListener("pointerdown", fora);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("pointerdown", fora);
      document.removeEventListener("keydown", tecla);
    };
  }, [aberto]);

  const atual = opcoes.find((o) => o.id === valor);
  const termo = normalizar(busca.trim());
  const filtradas = termo ? opcoes.filter((o) => normalizar(o.nome).includes(termo)) : opcoes;

  const escolher = (id: string) => {
    setValor(id);
    setAberto(false);
    setBusca("");
  };

  const item = "flex min-h-11 w-full items-center justify-between gap-2 px-3 py-2 text-left text-base hover:bg-slate-100 sm:min-h-9 sm:text-sm";

  return (
    <div ref={raiz} className={`relative ${className ?? ""}`}>
      <input type="hidden" name={name} value={valor} />
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={aberto}
        onClick={() => setAberto((a) => !a)}
        className={`${estilos.input} flex items-center justify-between gap-2 text-left`}
      >
        <span className={`truncate ${atual ? "" : "text-slate-400"}`}>{atual ? atual.nome : vazio}</span>
        <ChevronDown size={16} className="shrink-0 text-slate-400" />
      </button>
      {aberto && (
        <div className="absolute z-30 mt-1 w-full min-w-56 overflow-hidden rounded-lg border border-slate-200 bg-superficie shadow-lg">
          <div className="flex items-center gap-2 border-b border-slate-200 px-3">
            <Search size={16} className="shrink-0 text-slate-400" />
            <input
              ref={campo}
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (filtradas.length === 1) escolher(filtradas[0].id);
                }
              }}
              placeholder="Pesquisar..."
              aria-label="Pesquisar"
              className="min-h-11 w-full bg-transparent text-base text-slate-900 outline-none placeholder:text-slate-400 sm:min-h-10 sm:text-sm"
            />
          </div>
          <ul role="listbox" className="max-h-64 overflow-y-auto overscroll-contain py-1">
            <li>
              <button type="button" role="option" aria-selected={!valor} onClick={() => escolher("")} className={`${item} text-slate-500`}>
                {vazio}
              </button>
            </li>
            {filtradas.map((o) => (
              <li key={o.id}>
                <button type="button" role="option" aria-selected={o.id === valor} onClick={() => escolher(o.id)} className={`${item} text-slate-900`}>
                  <span className="truncate">{o.nome}</span>
                  {o.id === valor && <Check size={16} className="shrink-0 text-blue-600" />}
                </button>
              </li>
            ))}
            {filtradas.length === 0 && <li className="px-3 py-3 text-sm text-slate-500">Nada encontrado.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
