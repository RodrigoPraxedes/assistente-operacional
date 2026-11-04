"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Input, Select } from "@/components/ui";

type Valores = { busca: string; categoria: string };

// Busca e categoria aplicam sozinhas: a categoria na hora, o texto enquanto digita (com pequena espera).
export function FiltrosFichas({ busca, categoria, categorias }: Valores & { categorias: { id: string; nome: string }[] }) {
  const router = useRouter();
  const caminho = usePathname();
  const [texto, setTexto] = useState(busca);
  const [, startTransition] = useTransition();
  const espera = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => setTexto(busca), [busca]);
  useEffect(() => () => clearTimeout(espera.current), []);

  function aplicar(novo: Partial<Valores>) {
    const v = { busca: texto, categoria, ...novo };
    const p = new URLSearchParams();
    if (v.busca.trim()) p.set("busca", v.busca);
    if (v.categoria) p.set("categoria", v.categoria);
    const url = p.size ? `${caminho}?${p}` : caminho;
    startTransition(() => router.replace(url, { scroll: false }));
  }

  function digitar(valor: string) {
    setTexto(valor);
    clearTimeout(espera.current);
    espera.current = setTimeout(() => aplicar({ busca: valor }), 300);
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <Input
        type="search"
        value={texto}
        onChange={(e) => digitar(e.target.value)}
        placeholder="Buscar fichas"
        aria-label="Buscar fichas"
        className="min-w-48 flex-1"
      />
      <Select value={categoria} onChange={(e) => aplicar({ categoria: e.target.value })} aria-label="Categoria" className="sm:w-64">
        <option value="">Todas as categorias</option>
        {categorias.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nome}
          </option>
        ))}
        <option value="sem">Sem categoria</option>
      </Select>
    </div>
  );
}
