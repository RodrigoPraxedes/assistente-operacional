"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { DIAS_SEMANA } from "@/lib/rotinas";

type Opcao = { id: string; nome: string };

const seletor =
  "h-8 w-auto max-w-44 rounded-lg border border-slate-200 bg-superficie px-2 text-xs text-slate-700 outline-none focus:border-blue-500";

// Dia, setor e função aplicam assim que escolhidos (ficam na URL).
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
      {setores.length > 0 && (
        <select value={setor} onChange={(e) => aplicar({ setor: e.target.value })} aria-label="Setor" className={seletor}>
          <option value="">Todos os setores</option>
          {setores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nome}
            </option>
          ))}
        </select>
      )}
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
    </>
  );
}
