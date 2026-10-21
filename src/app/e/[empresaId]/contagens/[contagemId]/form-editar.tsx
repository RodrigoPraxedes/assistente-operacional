"use client";

import { useActionState, useState } from "react";
import { salvarContagem } from "../actions";
import { DIAS_SEMANA } from "@/lib/rotinas";
import type { Contagem, ContagemItem } from "@/lib/types";
import { Aviso, Botao, Campo, Cartao, Input, Select, Textarea } from "@/components/ui";
import { BotaoEnviar } from "@/components/botao-enviar";
import { SeletorRecorrencia } from "@/components/seletor-recorrencia";
import { SeletorResponsaveis } from "@/components/seletor-responsaveis";

type Opcao = { id: string; nome: string };
type ItemEditavel = { id?: string; chave: string; nome: string; unidade_medida: string; metas: string[] };

let seq = 0;
const novoItem = (): ItemEditavel => ({ chave: `novo-${++seq}`, nome: "", unidade_medida: "unidades", metas: Array(7).fill("") });

export function FormEditarContagem({
  empresaId,
  contagem,
  itens: iniciais,
  unidades,
  setores,
  membros,
}: {
  empresaId: string;
  contagem: Contagem | null;
  itens: ContagemItem[];
  unidades: Opcao[];
  setores: Opcao[];
  membros: Opcao[];
}) {
  const [estado, acao] = useActionState(salvarContagem.bind(null, empresaId), undefined);
  const [usaMeta, setUsaMeta] = useState(contagem?.usa_meta ?? false);
  const [turnosTexto, setTurnosTexto] = useState(contagem?.turnos.join(", ") ?? "");
  const [agendada, setAgendada] = useState(contagem?.agendada ?? false);
  // um horário por turno; guardados pelo nome do turno para não trocar ao editar a lista
  const [horarios, setHorarios] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      (contagem?.turnos.length ? contagem.turnos : [""]).map((t, i) => [t, contagem?.horarios?.[i]?.slice(0, 5) ?? ""]),
    ),
  );
  const turnos = [...new Set(turnosTexto.split(",").map((t) => t.trim()).filter(Boolean))].slice(0, 6);
  const [itens, setItens] = useState<ItemEditavel[]>(
    iniciais.length
      ? iniciais.map((i) => ({
          id: i.id,
          chave: i.id,
          nome: i.nome,
          unidade_medida: i.unidade_medida ?? "",
          metas: Array.from({ length: 7 }, (_, d) => (i.metas?.[d] === null || i.metas?.[d] === undefined ? "" : String(i.metas[d]))),
        }))
      : [novoItem()],
  );

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
      {contagem && <input type="hidden" name="id" value={contagem.id} />}
      <input type="hidden" name="itens" value={JSON.stringify(itens)} />

      <Cartao className="space-y-4">
        <Campo rotulo="Nome da contagem">
          <Input name="nome" defaultValue={contagem?.nome} placeholder="Ex.: Contagem da churrasqueira" required maxLength={120} />
        </Campo>
        <Campo rotulo="Instrução (opcional)" dica="Aparece para quem vai contar. Ex.: contar no início do turno.">
          <Textarea name="descricao" rows={2} defaultValue={contagem?.descricao ?? ""} />
        </Campo>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Turnos" dica='Separe por vírgula, ex.: "Dia, Noite". Vazio = sem turno.'>
            <Input name="turnos" value={turnosTexto} onChange={(e) => setTurnosTexto(e.target.value)} placeholder="Dia, Noite" />
          </Campo>
          <Campo rotulo="Unidade">
            <Select name="unidade_id" defaultValue={contagem?.unidade_id ?? ""}>
              <option value="">Todas as unidades</option>
              {unidades.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nome}
                </option>
              ))}
            </Select>
          </Campo>
          <Campo rotulo="Setor">
            <Select name="setor_id" defaultValue={contagem?.setor_id ?? ""}>
              <option value="">—</option>
              {setores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </Select>
          </Campo>
          <Campo rotulo="Situação">
            <Select name="ativo" defaultValue={String(contagem?.ativo ?? true)}>
              <option value="true">Ativa</option>
              <option value="false">Inativa</option>
            </Select>
          </Campo>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="publico_qr" defaultChecked={contagem?.publico_qr ?? true} />
          Disponível no QR Code da unidade (a pessoa digita o nome, sem login)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="usa_meta" checked={usaMeta} onChange={(e) => setUsaMeta(e.target.checked)} />
          Usar meta por dia da semana (o app mostra quanto falta)
        </label>
        {usaMeta && (
          <Campo rotulo="Nome da coluna do que falta" dica='Ex.: "Embalar", "Produzir", "Repor".'>
            <Input name="rotulo_falta" defaultValue={contagem?.rotulo_falta ?? "Falta"} maxLength={30} className="sm:w-60" />
          </Campo>
        )}
        {usaMeta && (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="pede_vai_fazer" defaultChecked={contagem?.pede_vai_fazer ?? true} className="mt-1" />
            <span>
              Pedir quanto vai fazer
              <span className="block text-xs text-slate-500">
                Um segundo campo por item (com o nome da coluna acima) para lançar o que vai ser feito de fato. Vem com a
                sugestão; em branco, vale a sugestão.
              </span>
            </span>
          </label>
        )}
      </Cartao>

      <Cartao className="space-y-4">
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="agendada" checked={agendada} onChange={(e) => setAgendada(e.target.checked)} className="mt-1" />
          <span>
            <span className="font-medium">Horário, lembrete e WhatsApp</span>
            <span className="block text-xs text-slate-500">
              Como no check-list: vira tarefa no Kanban no horário, o responsável recebe lembrete e quem você escolher
              recebe o resultado.
            </span>
          </span>
        </label>
        {agendada && (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              {(turnos.length ? turnos : [""]).map((t, i) => (
                <Campo key={t || "unico"} rotulo={t ? `Horário · ${t}` : "Horário"}>
                  <Input
                    type="time"
                    name={`horario_${i}`}
                    required
                    value={horarios[t] ?? ""}
                    onChange={(e) => setHorarios((h) => ({ ...h, [t]: e.target.value }))}
                  />
                </Campo>
              ))}
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Campo rotulo="Tolerância (min)" dica="Depois disso fica atrasada">
                <Input type="number" min={0} max={1440} name="tolerancia_minutos" defaultValue={contagem?.tolerancia_minutos ?? 30} />
              </Campo>
              <Campo rotulo="Lembrete antes (min)" dica="O responsável recebe no WhatsApp. 0 = sem lembrete.">
                <Input type="number" min={0} max={720} name="lembrete_minutos" defaultValue={contagem?.lembrete_minutos ?? 30} />
              </Campo>
              <Campo rotulo="Repetir">
                <SeletorRecorrencia inicial={contagem?.recorrencia ?? "FREQ=DAILY"} />
              </Campo>
            </div>
            <SeletorResponsaveis
              rotulo="Responsáveis"
              name="responsaveis"
              inicial={contagem?.responsaveis ?? []}
              membros={membros}
              setores={setores}
              dica="Cada um recebe a tarefa e o lembrete; puxam a equipe mesmo com a contagem aberta a todos"
            />
            <Campo rotulo="Recebe o resultado" dica="Recebe no WhatsApp as quantidades (e o que falta) quando a contagem é enviada">
              <Select name="resultado_membro_id" defaultValue={contagem?.resultado_membro_id ?? ""}>
                <option value="">—</option>
                {membros.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome}
                  </option>
                ))}
              </Select>
            </Campo>
          </>
        )}
      </Cartao>

      <Cartao className="space-y-3">
        <div>
          <h2 className="font-medium">Itens</h2>
          <p className="text-xs text-slate-500">
            Um por produto. {usaMeta && "Em cada dia, a quantidade que precisa ter; vazio = sem meta naquele dia."}
          </p>
        </div>
        <div className="space-y-3">
          {itens.map((item, i) => (
            <div key={item.chave} className="space-y-2 rounded-lg border border-slate-200 p-3">
              <div className="flex flex-wrap gap-2">
                <span className="pt-2 text-sm text-slate-400">{i + 1}.</span>
                <Input
                  value={item.nome}
                  onChange={(e) => alterar(item.chave, { nome: e.target.value })}
                  placeholder="Ex.: Frango assado"
                  className="min-w-40 flex-1"
                  maxLength={120}
                />
                <div className="w-40 shrink-0">
                  <Input
                    value={item.unidade_medida}
                    onChange={(e) => alterar(item.chave, { unidade_medida: e.target.value })}
                    placeholder="unidades, varas, kg..."
                    maxLength={40}
                    aria-label="Unidade de medida"
                  />
                </div>
              </div>
              {usaMeta && (
                <div className="flex flex-wrap items-end gap-1 pl-5">
                  {DIAS_SEMANA.map((d, k) => (
                    <label key={d.n} className="w-14 text-center text-xs text-slate-500">
                      {d.curto}
                      <Input
                        value={item.metas[k]}
                        onChange={(e) => alterar(item.chave, { metas: item.metas.map((m, j) => (j === k ? e.target.value : m)) })}
                        inputMode="decimal"
                        className="px-1 text-center"
                      />
                    </label>
                  ))}
                  <button
                    type="button"
                    className="mb-2 ml-1 text-xs text-blue-600"
                    onClick={() => alterar(item.chave, { metas: Array(7).fill(item.metas[0]) })}
                  >
                    Repetir Seg em todos
                  </button>
                </div>
              )}
              <div className="flex justify-end gap-3 text-xs">
                <button type="button" onClick={() => mover(i, -1)} disabled={i === 0} className="disabled:opacity-30" aria-label="Subir">
                  ↑
                </button>
                <button type="button" onClick={() => mover(i, 1)} disabled={i === itens.length - 1} className="disabled:opacity-30" aria-label="Descer">
                  ↓
                </button>
                <button type="button" onClick={() => setItens((xs) => xs.filter((x) => x.chave !== item.chave))} className="text-red-600">
                  Remover
                </button>
              </div>
            </div>
          ))}
        </div>
        <Botao type="button" variante="secundario" onClick={() => setItens((xs) => [...xs, novoItem()])}>
          + Adicionar item
        </Botao>
      </Cartao>

      {estado?.erro && <Aviso>{estado.erro}</Aviso>}
      <BotaoEnviar>Salvar contagem</BotaoEnviar>
    </form>
  );
}
