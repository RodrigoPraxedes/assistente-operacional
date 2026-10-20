"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Input, Select } from "@/components/ui";
import { SITUACOES_PATRIMONIO, TIPOS_PATRIMONIO } from "@/lib/types";

type Valores = { busca: string; tipo: string; situacao: string; unidade: string };

// Busca e filtros que aplicam sozinhos: selects na hora, texto enquanto digita (com pequena espera).
export function FiltrosPatrimonio({ busca, tipo, situacao, unidade, unidades }: Valores & { unidades: { id: string; nome: string }[] }) {
  const router = useRouter();
  const caminho = usePathname();
  const [texto, setTexto] = useState(busca);
  const [, startTransition] = useTransition();
  const espera = useRef<ReturnType<typeof setTimeout>>(undefined);

  // "Limpar" (ou voltar no navegador) muda a URL: acompanha o campo
  useEffect(() => setTexto(busca), [busca]);
  useEffect(() => () => clearTimeout(espera.current), []);

  function aplicar(novo: Partial<Valores>) {
    const v = { busca: texto, tipo, situacao, unidade, ...novo };
    const p = new URLSearchParams();
    if (v.busca.trim()) p.set("busca", v.busca);
    if (v.tipo) p.set("tipo", v.tipo);
    if (v.situacao) p.set("situacao", v.situacao);
    if (v.unidade) p.set("unidade", v.unidade);
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
        placeholder="Buscar nome, código, marca..."
        aria-label="Buscar no patrimônio"
        className="w-56 flex-1 sm:flex-none"
      />
      <Select value={tipo} onChange={(e) => aplicar({ tipo: e.target.value })} aria-label="Tipo" className="w-auto">
        <option value="">Todos os tipos</option>
        {Object.entries(TIPOS_PATRIMONIO).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </Select>
      <Select value={situacao} onChange={(e) => aplicar({ situacao: e.target.value })} aria-label="Situação" className="w-auto">
        <option value="">Em atividade</option>
        {Object.entries(SITUACOES_PATRIMONIO).map(([k, v]) => (
          <option key={k} value={k}>
            {v.rotulo}
          </option>
        ))}
        <option value="todos">Todas as situações</option>
      </Select>
      {unidades.length > 1 && (
        <Select value={unidade} onChange={(e) => aplicar({ unidade: e.target.value })} aria-label="Unidade" className="w-auto">
          <option value="">Todas as unidades</option>
          {unidades.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nome}
            </option>
          ))}
        </Select>
      )}
      {(busca || tipo || situacao || unidade) && (
        <Link href={caminho} className="px-2 py-2 text-sm text-slate-500">
          Limpar
        </Link>
      )}
    </div>
  );
}
