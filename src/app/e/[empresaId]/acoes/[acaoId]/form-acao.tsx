"use client";

import { useActionState, useState } from "react";
import { excluirAcao, salvarAcao } from "../actions";
import { RECORRENCIAS_PRONTAS } from "@/lib/recorrencias-prontas";
import type { Acao } from "@/lib/types";
import { Aviso, Botao, Campo, Cartao, Input, Select, Textarea } from "@/components/ui";
import { BotaoEnviar } from "@/components/botao-enviar";

type Opcao = { id: string; nome: string };

export function FormAcao({
  empresaId,
  acao,
  hoje,
  unidades,
  setores,
  categorias,
  membros,
}: {
  empresaId: string;
  acao: Acao | null;
  hoje: string;
  unidades: Opcao[];
  setores: Opcao[];
  categorias: Opcao[];
  membros: Opcao[];
}) {
  const [estado, acaoForm] = useActionState(salvarAcao.bind(null, empresaId), undefined);
  const inicial = acao?.recorrencia ?? "";
  const [regra, setRegra] = useState(inicial);
  const [personalizada, setPersonalizada] = useState(!!inicial && !RECORRENCIAS_PRONTAS.some((r) => r.regra === inicial));

  return (
    <form action={acaoForm} className="space-y-4">
      {acao && <input type="hidden" name="id" value={acao.id} />}
      <Cartao className="space-y-4">
        <Campo rotulo="Nome da ação">
          <Input name="nome" defaultValue={acao?.nome} placeholder="Ex.: Limpeza da caixa d'água" required />
        </Campo>
        <Campo rotulo="Detalhes">
          <Textarea name="descricao" rows={2} defaultValue={acao?.descricao ?? ""} />
        </Campo>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Repetir">
            {personalizada ? (
              <Input
                name="recorrencia"
                value={regra}
                onChange={(e) => setRegra(e.target.value)}
                placeholder="RRULE, ex.: FREQ=MONTHLY;BYMONTHDAY=10"
              />
            ) : (
              <Select
                name="recorrencia"
                value={regra}
                onChange={(e) => (e.target.value === "__outra" ? setPersonalizada(true) : setRegra(e.target.value))}
              >
                <option value="">Não repete (uma vez só)</option>
                {RECORRENCIAS_PRONTAS.map((r) => (
                  <option key={r.regra} value={r.regra}>
                    {r.rotulo}
                  </option>
                ))}
                <option value="__outra">Outra regra...</option>
              </Select>
            )}
          </Campo>
          <Campo rotulo="Horário">
            <Input type="time" name="horario" defaultValue={acao?.horario?.slice(0, 5) ?? "09:00"} required />
          </Campo>
          <Campo rotulo={regra ? "Data inicial" : "Data"}>
            <Input type="date" name="data_inicial" defaultValue={acao?.data_inicial ?? hoje} required />
          </Campo>
          {regra && (
            <Campo rotulo="Data final" dica="Vazio = repete sem fim">
              <Input type="date" name="data_final" defaultValue={acao?.data_final ?? ""} />
            </Campo>
          )}
          <Campo rotulo="Prazo (horas depois do horário)" dica="Depois disso a tarefa aparece como atrasada">
            <Input type="number" min={0} name="prazo_horas" defaultValue={acao?.prazo_horas ?? 8} />
          </Campo>
          <Campo rotulo="Responsável">
            <Select name="responsavel_id" defaultValue={acao?.responsavel_id ?? ""}>
              <option value="">—</option>
              {membros.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome}
                </option>
              ))}
            </Select>
          </Campo>
          <Campo rotulo="Unidade" dica="Todas = uma tarefa para cada unidade">
            <Select name="unidade_id" defaultValue={acao?.unidade_id ?? (unidades.length === 1 ? unidades[0].id : "")}>
              <option value="">Todas as unidades</option>
              {unidades.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nome}
                </option>
              ))}
            </Select>
          </Campo>
          <Campo rotulo="Setor">
            <Select name="setor_id" defaultValue={acao?.setor_id ?? ""}>
              <option value="">—</option>
              {setores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </Select>
          </Campo>
          <Campo rotulo="Categoria">
            <Select name="categoria_id" defaultValue={acao?.categoria_id ?? ""}>
              <option value="">—</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Select>
          </Campo>
          {acao && (
            <Campo rotulo="Situação">
              <Select name="ativo" defaultValue={String(acao.ativo)}>
                <option value="true">Ativa</option>
                <option value="false">Inativa (para de gerar tarefas)</option>
              </Select>
            </Campo>
          )}
        </div>
      </Cartao>

      {estado?.erro && <Aviso>{estado.erro}</Aviso>}
      <div className="flex justify-between">
        <BotaoEnviar>Salvar ação</BotaoEnviar>
        {acao && (
          <Botao
            type="button"
            variante="perigo"
            onClick={() => confirm("Excluir esta ação? As tarefas já criadas continuam no Kanban.") && excluirAcao(empresaId, acao.id)}
          >
            Excluir
          </Botao>
        )}
      </div>
    </form>
  );
}
