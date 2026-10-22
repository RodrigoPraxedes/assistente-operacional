"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Input, Select } from "@/components/ui";

type Valores = { busca: string; setor: string; unidade: string; qr: string; situacao: string };
type Opcao = { id: string; nome: string };

// Busca e filtros que aplicam sozinhos: selects na hora, texto enquanto digita (com pequena espera).
export function FiltrosChecklists({
  busca,
  setor,
  unidade,
  qr,
  situacao,
  setores,
  unidades,
}: Valores & { setores: Opcao[]; unidades: Opcao[] }) {
  const router = useRouter();
  const caminho = usePathname();
  const [texto, setTexto] = useState(busca);
  const [, startTransition] = useTransition();
  const espera = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => setTexto(busca), [busca]);
  useEffect(() => () => clearTimeout(espera.current), []);

  function aplicar(novo: Partial<Valores>) {
    const v = { busca: texto, setor, unidade, qr, situacao, ...novo };
    const p = new URLSearchParams();
    for (const [k, valor] of Object.entries(v)) if (valor.trim()) p.set(k, valor);
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
        placeholder="Buscar nome, descrição, setor..."
        aria-label="Buscar check-list"
        className="w-56 flex-1 sm:flex-none"
      />
      {setores.length > 0 && (
        <Select value={setor} onChange={(e) => aplicar({ setor: e.target.value })} aria-label="Setor" className="w-auto">
          <option value="">Todos os setores</option>
          {setores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nome}
            </option>
          ))}
        </Select>
      )}
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
      <Select value={qr} onChange={(e) => aplicar({ qr: e.target.value })} aria-label="QR Code" className="w-auto">
        <option value="">Com ou sem QR Code</option>
        <option value="com">Com QR Code</option>
        <option value="sem">Sem QR Code</option>
      </Select>
      <Select value={situacao} onChange={(e) => aplicar({ situacao: e.target.value })} aria-label="Situação" className="w-auto">
        <option value="">Ativos e inativos</option>
        <option value="ativos">Só ativos</option>
        <option value="inativos">Só inativos</option>
      </Select>
      {(busca || setor || unidade || qr || situacao) && (
        <Link href={caminho} className="px-2 py-2 text-sm text-slate-500">
          Limpar
        </Link>
      )}
    </div>
  );
}
