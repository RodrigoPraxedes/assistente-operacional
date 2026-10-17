"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";

type Opcao = { id: string; nome: string };

const seletor =
  "h-8 w-auto max-w-44 rounded-lg border border-slate-200 bg-superficie px-2 text-xs text-slate-700 outline-none focus:border-blue-500";

// Setor e categoria aplicam assim que escolhidos (guardam a semana na URL).
export function FiltrosSemana({
  semana,
  setor,
  categoria,
  setores,
  categorias,
}: {
  semana: string;
  setor: string;
  categoria: string;
  setores: Opcao[];
  categorias: Opcao[];
}) {
  const router = useRouter();
  const caminho = usePathname();
  const [, startTransition] = useTransition();

  function aplicar(novo: { setor?: string; categoria?: string }) {
    const v = { setor, categoria, ...novo };
    const p = new URLSearchParams({ semana });
    if (v.setor) p.set("setor", v.setor);
    if (v.categoria) p.set("categoria", v.categoria);
    startTransition(() => router.replace(`${caminho}?${p}`, { scroll: false }));
  }

  return (
    <>
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
      {categorias.length > 0 && (
        <select
          value={categoria}
          onChange={(e) => aplicar({ categoria: e.target.value })}
          aria-label="Categoria"
          className={seletor}
        >
          <option value="">Todas as categorias</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      )}
    </>
  );
}
