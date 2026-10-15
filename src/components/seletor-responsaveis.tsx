"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Select } from "@/components/ui";

type Pessoa = { id: string; nome: string; setor_id?: string | null };
type Opcao = { id: string; nome: string };

// Escolha de um ou mais responsáveis. Atalhos: todas as pessoas de um setor ou
// todo mundo. Com "name", grava um campo escondido por pessoa (form.getAll).
// Traz o próprio rótulo: dentro de <Campo> (um <label>) o clique no texto
// apertaria o "x" do primeiro nome.
export function SeletorResponsaveis({
  rotulo = "Responsáveis",
  dica,
  membros,
  setores = [],
  name,
  inicial = [],
  valor,
  onChange,
  vazio = "Sem responsável",
}: {
  rotulo?: string;
  dica?: string;
  membros: Pessoa[];
  setores?: Opcao[];
  name?: string;
  inicial?: string[];
  valor?: string[];
  onChange?: (ids: string[]) => void;
  vazio?: string;
}) {
  const [interno, setInterno] = useState(inicial);
  const ids = valor ?? interno;
  const mudar = (novos: string[]) => {
    setInterno(novos);
    onChange?.(novos);
  };
  const juntar = (novos: string[]) => mudar([...ids, ...novos.filter((id) => !ids.includes(id))]);

  const nomeDe = new Map(membros.map((m) => [m.id, m.nome]));
  const livres = membros.filter((m) => !ids.includes(m.id));
  const porSetor = setores
    .map((s) => ({ ...s, pessoas: membros.filter((m) => m.setor_id === s.id).map((m) => m.id) }))
    .filter((s) => s.pessoas.some((id) => !ids.includes(id)));

  return (
    <div className="space-y-2">
      <span className="block text-sm font-medium text-slate-700">{rotulo}</span>
      {name && ids.map((id) => <input key={id} type="hidden" name={name} value={id} />)}
      {ids.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {ids.map((id) => (
            <li
              key={id}
              className="inline-flex items-center gap-1 rounded-full bg-slate-100 py-1 pr-1 pl-3 text-sm text-slate-700"
            >
              {nomeDe.get(id) ?? "Pessoa removida"}
              <button
                type="button"
                aria-label={`Tirar ${nomeDe.get(id) ?? ""}`}
                className="rounded-full p-1 text-slate-500 hover:bg-slate-200 hover:text-slate-900"
                onClick={() => mudar(ids.filter((x) => x !== id))}
              >
                <X size={14} />
              </button>
            </li>
          ))}
          {ids.length > 1 && (
            <li>
              <button type="button" className="px-2 py-1 text-sm text-slate-500 hover:text-slate-900" onClick={() => mudar([])}>
                Limpar
              </button>
            </li>
          )}
        </ul>
      ) : (
        <p className="text-sm text-slate-500">{vazio}</p>
      )}
      {livres.length > 0 && (
        <Select
          value=""
          aria-label="Adicionar responsável"
          onChange={(e) => {
            const v = e.target.value;
            if (v === "todos") juntar(membros.map((m) => m.id));
            else if (v.startsWith("setor:")) juntar(porSetor.find((s) => `setor:${s.id}` === v)?.pessoas ?? []);
            else if (v) juntar([v]);
          }}
        >
          <option value="">{ids.length ? "+ Adicionar pessoa" : "+ Escolher responsável"}</option>
          <optgroup label="Pessoas">
            {livres.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
              </option>
            ))}
          </optgroup>
          {(porSetor.length > 0 || livres.length > 1) && (
            <optgroup label="Grupos">
              {porSetor.map((s) => (
                <option key={s.id} value={`setor:${s.id}`}>
                  Todos do setor {s.nome} ({s.pessoas.length})
                </option>
              ))}
              {livres.length > 1 && <option value="todos">Todas as pessoas ({membros.length})</option>}
            </optgroup>
          )}
        </Select>
      )}
      {dica && <span className="block text-xs text-slate-500">{dica}</span>}
    </div>
  );
}
