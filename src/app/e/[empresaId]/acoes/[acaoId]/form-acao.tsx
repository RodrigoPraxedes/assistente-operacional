"use client";

import { useActionState, useState } from "react";
import { excluirAcao, salvarAcao } from "../actions";
import { SeletorRecorrencia } from "@/components/seletor-recorrencia";
import type { Acao } from "@/lib/types";
import { Aviso, Botao, Campo, Cartao, Input, Select, Textarea } from "@/components/ui";
import { BotaoEnviar } from "@/components/botao-enviar";
import { CampoVisibilidade } from "@/components/campo-visibilidade";
import { SeletorResponsaveis } from "@/components/seletor-responsaveis";

type Opcao = { id: string; nome: string };

export function FormAcao({
  empresaId,
  acao,
  modelo,
  hoje,
  unidades,
  setores,
  categorias,
  membros,
  podeMudarPrivado,
}: {
  empresaId: string;
  acao: Acao | null;
  // ação de origem de "criar nova a partir desta" (formulário novo pré-preenchido)
  modelo?: Acao | null;
  podeMudarPrivado: boolean;
  hoje: string;
  unidades: Opcao[];
  setores: Opcao[];
  categorias: Opcao[];
  membros: (Opcao & { setor_id: string | null })[];
}) {
  const [estado, acaoForm] = useActionState(salvarAcao.bind(null, empresaId), undefined);
  const base = acao ?? modelo;
  const inicial = base?.recorrencia ?? "";
  const [regra, setRegra] = useState(inicial);

  return (
    <form action={acaoForm} className="space-y-4">
      {acao && <input type="hidden" name="id" value={acao.id} />}
      <Cartao className="space-y-4">
        <Campo rotulo="Nome da ação">
          <Input name="nome" defaultValue={modelo ? `Cópia de ${modelo.nome}` : base?.nome} autoFocus={!!modelo} onFocus={(e) => modelo && e.currentTarget.select()} placeholder="Ex.: Limpeza da caixa d'água" required />
        </Campo>
        <Campo rotulo="Detalhes">
          <Textarea name="descricao" rows={2} defaultValue={base?.descricao ?? ""} />
        </Campo>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Repetir">
            <SeletorRecorrencia inicial={inicial} permitirNenhuma onChange={setRegra} />
          </Campo>
          <Campo rotulo="Horário">
            <Input type="time" name="horario" defaultValue={base?.horario?.slice(0, 5) ?? "09:00"} required />
          </Campo>
          <Campo rotulo={regra ? "Data inicial" : "Data"}>
            <Input type="date" name="data_inicial" defaultValue={base?.data_inicial ?? hoje} required />
          </Campo>
          {regra && (
            <Campo rotulo="Data final" dica="Vazio = repete sem fim">
              <Input type="date" name="data_final" defaultValue={base?.data_final ?? ""} />
            </Campo>
          )}
          <Campo rotulo="Prazo (horas depois do horário)" dica="Depois disso a tarefa aparece como atrasada">
            <Input type="number" min={0} name="prazo_horas" defaultValue={base?.prazo_horas ?? 8} />
          </Campo>
          <div className="sm:col-span-2">
            <SeletorResponsaveis
              name="responsaveis"
              inicial={base?.responsaveis ?? []}
              membros={membros}
              setores={setores}
              dica="Com várias pessoas, cada ocorrência vira uma tarefa só para todas"
            />
          </div>
          <Campo rotulo="Unidade" dica="Todas = uma tarefa para cada unidade">
            <Select name="unidade_id" defaultValue={base?.unidade_id ?? (unidades.length === 1 ? unidades[0].id : "")}>
              <option value="">Todas as unidades</option>
              {unidades.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nome}
                </option>
              ))}
            </Select>
          </Campo>
          <Campo rotulo="Setor">
            <Select name="setor_id" defaultValue={base?.setor_id ?? ""}>
              <option value="">—</option>
              {setores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </Select>
          </Campo>
          <Campo rotulo="Categoria">
            <Select name="categoria_id" defaultValue={base?.categoria_id ?? ""}>
              <option value="">—</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Select>
          </Campo>
          <CampoVisibilidade privado={base?.privado} podeMudar={podeMudarPrivado} perguntar={!base} />
          {base && (
            <Campo rotulo="Situação">
              <Select name="ativo" defaultValue={String(base.ativo)}>
                <option value="true">Ativa</option>
                <option value="false">Inativa (para de gerar tarefas)</option>
              </Select>
            </Campo>
          )}
        </div>
      </Cartao>

      {estado?.erro && <Aviso>{estado.erro}</Aviso>}
      <div className="flex justify-between">
        <div className="flex flex-wrap gap-2">
          <BotaoEnviar>Salvar ação</BotaoEnviar>
          <BotaoEnviar variante="secundario" name="continuar" value="1">
            Salvar e criar nova a partir desta
          </BotaoEnviar>
        </div>
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
