"use client";

import { useState } from "react";

type Opcao = { id: string; nome: string };

const botao = (ativo: boolean) =>
  `h-8 rounded-full border px-3 text-xs font-medium transition-colors ${
    ativo
      ? "border-blue-600 bg-blue-600 text-white"
      : "border-slate-200 bg-superficie text-slate-700 hover:border-slate-300"
  }`;

// Vários setores como botões, com atalho "Todos os setores". Grava um campo escondido por setor (form.getAll).
export function SeletorSetores({ name, setores, inicial = [] }: { name: string; setores: Opcao[]; inicial?: string[] }) {
  const [ids, setIds] = useState(inicial.filter((id) => setores.some((s) => s.id === id)));
  const todos = setores.length > 0 && ids.length === setores.length;
  const alternar = (id: string) => setIds((atual) => (atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id]));

  return (
    <div className="space-y-2">
      <span className="block text-sm font-medium text-slate-700">Setores</span>
      {ids.map((id) => (
        <input key={id} type="hidden" name={name} value={id} />
      ))}
      <div role="group" aria-label="Setores" className="flex flex-wrap gap-2">
        <button type="button" aria-pressed={todos} onClick={() => setIds(todos ? [] : setores.map((s) => s.id))} className={botao(todos)}>
          Todos os setores
        </button>
        {setores.map((s) => (
          <button key={s.id} type="button" aria-pressed={ids.includes(s.id)} onClick={() => alternar(s.id)} className={botao(ids.includes(s.id))}>
            {s.nome}
          </button>
        ))}
      </div>
      <p className="text-xs text-slate-500">Marque quantos setores precisar; a rotina aparece em cada um. Sem nenhum, fica sem setor.</p>
    </div>
  );
}
