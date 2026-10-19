"use client";

import { useActionState, useState } from "react";
import { excluirAlerta, salvarAlerta } from "../actions";
import type { Alerta, AlertaAviso } from "@/lib/types";
import { Aviso, Botao, Campo, Cartao, Input, Select, Textarea } from "@/components/ui";
import { BotaoEnviar } from "@/components/botao-enviar";
import { CampoVisibilidade } from "@/components/campo-visibilidade";
import { SeletorResponsaveis } from "@/components/seletor-responsaveis";

type Opcao = { id: string; nome: string };
type LinhaAviso = {
  id?: string;
  dias_antes: number;
  titulo: string;
  responsaveis: string[];
  cientes: string[];
};

// datas importantes costumam ser anuais ou únicas; mensal cobre contas e taxas
const REPETICOES = [
  { regra: "", rotulo: "Não repete (uma vez só)" },
  { regra: "FREQ=YEARLY", rotulo: "Todo ano" },
  { regra: "FREQ=MONTHLY;INTERVAL=6", rotulo: "A cada 6 meses" },
  { regra: "FREQ=MONTHLY;INTERVAL=3", rotulo: "A cada 3 meses" },
  { regra: "FREQ=MONTHLY", rotulo: "Todo mês" },
];

export function FormAlerta({
  empresaId,
  alerta,
  avisos: iniciais,
  hoje,
  unidades,
  setores,
  categorias,
  membros,
  podeMudarPrivado,
}: {
  empresaId: string;
  alerta: Alerta | null;
  podeMudarPrivado: boolean;
  avisos: AlertaAviso[];
  hoje: string;
  unidades: Opcao[];
  setores: Opcao[];
  categorias: Opcao[];
  membros: (Opcao & { setor_id: string | null })[];
}) {
  const [estado, acaoForm] = useActionState(salvarAlerta.bind(null, empresaId), undefined);
  const [avisos, setAvisos] = useState<LinhaAviso[]>(
    iniciais.length
      ? iniciais.map((a) => ({
          id: a.id,
          dias_antes: a.dias_antes,
          titulo: a.titulo,
          responsaveis: a.responsaveis,
          cientes: a.cientes,
        }))
      : [{ dias_antes: 30, titulo: "", responsaveis: [], cientes: [] }],
  );
  const regraAtual = alerta?.recorrencia ?? "";
  const repeticoes = REPETICOES.some((r) => r.regra === regraAtual)
    ? REPETICOES
    : [...REPETICOES, { regra: regraAtual, rotulo: regraAtual }];

  const mudar = (i: number, campo: Partial<LinhaAviso>) =>
    setAvisos((xs) => xs.map((x, j) => (j === i ? { ...x, ...campo } : x)));

  return (
    <form action={acaoForm} className="space-y-4">
      {alerta && <input type="hidden" name="id" value={alerta.id} />}
      <input type="hidden" name="avisos" value={JSON.stringify(avisos)} />

      <Cartao className="space-y-4">
        <Campo rotulo="O que vence ou acontece">
          <Input name="nome" defaultValue={alerta?.nome} placeholder="Ex.: Vencimento do alvará" required />
        </Campo>
        <Campo rotulo="Detalhes">
          <Textarea
            name="descricao"
            rows={2}
            defaultValue={alerta?.descricao ?? ""}
            placeholder="Ex.: protocolo, contato do despachante"
          />
        </Campo>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Data">
            <Input type="date" name="data_evento" defaultValue={alerta?.data_evento ?? hoje} required />
          </Campo>
          <Campo rotulo="Repetir">
            <Select name="recorrencia" defaultValue={regraAtual}>
              {repeticoes.map((r) => (
                <option key={r.regra} value={r.regra}>
                  {r.rotulo}
                </option>
              ))}
            </Select>
          </Campo>
          <Campo rotulo="Horário" dica="Hora em que as tarefas aparecem">
            <Input type="time" name="horario" defaultValue={alerta?.horario?.slice(0, 5) ?? "09:00"} required />
          </Campo>
          <Campo rotulo="Responsável padrão">
            <Select name="responsavel_id" defaultValue={alerta?.responsavel_id ?? ""}>
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
              defaultValue={alerta?.unidade_id ?? (unidades.length === 1 ? unidades[0].id : "")}
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
            <Select name="setor_id" defaultValue={alerta?.setor_id ?? ""}>
              <option value="">—</option>
              {setores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </Select>
          </Campo>
          <Campo rotulo="Categoria">
            <Select name="categoria_id" defaultValue={alerta?.categoria_id ?? ""}>
              <option value="">—</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Select>
          </Campo>
          <CampoVisibilidade privado={alerta?.privado} podeMudar={podeMudarPrivado} perguntar={!alerta} />
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
              vazio="Responsável padrão do alerta"
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
        <BotaoEnviar>Salvar alerta</BotaoEnviar>
        {alerta && (
          <Botao
            type="button"
            variante="perigo"
            onClick={() =>
              confirm("Excluir este alerta? As tarefas já criadas continuam no Kanban.") &&
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
