"use client";

import { ArrowDown, ArrowUp, Plus, Trash2, X } from "lucide-react";
import { Input, Textarea } from "@/components/ui";
import { blocoVazio, TIPOS_BLOCO, type Bloco } from "./blocos";

const botaoIcone =
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-30";
const botaoAdd = "inline-flex min-h-10 items-center gap-1 rounded-lg px-2 text-sm font-medium text-blue-600 hover:bg-slate-100";

// Editor dos blocos da ficha montada: cada bloco tem nome editável e pode subir, descer ou sair.
export function EditorBlocos({ blocos, onChange }: { blocos: Bloco[]; onChange: (b: Bloco[]) => void }) {
  const trocar = (i: number, b: Bloco) => onChange(blocos.map((x, j) => (j === i ? b : x)));
  const mover = (i: number, d: -1 | 1) => {
    const novo = [...blocos];
    [novo[i], novo[i + d]] = [novo[i + d], novo[i]];
    onChange(novo);
  };

  return (
    <div className="space-y-3">
      {blocos.map((b, i) => (
        <div key={i} className="rounded-xl border border-slate-200 p-3">
          <div className="flex items-center gap-1">
            <Input
              value={b.titulo}
              onChange={(e) => trocar(i, { ...b, titulo: e.target.value })}
              aria-label="Nome do bloco"
              placeholder="Nome do bloco"
              className="min-w-0 flex-1 font-medium"
            />
            <button type="button" className={botaoIcone} onClick={() => mover(i, -1)} disabled={i === 0} aria-label="Subir bloco" title="Subir">
              <ArrowUp className="h-4 w-4" aria-hidden />
            </button>
            <button type="button" className={botaoIcone} onClick={() => mover(i, 1)} disabled={i === blocos.length - 1} aria-label="Descer bloco" title="Descer">
              <ArrowDown className="h-4 w-4" aria-hidden />
            </button>
            <button type="button" className={botaoIcone} onClick={() => onChange(blocos.filter((_, j) => j !== i))} aria-label="Tirar bloco" title="Tirar bloco">
              <Trash2 className="h-4 w-4" aria-hidden />
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-500">{TIPOS_BLOCO.find((t) => t.tipo === b.tipo)?.rotulo}</p>
          <div className="mt-2">
            <ConteudoBloco bloco={b} onChange={(nb) => trocar(i, nb)} />
          </div>
        </div>
      ))}

      <div>
        <p className="mb-1 text-sm text-slate-600">Adicionar bloco:</p>
        <div className="flex flex-wrap gap-2">
          {TIPOS_BLOCO.map((t) => (
            <button
              key={t.tipo}
              type="button"
              onClick={() => onChange([...blocos, blocoVazio(t.tipo)])}
              title={`Ex.: ${t.dica}`}
              className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-slate-200 bg-superficie px-3 text-sm text-slate-700 hover:bg-slate-100"
            >
              <Plus className="h-4 w-4" aria-hidden /> {t.rotulo}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Remover({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className={botaoIcone} onClick={onClick} aria-label="Tirar linha" title="Tirar linha">
      <X className="h-4 w-4" aria-hidden />
    </button>
  );
}

function ConteudoBloco({ bloco: b, onChange }: { bloco: Bloco; onChange: (b: Bloco) => void }) {
  if (b.tipo === "texto") {
    return <Textarea rows={4} value={b.texto} onChange={(e) => onChange({ ...b, texto: e.target.value })} aria-label={b.titulo} />;
  }

  if (b.tipo === "passos") {
    const set = (itens: string[]) => onChange({ ...b, itens });
    return (
      <div className="space-y-2">
        {b.itens.map((p, j) => (
          <div key={j} className="flex items-start gap-2">
            <span className="mt-2.5 w-6 shrink-0 text-right text-sm font-semibold text-slate-500">{j + 1}.</span>
            <Textarea rows={2} value={p} onChange={(e) => set(b.itens.map((x, k) => (k === j ? e.target.value : x)))} aria-label={`Passo ${j + 1}`} className="flex-1" />
            <Remover onClick={() => set(b.itens.filter((_, k) => k !== j))} />
          </div>
        ))}
        <button type="button" className={botaoAdd} onClick={() => set([...b.itens, ""])}>
          <Plus className="h-4 w-4" aria-hidden /> Passo
        </button>
      </div>
    );
  }

  if (b.tipo === "especificacoes") {
    const set = (itens: typeof b.itens) => onChange({ ...b, itens });
    return (
      <div className="space-y-2">
        {b.itens.map((it, j) => (
          <div key={j} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
            <Input value={it.nome} placeholder="Nome (ex.: Voltagem)" aria-label="Nome" className="min-w-0 flex-1 basis-32"
              onChange={(e) => set(b.itens.map((x, k) => (k === j ? { ...x, nome: e.target.value } : x)))} />
            <Input value={it.valor} placeholder="Valor (ex.: 220 V)" aria-label="Valor" className="min-w-0 flex-1 basis-32"
              onChange={(e) => set(b.itens.map((x, k) => (k === j ? { ...x, valor: e.target.value } : x)))} />
            <Remover onClick={() => set(b.itens.filter((_, k) => k !== j))} />
          </div>
        ))}
        <button type="button" className={botaoAdd} onClick={() => set([...b.itens, { nome: "", valor: "" }])}>
          <Plus className="h-4 w-4" aria-hidden /> Linha
        </button>
      </div>
    );
  }

  const set = (itens: typeof b.itens) => onChange({ ...b, itens });
  return (
    <div className="space-y-2">
      {b.itens.map((it, j) => (
        <div key={j} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
          <Input value={it.nome} placeholder="Item" aria-label="Item" className="min-w-0 basis-full sm:flex-1 sm:basis-auto"
            onChange={(e) => set(b.itens.map((x, k) => (k === j ? { ...x, nome: e.target.value } : x)))} />
          <Input value={it.quantidade} placeholder="Qtd." aria-label="Quantidade" className="w-24 flex-1 sm:flex-none"
            onChange={(e) => set(b.itens.map((x, k) => (k === j ? { ...x, quantidade: e.target.value } : x)))} />
          <Input value={it.unidade} placeholder="Unid." aria-label="Unidade" className="w-24 flex-1 sm:flex-none"
            onChange={(e) => set(b.itens.map((x, k) => (k === j ? { ...x, unidade: e.target.value } : x)))} />
          <Remover onClick={() => set(b.itens.filter((_, k) => k !== j))} />
        </div>
      ))}
      <button type="button" className={botaoAdd} onClick={() => set([...b.itens, { nome: "", quantidade: "", unidade: "" }])}>
        <Plus className="h-4 w-4" aria-hidden /> Item
      </button>
    </div>
  );
}
