"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, ClipboardList, ListChecks, Search, Wrench } from "lucide-react";

export interface ItemCentral {
  id: string;
  nome: string;
  descricao: string | null;
  href: string;
  detalhe?: string | null;
  feitoHoje?: string | null;
}

function Cartao({ item, icone }: { item: ItemCentral; icone: React.ReactNode }) {
  return (
    <Link
      href={item.href}
      className="flex items-center gap-3 rounded-xl border border-slate-200 bg-superficie p-4 shadow-sm hover:border-blue-400"
    >
      {icone}
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{item.nome}</span>
        {item.descricao && <span className="text-sm text-slate-500">{item.descricao}</span>}
      </span>
      <span className="shrink-0 pl-2 text-right text-sm text-slate-500">
        {item.detalhe}
        {item.feitoHoje && (
          <span className="mt-1 flex items-center justify-end gap-1 text-xs font-medium text-green-600">
            <CheckCircle2 size={14} />
            Feito hoje às {item.feitoHoje}
          </span>
        )}
      </span>
    </Link>
  );
}

function Coluna({ titulo, icone, vazio, children }: { titulo: string; icone: React.ReactNode; vazio: boolean; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="flex items-center gap-2 pt-2 text-sm font-medium text-slate-500">
        {icone}
        {titulo}
      </h2>
      {vazio ? <p className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">Nada por aqui.</p> : children}
    </section>
  );
}

export function CentralLista({
  chamado,
  checklists,
  contagens,
}: {
  chamado: ItemCentral;
  checklists: ItemCentral[];
  contagens: ItemCentral[];
}) {
  const [busca, setBusca] = useState("");
  const q = busca.trim().toLowerCase();
  const bate = (i: ItemCentral) => !q || `${i.nome} ${i.descricao ?? ""}`.toLowerCase().includes(q);
  const mostraChamado = bate(chamado) || "manutenção chamado".includes(q);
  const cks = checklists.filter(bate);
  const cts = contagens.filter(bate);
  const nada = !mostraChamado && cks.length === 0 && cts.length === 0;

  return (
    <div className="space-y-3 md:relative md:left-1/2 md:w-[min(64rem,calc(100vw-2rem))] md:-translate-x-1/2">
      <label className="relative mx-auto block max-w-xl">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Pesquisar"
          aria-label="Pesquisar"
          className="w-full rounded-xl border border-slate-200 bg-superficie py-2.5 pl-9 pr-3 text-base outline-none focus:border-blue-400"
        />
      </label>
      {nada ? (
        <p className="py-6 text-center text-sm text-slate-500">Nada encontrado para &ldquo;{busca}&rdquo;.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-3 md:items-start">
          {(mostraChamado || !q) && (
            <Coluna titulo="Chamado de manutenção" icone={<Wrench size={16} />} vazio={false}>
              <Cartao item={chamado} icone={<Wrench size={20} className="shrink-0 text-blue-600" />} />
            </Coluna>
          )}
          {(cks.length > 0 || !q) && (
            <Coluna titulo="Check-lists" icone={<ListChecks size={16} />} vazio={cks.length === 0}>
              <ul className="space-y-2">
                {cks.map((m) => (
                  <li key={m.id}>
                    <Cartao item={m} icone={<ListChecks size={20} className="shrink-0 text-blue-600" />} />
                  </li>
                ))}
              </ul>
            </Coluna>
          )}
          {(cts.length > 0 || (!q && contagens.length > 0)) && (
            <Coluna titulo="Contagens" icone={<ClipboardList size={16} />} vazio={cts.length === 0}>
              <ul className="space-y-2">
                {cts.map((c) => (
                  <li key={c.id}>
                    <Cartao item={c} icone={<ClipboardList size={20} className="shrink-0 text-blue-600" />} />
                  </li>
                ))}
              </ul>
            </Coluna>
          )}
        </div>
      )}
    </div>
  );
}
