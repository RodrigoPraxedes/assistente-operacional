"use client";

import { useActionState, useState } from "react";
import { criarTarefa } from "../actions";
import { Aviso, Campo, Input, Select, Textarea } from "@/components/ui";
import { BotaoEnviar } from "@/components/botao-enviar";
import { CampoVisibilidade } from "@/components/campo-visibilidade";
import { SeletorResponsaveis } from "@/components/seletor-responsaveis";
import { CampoTodosConcluem } from "@/components/campo-todos-concluem";
import { CampoData } from "@/components/campo-data";
import { SeletorDias, somarDias } from "@/components/seletor-dias";

type Opcao = { id: string; nome: string };

export function FormTarefa({
  empresaId,
  hoje,
  unidades,
  setores,
  categorias,
  membros,
}: {
  empresaId: string;
  hoje: string;
  unidades: Opcao[];
  setores: Opcao[];
  categorias: Opcao[];
  membros: (Opcao & { setor_id: string | null })[];
}) {
  const [estado, acao] = useActionState(criarTarefa.bind(null, empresaId), undefined);
  const [inicio, setInicio] = useState(hoje);
  const [dias, setDias] = useState("0");
  const [horario, setHorario] = useState("18:00");
  // o servidor continua recebendo um único "prazo" (data e hora locais)
  const prazo = !inicio || !horario ? "" : `${somarDias(inicio, Number(dias))}T${horario}`;
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
      <CampoTodosConcluem />
      <SeletorResponsaveis
        rotulo="Avisar também (ciente)"
        name="cientes"
        membros={membros}
        setores={setores}
        vazio="Ninguém além dos responsáveis"
        dica="Recebem o aviso no WhatsApp e enxergam a tarefa, mas não são responsáveis nem precisam concluir"
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Inicia em">
          <CampoData value={inicio} onChange={setInicio} required />
        </Campo>
        <Campo rotulo="Prazo" dica="Dias depois da data de início">
          <input type="hidden" name="prazo" value={prazo} />
          <SeletorDias value={dias} onChange={setDias} />
        </Campo>
        <Campo rotulo="Horário" dica="Hora em que a tarefa vence">
          <Input type="time" value={horario} onChange={(e) => setHorario(e.target.value)} required />
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
        <CampoVisibilidade podeMudar perguntar />
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="exige_foto" className="mt-1" />
        <span>
          Exigir foto para concluir
          <span className="block text-xs text-slate-500">
            Só conclui com uma foto tirada na hora, pela câmera. Com várias pessoas, cada uma envia a sua.
          </span>
        </span>
      </label>
      {estado?.erro && <Aviso>{estado.erro}</Aviso>}
      <BotaoEnviar>Criar tarefa</BotaoEnviar>
    </form>
  );
}
