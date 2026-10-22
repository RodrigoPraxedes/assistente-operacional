"use client";

import { useActionState, useRef, useState, type PointerEvent } from "react";
import { GripVertical } from "lucide-react";
import { salvarModelo } from "../actions";
import { SeletorRecorrencia } from "@/components/seletor-recorrencia";
import { PRIORIDADES, PROBLEMA_QUANDO, type ChecklistItem, type ChecklistModelo, type Prioridade, type ProblemaQuando, type TipoResposta } from "@/lib/types";
import { Aviso, Botao, Campo, Cartao, Input, Select, Textarea } from "@/components/ui";
import { BotaoEnviar } from "@/components/botao-enviar";
import { SeletorResponsaveis } from "@/components/seletor-responsaveis";

type Opcao = { id: string; nome: string };
type ItemEditavel = Pick<
  ChecklistItem,
  "texto" | "tipo_resposta" | "obrigatorio" | "permite_foto" | "foto_obrigatoria" | "foto_obrigatoria_se_nao" | "permite_na" | "problema_quando" | "abre_chamado_se_nao" | "prioridade_chamado"
> & {
  id?: string;
  chave: string;
};

let seq = 0;
const novoItem = (): ItemEditavel => ({
  chave: `novo-${++seq}`,
  texto: "",
  tipo_resposta: "sim_nao",
  obrigatorio: true,
  permite_foto: true,
  foto_obrigatoria: false,
  foto_obrigatoria_se_nao: false,
  permite_na: true,
  problema_quando: "nao",
  abre_chamado_se_nao: false,
  prioridade_chamado: "media",
});

