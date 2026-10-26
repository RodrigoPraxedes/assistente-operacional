"use client";

import { useActionState, useRef, useState } from "react";
import { excluirAcao, salvarAcao } from "../actions";
import { SeletorRecorrencia } from "@/components/seletor-recorrencia";
import type { Acao } from "@/lib/types";
import { Aviso, Botao, Campo, Cartao, Input, Select, Textarea } from "@/components/ui";
import { BotaoEnviar } from "@/components/botao-enviar";
import { CampoVisibilidade } from "@/components/campo-visibilidade";
import { SeletorResponsaveis } from "@/components/seletor-responsaveis";
import { SeletorComBusca } from "@/components/seletor-com-busca";
import { CampoTodosConcluem } from "@/components/campo-todos-concluem";

type Opcao = { id: string; nome: string };

const emMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

// Prazo como hora do relógio ("vence às 18:00") + dias depois; o banco guarda os minutos depois do horário.
function CampoPrazo({ horario, inicial }: { horario: string; inicial: number }) {
  const base = emMin(horario);
  const [hora, setHora] = useState(() => hhmm((base + inicial) % 1440));
  const [dias, setDias] = useState(() => Math.floor((base + inicial) / 1440));
  // a hora de vencimento só pode ser antes do horário se cair em outro dia
  const total = Math.max(0, dias * 1440 + emMin(hora) - base);
  const diasReais = Math.floor((base + total) / 1440);
  const resumo =
    diasReais === 0 ? "no mesmo dia" : diasReais === 1 ? "no dia seguinte" : `${diasReais} dias depois`;
  return (
    <Campo rotulo="Prazo" dica={`Cada ocorrência vence às ${hhmm((base + total) % 1440)} (${resumo}); depois disso aparece como atrasada`}>
      <input type="hidden" name="prazo_minutos" value={total} />
      <div className="flex gap-2">
        <Input type="time" value={hora} onChange={(e) => setHora(e.target.value)} required />
        <Select value={dias} onChange={(e) => setDias(Number(e.target.value))}>
          <option value={0}>No mesmo dia</option>
          {[1, 2, 3, 4, 5, 6, 7].map((d) => (
            <option key={d} value={d}>
              {d === 1 ? "+1 dia" : `+${d} dias`}
            </option>
          ))}
        </Select>
      </div>
    </Campo>
  );
}

export function FormAcao({
  empresaId,
  acao,
  modelo,
  hoje,
  unidades,
  setores,
  categorias,
  equipamentos,
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
  equipamentos: Opcao[];
  membros: (Opcao & { setor_id: string | null })[];
}) {
  const [estado, acaoForm] = useActionState(salvarAcao.bind(null, empresaId), undefined);
  const base = acao ?? modelo;
  const inicial = base?.recorrencia ?? "";
  const [regra, setRegra] = useState(inicial);
  const [horario, setHorario] = useState(base?.horario?.slice(0, 5) ?? "09:00");
  // o aviso de visibilidade reenvia o formulário sem o botão clicado; por isso a escolha vai num campo oculto
  const continuar = useRef<HTMLInputElement>(null);
  const marcar = (v: string) => continuar.current && (continuar.current.value = v);

  return (
    <form action={acaoForm} className="space-y-4">
      <input ref={continuar} type="hidden" name="continuar" defaultValue="" />
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
            <Input type="time" name="horario" value={horario} onChange={(e) => setHorario(e.target.value)} required />
          </Campo>
          <Campo rotulo={regra ? "Data inicial" : "Data"}>
            <Input type="date" name="data_inicial" defaultValue={base?.data_inicial ?? hoje} required />
          </Campo>
          {regra && (
            <Campo rotulo="Data final" dica="Vazio = repete sem fim">
              <Input type="date" name="data_final" defaultValue={base?.data_final ?? ""} />
            </Campo>
          )}
          {regra && (
            <label className="flex items-start gap-2 text-sm sm:col-span-2">
              <input type="checkbox" name="contar_da_conclusao" defaultChecked={base?.contar_da_conclusao ?? false} className="mt-1" />
              <span>
                Contar a próxima a partir da data da conclusão
                <span className="block text-xs text-slate-500">
                  Desligado, a próxima segue o calendário (data inicial + repetição). Ligado, a próxima só nasce depois que
                  você conclui e conta da data da conclusão: concluir em 28/10 uma ação &quot;a cada 5 meses&quot; gera a próxima em 28/03.
                </span>
              </span>
            </label>
          )}
          <CampoPrazo horario={horario} inicial={base?.prazo_minutos ?? 480} />
          <div className="sm:col-span-2">
            <SeletorResponsaveis
              name="responsaveis"
              inicial={base?.responsaveis ?? []}
              membros={membros}
              setores={setores}
              dica="Com várias pessoas, cada ocorrência vira uma tarefa só para todas"
            />
          </div>
          <div className="sm:col-span-2">
            <CampoTodosConcluem padrao={base?.todos_concluem ?? false} />
          </div>
          <div className="sm:col-span-2">
            <SeletorResponsaveis
              rotulo="Avisar também (ciente)"
              name="cientes"
              inicial={base?.cientes ?? []}
              membros={membros}
              setores={setores}
              vazio="Ninguém além dos responsáveis"
              dica="Recebem o aviso no WhatsApp e enxergam a tarefa, mas não precisam concluir"
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
          <Campo rotulo="Equipamento ou móvel" dica="Opcional: item do Patrimônio a que esta ação se refere (limpeza, revisão, troca de filtro...)">
            <SeletorComBusca name="equipamento_id" opcoes={equipamentos} inicial={base?.equipamento_id ?? ""} vazio="Nenhum" />
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
          <BotaoEnviar onClick={() => marcar("")}>Salvar ação</BotaoEnviar>
          <BotaoEnviar variante="secundario" onClick={() => marcar("1")}>
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
