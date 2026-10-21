"use client";

import { useState, type ReactNode } from "react";
import { Select } from "@/components/ui";

export type ItemPainel = { id: string; rotulo: string; painel: ReactNode };

/** Caixa de seleção que mostra só o painel do item escolhido (os painéis vêm prontos do servidor). */
export function SeletorPainel({ itens, rotulo }: { itens: ItemPainel[]; rotulo: string }) {
  const [atual, setAtual] = useState(itens[0]?.id ?? "");
  if (itens.length === 0) return null;
  return (
    <div className="space-y-3">
      <Select aria-label={rotulo} value={atual} onChange={(ev) => setAtual(ev.target.value)}>
        {itens.map((i) => (
          <option key={i.id} value={i.id}>
            {i.rotulo}
          </option>
        ))}
      </Select>
      {itens.map((i) => (
        <div key={i.id} hidden={i.id !== atual}>
          {i.painel}
        </div>
      ))}
    </div>
  );
}
