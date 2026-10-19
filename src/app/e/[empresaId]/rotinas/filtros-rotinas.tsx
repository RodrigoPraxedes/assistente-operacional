"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { DIAS_SEMANA } from "@/lib/rotinas";

type Opcao = { id: string; nome: string };

const botaoSetor = (ativo: boolean) =>
  `h-8 rounded-full border px-3 text-xs font-medium transition-colors ${
    ativo
      ? "border-blue-600 bg-blue-600 text-white"
      : "border-slate-200 bg-superficie text-slate-700 hover:border-slate-300"
  }`;

const seletor =
  "h-8 w-auto max-w-44 rounded-lg border border-slate-200 bg-superficie px-2 text-xs text-slate-700 outline-none focus:border-blue-500";

// Dia, setores e função aplicam assim que escolhidos (ficam na URL). Os setores são vários: ids separados por vírgula.
export function FiltrosRotinas({
  dia,
  setor,
  funcao,
  setores,
  funcoes,
}: {
  dia: string;
  setor: string;
  funcao: string;
  setores: Opcao[];
  funcoes: Opcao[];
}) {
  const router = useRouter();
  const caminho = usePathname();
  const [, startTransition] = useTransition();

  function aplicar(novo: { dia?: string; setor?: string; funcao?: string }) {
    const v = { dia, setor, funcao, ...novo };
    const p = new URLSearchParams({ dia: v.dia });
    if (v.setor) p.set("setor", v.setor);
    if (v.funcao) p.set("funcao", v.funcao);
    startTransition(() => router.replace(`${caminho}?${p}`, { scroll: false }));
  }

  const marcados = setor ? setor.split(",") : [];
  const alternar = (id: string) =>
    aplicar({ setor: (marcados.includes(id) ? marcados.filter((m) => m !== id) : [...marcados, id]).join(",") });

  return (
    <>
      <select value={dia} onChange={(e) => aplicar({ dia: e.target.value })} aria-label="Dia" className={seletor}>
        {DIAS_SEMANA.map((d) => (
          <option key={d.n} value={d.n}>
            {d.longo}
          </option>
        ))}
        <option value="semana">Semana toda</option>
      </select>
      {funcoes.length > 0 && (
        <select value={funcao} onChange={(e) => aplicar({ funcao: e.target.value })} aria-label="Função" className={seletor}>
          <option value="">Todas as funções</option>
          {funcoes.map((f) => (
            <option key={f.id} value={f.id}>
              {f.nome}
            </option>
          ))}
        </select>
      )}
      {setores.length > 0 && (
        <div role="group" aria-label="Setores" className="order-last flex w-full flex-wrap gap-2">
          <button type="button" aria-pressed={marcados.length === 0} onClick={() => aplicar({ setor: "" })} className={botaoSetor(marcados.length === 0)}>
            Todos os setores
          </button>
          {setores.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={marcados.includes(s.id)}
              onClick={() => alternar(s.id)}
              className={botaoSetor(marcados.includes(s.id))}
            >
              {s.nome}
            </button>
          ))}
          {marcados.length === 1 && <span className="self-center text-xs text-slate-500">Marque mais setores para ver lado a lado</span>}
        </div>
      )}
    </>
  );
}