export function FormModelo({
  empresaId,
  modelo,
  itens: iniciais,
  unidades,
  setores,
  categorias,
  membros,
  copia = false,
}: {
  empresaId: string;
  modelo: ChecklistModelo | null;
  // modelo é a origem de "salvar e copiar": preenche o formulário, mas cria um check-list novo
  copia?: boolean;
  itens: ChecklistItem[];
  unidades: Opcao[];
  setores: Opcao[];
  categorias: Opcao[];
  membros: Opcao[];
}) {
  const [estado, acao] = useActionState(salvarModelo.bind(null, empresaId), undefined);
  const [itens, setItens] = useState<ItemEditavel[]>(
    iniciais.length
      ? iniciais.map((i) => (copia ? { ...i, id: undefined, chave: `copia-${++seq}` } : { ...i, chave: i.id })) : [novoItem()],
  );
  const regra = modelo?.recorrencia ?? "FREQ=DAILY";
  // o aviso de visibilidade reenvia o formulário sem o botão clicado; por isso a escolha vai num campo oculto
  const continuar = useRef<HTMLInputElement>(null);
  const marcar = (v: string) => continuar.current && (continuar.current.value = v);

  const alterar = (chave: string, mudanca: Partial<ItemEditavel>) =>
    setItens((xs) => xs.map((x) => (x.chave === chave ? { ...x, ...mudanca } : x)));
  const mover = (i: number, d: number) =>
    setItens((xs) => {
      const j = i + d;
      if (j < 0 || j >= xs.length) return xs;
      const c = [...xs];
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });

  // arrastar pela alça (mouse ou dedo): o item vai para onde o ponteiro passa
  const lista = useRef<HTMLDivElement>(null);
  const [arrastando, setArrastando] = useState<string | null>(null);
  function iniciarArraste(e: PointerEvent<HTMLButtonElement>, chave: string) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setArrastando(chave);
  }
  function arrastar(e: PointerEvent<HTMLButtonElement>) {
    if (!arrastando || !lista.current) return;
    // nova posição = quantos outros itens têm o meio acima do ponteiro
    const outros = Array.from(lista.current.querySelectorAll<HTMLElement>("[data-item]")).filter(
      (el) => el.dataset.item !== arrastando,
    );
    const alvo = outros.filter((el) => {
      const r = el.getBoundingClientRect();
      return r.top + r.height / 2 < e.clientY;
    }).length;
    setItens((xs) => {
      const de = xs.findIndex((x) => x.chave === arrastando);
      if (de < 0 || de === alvo) return xs;
      const c = [...xs];
      const [item] = c.splice(de, 1);
      c.splice(alvo, 0, item);
      return c;
    });
  }

  return (
    <form action={acao} className="space-y-4">
      <input ref={continuar} type="hidden" name="continuar" defaultValue="" />
      {modelo && !copia && <input type="hidden" name="id" value={modelo.id} />}
      <input type="hidden" name="itens" value={JSON.stringify(itens)} />

      <Cartao className="space-y-4">
        <Campo rotulo="Nome do check-list">
          <Input
            name="nome"
            defaultValue={copia ? `Cópia de ${modelo?.nome}` : modelo?.nome}
            autoFocus={copia}
            onFocus={(e) => copia && e.currentTarget.select()}
            placeholder="Ex.: Abertura da cozinha" required
          />
        </Campo>
        <Campo rotulo="Descrição">
          <Textarea name="descricao" rows={2} defaultValue={modelo?.descricao ?? ""} />
        </Campo>
        <div className="grid gap-4 sm:grid-cols-3">
          <Campo rotulo="Horário preferencial">
            <Input type="time" name="horario_preferencial" defaultValue={modelo?.horario_preferencial?.slice(0, 5) ?? "08:00"} required />
          </Campo>
          <Campo rotulo="Tolerância (min)" dica="Depois disso fica atrasado">
            <Input type="number" min={0} name="tolerancia_minutos" defaultValue={modelo?.tolerancia_minutos ?? 30} />
          </Campo>
          <Campo rotulo="Lembrete antes (min)" dica="O responsável recebe no WhatsApp. 0 = sem lembrete.">
            <Input type="number" min={0} max={720} name="lembrete_minutos" defaultValue={modelo?.lembrete_minutos ?? 30} />
          </Campo>
          <Campo rotulo="Repetir">
            <SeletorRecorrencia inicial={regra} />
          </Campo>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Unidade">
            <Select name="unidade_id" defaultValue={modelo?.unidade_id ?? ""}>
              <option value="">Todas as unidades</option>
              {unidades.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nome}
                </option>
              ))}
            </Select>
          </Campo>
          <Campo rotulo="Setor">
            <Select name="setor_id" defaultValue={modelo?.setor_id ?? ""}>
              <option value="">—</option>
              {setores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </Select>
          </Campo>
          <div className="sm:col-span-2">
            <SeletorResponsaveis
              rotulo="Responsáveis"
              name="responsaveis"
              inicial={modelo?.responsaveis ?? []}
              membros={membros}
              setores={setores}
              dica="Cada um recebe a tarefa, o lembrete e o resumo do dia; puxam a equipe mesmo com o check-list aberto a todos"
            />
          </div>
          <Campo rotulo="Categoria">
            <Select name="categoria_id" defaultValue={modelo?.categoria_id ?? ""}>
              <option value="">—</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Select>
          </Campo>
          <Campo rotulo="Recebe o resultado" dica="Recebe o resumo no WhatsApp quando o check-list é concluído">
            <Select name="resultado_membro_id" defaultValue={modelo?.resultado_membro_id ?? ""}>
              <option value="">—</option>
              {membros.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome}
                </option>
              ))}
            </Select>
          </Campo>
          <Campo rotulo="Situação">
            <Select name="ativo" defaultValue={String(modelo?.ativo ?? true)}>
              <option value="true">Ativo</option>
              <option value="false">Inativo</option>
            </Select>
          </Campo>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="publico_qr" defaultChecked={modelo?.publico_qr ?? true} />
          Disponível no QR Code da unidade (preenchimento sem login)
        </label>
        <Campo rotulo="Quem preenche pelo QR Code">
          <Select name="modo_executor" defaultValue={modelo?.modo_executor ?? "aberto"}>
            <option value="aberto">Aberto: a pessoa digita o próprio nome, sem PIN</option>
            <option value="usuarios">Só usuários: escolhe o nome na lista e digita o PIN</option>
          </Select>
        </Campo>
      </Cartao>

      <Cartao className="space-y-3">
        <div>
          <h2 className="font-medium">Itens</h2>
          <p className="text-xs text-slate-500">Arraste pela alça ⋮⋮ para mudar a ordem.</p>
        </div>
        <div ref={lista} className="space-y-3">
          {itens.map((item, i) => (
            <div
              key={item.chave}
              data-item={item.chave}
              className={`space-y-2 rounded-lg border p-3 ${
                arrastando === item.chave ? "border-blue-500 bg-blue-50 shadow-md" : "border-slate-200"
              }`}
            >
              <div className="flex gap-2">
                <button
                  type="button"
                  aria-label="Arrastar para mudar a ordem"
                  title="Arrastar para mudar a ordem"
                  onPointerDown={(e) => iniciarArraste(e, item.chave)}
                  onPointerMove={arrastar}
                  onPointerUp={() => setArrastando(null)}
                  onPointerCancel={() => setArrastando(null)}
                  className="-ml-1 flex shrink-0 cursor-grab touch-none items-center text-slate-400 hover:text-slate-600 active:cursor-grabbing"
                >
                  <GripVertical size={18} />
                </button>
                <span className="pt-2 text-sm text-slate-400">{i + 1}.</span>
                <Input
                  value={item.texto}
                  onChange={(e) => alterar(item.chave, { texto: e.target.value })}
                  placeholder="Ex.: Freezer funcionando?"
                />
                <Select
                  value={item.tipo_resposta}
                  onChange={(e) => alterar(item.chave, { tipo_resposta: e.target.value as TipoResposta })}
                  className="w-56"
                >
                  <option value="sim_nao">Sim / Não / Em processo</option>
                  <option value="numero">Número</option>
                  <option value="texto">Texto</option>
                </Select>
              </div>
              <div className="flex flex-wrap items-center gap-4 pl-6 text-xs text-slate-600">
                <label className="flex items-center gap-1">
                  <input type="checkbox" checked={item.obrigatorio} onChange={(e) => alterar(item.chave, { obrigatorio: e.target.checked })} />
                  Obrigatório
                </label>
                <label className="flex items-center gap-1">
                  <input type="checkbox" checked={item.permite_foto} onChange={(e) => alterar(item.chave, { permite_foto: e.target.checked })} />
                  Permite foto
                </label>
                {item.permite_foto && (
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={item.foto_obrigatoria}
                      onChange={(e) => alterar(item.chave, { foto_obrigatoria: e.target.checked })}
                    />
                    Foto obrigatória (câmera)
                  </label>
                )}
                {item.tipo_resposta === "sim_nao" && (
                  <label className="flex items-center gap-1">
                    <input type="checkbox" checked={item.permite_na} onChange={(e) => alterar(item.chave, { permite_na: e.target.checked })} />
                    Mostrar N/A
                  </label>
                )}
                {item.tipo_resposta === "sim_nao" && (
                  <label className="flex items-center gap-1">
                    Problema:
                    <select
                      value={item.problema_quando}
                      onChange={(e) => alterar(item.chave, { problema_quando: e.target.value as ProblemaQuando })}
                      className="rounded border border-slate-200 bg-superficie px-1 py-0.5"
                    >
                      {PROBLEMA_QUANDO.map((o) => (
                        <option key={o.valor} value={o.valor}>
                          {o.rotulo}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {item.tipo_resposta === "sim_nao" && item.problema_quando === "nao" && item.permite_foto && !item.foto_obrigatoria && (
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={item.foto_obrigatoria_se_nao}
                      onChange={(e) => alterar(item.chave, { foto_obrigatoria_se_nao: e.target.checked })}
                    />
                    Foto obrigatória se &quot;Não&quot;
                  </label>
                )}
                {item.tipo_resposta === "sim_nao" && item.problema_quando === "nao" && (
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={item.abre_chamado_se_nao}
                      onChange={(e) => alterar(item.chave, { abre_chamado_se_nao: e.target.checked })}
                    />
                    Abrir chamado se &quot;Não&quot;
                    {item.abre_chamado_se_nao && (
                      <select
                        value={item.prioridade_chamado}
                        onChange={(e) => alterar(item.chave, { prioridade_chamado: e.target.value as Prioridade })}
                        className="ml-1 rounded border border-slate-200 bg-superficie px-1 py-0.5"
                      >
                        {Object.entries(PRIORIDADES).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v.rotulo}
                          </option>
                        ))}
                      </select>
                    )}
                  </label>
                )}
                <span className="ml-auto flex gap-2">
                  <button type="button" onClick={() => mover(i, -1)} disabled={i === 0} className="disabled:opacity-30">↑</button>
                  <button type="button" onClick={() => mover(i, 1)} disabled={i === itens.length - 1} className="disabled:opacity-30">↓</button>
                  <button type="button" onClick={() => setItens((xs) => xs.filter((x) => x.chave !== item.chave))} className="text-red-600">
                    Remover
                  </button>
                </span>
              </div>
            </div>
          ))}
        </div>
        <Botao type="button" variante="secundario" onClick={() => setItens((xs) => [...xs, novoItem()])}>
          + Adicionar item
        </Botao>
      </Cartao>

      {estado?.erro && <Aviso>{estado.erro}</Aviso>}
      <div className="flex flex-wrap gap-2">
        <BotaoEnviar onClick={() => marcar("")}>Salvar check-list</BotaoEnviar>
        <BotaoEnviar variante="secundario" onClick={() => marcar("1")}>
          Salvar e copiar
        </BotaoEnviar>
      </div>
    </form>
  );
}
