"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Input, Select } from "@/components/ui";

type Opcao = { id: string; nome: string };

// Pesquisa e filtros que aplicam sozinhos: selects na hora, texto enquanto digita (com pequena espera).
export function FiltrosAcoes({
  q,
  setor,
  categoria,
  setores,
  categorias,
}: {
  q: string;
  setor: string;
  categoria: string;
  setores: Opcao[];
  categorias: Opcao[];
}) {
  const router = useRouter();
  const caminho = usePathname();
  const [texto, setTexto] = useState(q);
  const [, startTransition] = useTransition();
  const espera = useRef<ReturnType<typeof setTimeout>>(undefined);

  // "Limpar" (ou voltar no navegador) muda a URL: acompanha o campo
  useEffect(() => setTexto(q), [q]);
  useEffect(() => () => clearTimeout(espera.current), []);

  function aplicar(novo: { q?: string; setor?: string; categoria?: string }) {
    const p = new URLSearchParams();
    const v = { q: texto, setor, categoria, ...novo };
    if (v.q.trim()) p.set("q", v.q);
    if (v.setor) p.set("setor", v.setor);
    if (v.categoria) p.set("categoria", v.categoria);
    const url = p.size ? `${caminho}?${p}` : caminho;
    startTransition(() => router.replace(url, { scroll: false }));
  }

  function digitar(valor: string) {
    setTexto(valor);
    clearTimeout(espera.current);
    espera.current = setTimeout(() => aplicar({ q: valor }), 300);
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <Input
        type="search"
        value={texto}
        onChange={(e) => digitar(e.target.value)}
        placeholder="Pesquisar ação"
        aria-label="Pesquisar ação"
        className="w-auto min-w-48 flex-1"
      />
      {setores.length > 0 && (
        <Select
          value={setor}
          onChange={(e) => aplicar({ setor: e.target.value })}
          aria-label="Setor"
          className="w-auto"
        >
          <option value="">Todos os setores</option>
          {setores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nome}
            </option>
          ))}
        </Select>
      )}
      {categorias.length > 0 && (
        <Select
          value={categoria}
          onChange={(e) => aplicar({ categoria: e.target.value })}
          aria-label="Categoria"
          className="w-auto"
        >
          <option value="">Todas as categorias</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </Select>
      )}
      {(q || setor || categoria) && (
        <Link href={caminho} className="px-2 py-2 text-sm text-slate-500">
          Limpar
        </Link>
      )}
    </div>
  );
}
