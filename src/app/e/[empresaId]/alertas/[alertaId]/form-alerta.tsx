"use client";

import { useActionState, useRef, useState } from "react";
import { excluirAlerta, salvarAlerta } from "../actions";
import type { Alerta, AlertaAviso } from "@/lib/types";
import { Aviso, Botao, Campo, Cartao, Input, Select, Textarea } from "@/components/ui";
import { BotaoEnviar } from "@/components/botao-enviar";
import { CampoVisibilidade } from "@/components/campo-visibilidade";
import { SeletorResponsaveis } from "@/components/seletor-responsaveis";
import { CampoData } from "@/components/campo-data";
import { SeletorRecorrencia } from "@/components/seletor-recorrencia";

type Opcao = { id: string; nome: string };
type LinhaAviso = {
  id?: string;
  dias_antes: number;
  titulo: string;
  responsaveis: string[];
  cientes: string[];
};

export function FormAlerta({
  empresaId,
  alerta,
  modelo,
  avisos: iniciais,
  hoje,
  unidades,
  setores,
  categorias,
  manutencao = false,
  categoriaPadrao,
  membros,
  podeMudarPrivado,
}: {
  empresaId: string;
  alerta: Alerta | null;
  // alerta de origem de "Salvar e copiar" (formulário novo pré-preenchido)
  modelo?: Alerta | null;
  podeMudarPrivado: boolean;
  avisos: AlertaAviso[];
  hoje: string;
  unidades: Opcao[];
  setores: Opcao[];
  categorias: Opcao[];
  manutencao?: boolean;
  categoriaPadrao?: string;
  membros: (Opcao & { setor_id: string | null })[];
}) {
  const [estado, acaoForm] = useActionState(salvarAlerta.bind(null, empresaId), undefined);
  const base = alerta ?? modelo;
  // o aviso de visibilidade reenvia o formulário sem o botão clicado; por isso a escolha vai num campo oculto
  const continuar = useRef<HTMLInputElement>(null);
  const marcar = (v: string) => continuar.current && (continuar.current.value = v);
  const [avisos, setAvisos] = useState<LinhaAviso[]>(
    iniciais.length
      ? iniciais.map((a) => ({
          // na cópia os avisos são novos (sem id), para não mexer nos da ação de origem
          id: modelo ? undefined : a.id,
          dias_antes: a.dias_antes,
          titulo: a.titulo,
          responsaveis: a.responsaveis,
          cientes: a.cientes,
        }))
      : [{ dias_antes: 30, titulo: "", responsaveis: [], cientes: [] }],
  );
  const regraAtual = base?.recorrencia ?? "";

  const mudar = (i: number, campo: Partial<LinhaAviso>) =>
    setAvisos((xs) => xs.map((x, j) => (j === i ? { ...x, ...campo } : x)));

  return (
    <form action={acaoForm} className="space-y-4">
      <input ref={continuar} type="hidden" name="continuar" defaultValue="" />
      {alerta && <input type="hidden" name="id" value={alerta.id} />}
      {manutencao && <input type="hidden" name="manutencao" value="1" />}
      <input type="hidden" name="avisos" value={JSON.stringify(avisos)} />

      <Cartao className="space-y-4">
        <Campo rotulo="O que vence ou acontece">
          <Input name="nome" defaultValue={modelo ? `Cópia de ${modelo.nome}` : base?.nome} autoFocus={!!modelo} onFocus={(e) => modelo && e.currentTarget.select()} placeholder="Ex.: Vencimento do alvará" required />
        </Campo>
        <Campo rotulo="Detalhes">
          <Textarea
            name="descricao"
            rows={2}
            defaultValue={base?.descricao ?? ""}
            placeholder="Ex.: protocolo, contato do despachante"
          />
        </Campo>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Data do vencimento">
            <CampoData name="data_evento" defaultValue={base?.data_evento ?? hoje} required />
          </Campo>
          <Campo rotulo="Repetir">
            <SeletorRecorrencia inicial={regraAtual} permitirNenhuma />
          </Campo>
          <Campo rotulo="Horário" dica="Hora em que as tarefas aparecem">
            <Input type="time" name="horario" defaultValue={base?.horario?.slice(0, 5) ?? "09:00"} required />
          </Campo>
          <Campo rotulo="Responsável padrão">
            <Select name="responsavel_id" defaultValue={base?.responsavel_id ?? ""}>
              <option value="">—</option>
              {membros.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome}
                </option>
              ))}
            </Select>
          </Campo>
          <Campo rotulo="Unidade">
            <Select
              name="unidade_id"
              defaultValue={base?.unidade_id ?? (unidades.length === 1 ? unidades[0].id : "")}
            >
              <option value="">Empresa toda</option>
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
            <Select name="categoria_id" defaultValue={base?.categoria_id ?? categoriaPadrao ?? ""}>
              <option value="">—</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Select>
          </Campo>
          <CampoVisibilidade privado={base?.privado} podeMudar={podeMudarPrivado} perguntar={!base} />
          {alerta && (
            <Campo rotulo="Situação">
              <Select name="ativo" defaultValue={String(alerta.ativo)}>
                <option value="true">Ativo</option>
                <option value="false">Inativo (para de criar tarefas)</option>
              </Select>
            </Campo>
          )}
        </div>
      </Cartao>

      <Cartao className="space-y-3">
        <div>
          <h2 className="font-medium">Avisos</h2>
          <p className="text-xs text-slate-500">
            Cada aviso cria uma tarefa no Kanban com antecedência. O prazo da tarefa é a própria data. Com
            várias pessoas no aviso, a tarefa é uma só para todas. Remover um aviso apaga a tarefa dele que
            ainda não começou.
          </p>
        </div>
        {avisos.map((a, i) => (
          <div key={a.id ?? `novo-${i}`} className="space-y-3 rounded-lg border border-slate-200 p-3">
            <div className="grid gap-2 sm:grid-cols-[7rem_1fr_auto] sm:items-end">
              <Campo rotulo="Dias antes">
                <Input
                  type="number"
                  min={0}
                  max={365}
                  value={a.dias_antes}
                  onChange={(e) => mudar(i, { dias_antes: Number(e.target.value) })}
                  required
                />
              </Campo>
              <Campo rotulo="Tarefa">
                <Input
                  value={a.titulo}
                  onChange={(e) => mudar(i, { titulo: e.target.value })}
                  placeholder="Ex.: Pedir renovação ao despachante"
                  required
                />
              </Campo>
              <button
                type="button"
                className="pb-2 text-sm text-red-600 disabled:opacity-30"
                disabled={avisos.length === 1}
                onClick={() => setAvisos((xs) => xs.filter((_, j) => j !== i))}
              >
                Remover
              </button>
            </div>
            <SeletorResponsaveis
              membros={membros}
              setores={setores}
              valor={a.responsaveis}
              onChange={(ids) => mudar(i, { responsaveis: ids })}
              vazio="Responsável padrão"
            />
            <SeletorResponsaveis
              rotulo="Avisar também (ciente)"
              membros={membros}
              setores={setores}
              valor={a.cientes}
              onChange={(ids) => mudar(i, { cientes: ids })}
              vazio="Ninguém além dos responsáveis"
            />
          </div>
        ))}
        <Botao
          type="button"
          variante="secundario"
          onClick={() => setAvisos((xs) => [...xs, { dias_antes: 7, titulo: "", responsaveis: [], cientes: [] }])}
        >
          + Aviso
        </Botao>
      </Cartao>

      {estado?.erro && <Aviso>{estado.erro}</Aviso>}
      <div className="flex justify-between">
        <div className="flex flex-wrap gap-2">
          <BotaoEnviar onClick={() => marcar("")}>Salvar ação</BotaoEnviar>
          <BotaoEnviar variante="secundario" onClick={() => marcar("1")}>
            Salvar e copiar
          </BotaoEnviar>
        </div>
        {alerta && (
          <Botao
            type="button"
            variante="perigo"
            onClick={() =>
              confirm("Excluir esta ação? As tarefas já criadas continuam no Kanban.") &&
              excluirAlerta(empresaId, alerta.id)
            }
          >
            Excluir
          </Botao>
        )}
      </div>
    </form>
  );
}
