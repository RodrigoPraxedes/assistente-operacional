"use client";

import { useActionState, useState } from "react";
import { salvarModelo } from "../actions";
import { RECORRENCIAS_PRONTAS } from "@/lib/recorrencias-prontas";
import type { ChecklistItem, ChecklistModelo, TipoResposta } from "@/lib/types";
import { Aviso, Botao, Campo, Cartao, Input, Select, Textarea } from "@/components/ui";
import { BotaoEnviar } from "@/components/botao-enviar";

type Opcao = { id: string; nome: string };
type ItemEditavel = Pick<ChecklistItem, "texto" | "tipo_resposta" | "obrigatorio" | "permite_foto" | "foto_obrigatoria_se_nao"> & {
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
  foto_obrigatoria_se_nao: false,
});

export function FormModelo({
  empresaId,
  modelo,
  itens: iniciais,
  unidades,
  setores,
  categorias,
  membros,
}: {
  empresaId: string;
  modelo: ChecklistModelo | null;
  itens: ChecklistItem[];
  unidades: Opcao[];
  setores: Opcao[];
  categorias: Opcao[];
  membros: Opcao[];
}) {
  const [estado, acao] = useActionState(salvarModelo.bind(null, empresaId), undefined);
  const [itens, setItens] = useState<ItemEditavel[]>(
    iniciais.length ? iniciais.map((i) => ({ ...i, chave: i.id })) : [novoItem()],
  );
  const regra = modelo?.recorrencia ?? "FREQ=DAILY";
  const [personalizada, setPersonalizada] = useState(!RECORRENCIAS_PRONTAS.some((r) => r.regra === regra));

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

  return (
    <form action={acao} className="space-y-4">
      {modelo && <input type="hidden" name="id" value={modelo.id} />}
      <input type="hidden" name="itens" value={JSON.stringify(itens)} />

      <Cartao className="space-y-4">
        <Campo rotulo="Nome do check-list">
          <Input name="nome" defaultValue={modelo?.nome} placeholder="Ex.: Abertura da cozinha" required />
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
          <Campo rotulo="Repetir">
            {personalizada ? (
              <Input name="recorrencia" defaultValue={regra} placeholder="RRULE, ex.: FREQ=WEEKLY;BYDAY=MO,TH" />
            ) : (
              <Select
                name="recorrencia"
                defaultValue={regra}
                onChange={(e) => e.target.value === "__outra" && setPersonalizada(true)}
              >
                {RECORRENCIAS_PRONTAS.map((r) => (
                  <option key={r.regra} value={r.regra}>
                    {r.rotulo}
                  </option>
                ))}
                <option value="__outra">Outra regra...</option>
              </Select>
            )}
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
          <Campo rotulo="Responsável" dica="Recebe a tarefa no Kanban">
            <Select name="responsavel_id" defaultValue={modelo?.responsavel_id ?? ""}>
              <option value="">—</option>
              {membros.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome}
                </option>
              ))}
            </Select>
          </Campo>
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
          <Campo rotulo="WhatsApp que recebe o resumo" dica="Com DDD. Vazio = a pessoa escolhe o contato.">
            <Input name="whatsapp_destino" defaultValue={modelo?.whatsapp_destino ?? ""} inputMode="tel" />
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
          Disponível no QR Code da unidade (preenchimento sem login, com nome + PIN)
        </label>
      </Cartao>

      <Cartao className="space-y-3">
        <h2 className="font-medium">Itens</h2>
        {itens.map((item, i) => (
          <div key={item.chave} className="space-y-2 rounded-lg border border-slate-200 p-3">
            <div className="flex gap-2">
              <span className="pt-2 text-sm text-slate-400">{i + 1}.</span>
              <Input
                value={item.texto}
                onChange={(e) => alterar(item.chave, { texto: e.target.value })}
                placeholder="Ex.: Freezer funcionando?"
              />
              <Select
                value={item.tipo_resposta}
                onChange={(e) => alterar(item.chave, { tipo_resposta: e.target.value as TipoResposta })}
                className="w-40"
              >
                <option value="sim_nao">Sim / Não</option>
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
              {item.tipo_resposta === "sim_nao" && item.permite_foto && (
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={item.foto_obrigatoria_se_nao}
                    onChange={(e) => alterar(item.chave, { foto_obrigatoria_se_nao: e.target.checked })}
                  />
                  Foto obrigatória se &quot;Não&quot;
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
        <Botao type="button" variante="secundario" onClick={() => setItens((xs) => [...xs, novoItem()])}>
          + Adicionar item
        </Botao>
      </Cartao>

      {estado?.erro && <Aviso>{estado.erro}</Aviso>}
      <BotaoEnviar>Salvar check-list</BotaoEnviar>
    </form>
  );
}
