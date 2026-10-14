"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Columns3, List } from "lucide-react";

export type Visao = "kanban" | "lista";

// Quadro (Kanban) ou lista. A escolha fica salva num cookie.
export function TrocarVisao({ inicial }: { inicial: Visao }) {
  const router = useRouter();
  const [visao, setVisao] = useState<Visao>(inicial);
  const [, startTransition] = useTransition();
  const opcoes = [
    { valor: "kanban" as const, rotulo: "Quadro", icone: Columns3 },
    { valor: "lista" as const, rotulo: "Lista", icone: List },
  ];

  function escolher(v: Visao) {
    setVisao(v);
    document.cookie = `visao_tarefas=${v}; path=/; max-age=31536000; samesite=lax`;
    startTransition(() => router.refresh());
  }

  return (
    <div role="group" aria-label="Visualização" className="flex gap-1 rounded-[10px] bg-slate-100 p-1">
      {opcoes.map((o) => {
        const Icone = o.icone;
        return (
          <button
            key={o.valor}
            type="button"
            aria-pressed={visao === o.valor}
            onClick={() => escolher(o.valor)}
            className={`flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm text-slate-500 transition-colors duration-150 ${
              visao === o.valor ? "bg-superficie text-slate-900 shadow-sm" : "hover:text-slate-800"
            }`}
          >
            <Icone className="h-4 w-4" aria-hidden />
            {o.rotulo}
          </button>
        );
      })}
    </div>
  );
}
