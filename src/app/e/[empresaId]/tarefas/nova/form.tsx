"use client";

import { useActionState } from "react";
import { criarTarefa } from "../actions";
import { Aviso, Campo, Input, Select, Textarea } from "@/components/ui";
import { BotaoEnviar } from "@/components/botao-enviar";
import { CampoVisibilidade } from "@/components/campo-visibilidade";
import { SeletorResponsaveis } from "@/components/seletor-responsaveis";

type Opcao = { id: string; nome: string };

export function FormTarefa({
  empresaId,
  unidades,
  setores,
  categorias,
  membros,
}: {
  empresaId: string;
  unidades: Opcao[];
  setores: Opcao[];
  categorias: Opcao[];
  membros: (Opcao & { setor_id: string | null })[];
}) {
  const [estado, acao] = useActionState(criarTarefa.bind(null, empresaId), undefined);
  return (
    <form action={acao} className="space-y-4">
      <Campo rotulo="O que precisa ser feito">
        <Input name="titulo" required />
      </Campo>
      <Campo rotulo="Detalhes">
        <Textarea name="descricao" rows={3} />
      </Campo>
      <SeletorResponsaveis
        name="responsaveis"
        membros={membros}
        setores={setores}
        dica="Uma ou mais pessoas: todas cuidam da mesma tarefa (um cartão só no Kanban)"
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Prazo">
          <Input type="datetime-local" name="prazo" />
        </Campo>
        <Campo rotulo="Unidade">
          <Select name="unidade_id" defaultValue={unidades.length === 1 ? unidades[0].id : ""}>
            <option value="">Empresa toda</option>
            {unidades.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome}
              </option>
            ))}
          </Select>
        </Campo>
        <Campo rotulo="Setor">
          <Select name="setor_id" defaultValue="">
            <option value="">—</option>
            {setores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome}
              </option>
            ))}
          </Select>
        </Campo>
        <Campo rotulo="Categoria">
          <Select name="categoria_id" defaultValue="">
            <option value="">—</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </Select>
        </Campo>
        <CampoVisibilidade podeMudar />
      </div>
      {estado?.erro && <Aviso>{estado.erro}</Aviso>}
      <BotaoEnviar>Criar tarefa</BotaoEnviar>
    </form>
  );
}
