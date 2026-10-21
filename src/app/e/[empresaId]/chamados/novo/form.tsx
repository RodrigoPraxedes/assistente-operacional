"use client";

import { useActionState } from "react";
import { abrirChamado } from "../actions";
import { trocarPorReduzidas } from "@/lib/foto";
import { PRIORIDADES } from "@/lib/types";
import { Aviso, Campo, Cartao, Input, Select, Textarea } from "@/components/ui";
import { SeletorPrestador } from "@/components/seletor-prestador";
import { SeletorComBusca } from "@/components/seletor-com-busca";
import { BotaoEnviar } from "@/components/botao-enviar";

type Opcao = { id: string; nome: string };

export function FormChamado({
  empresaId,
  gerencia,
  sla,
  unidades,
  setores,
  categorias,
  equipamentos,
  membros,
  fornecedores,
  podeCadastrarPrestador,
  equipamentoInicial,
  unidadeInicial,
}: {
  empresaId: string;
  gerencia: boolean;
  sla: Record<string, number>;
  unidades: Opcao[];
  setores: Opcao[];
  categorias: Opcao[];
  equipamentos: Opcao[];
  membros: Opcao[];
  fornecedores: Opcao[];
  podeCadastrarPrestador: boolean;
  equipamentoInicial?: string;
  unidadeInicial?: string;
}) {
  const [estado, acao] = useActionState(abrirChamado.bind(null, empresaId), undefined);
  const opcoes = (lista: Opcao[], vazio = "—") => (
    <>
      <option value="">{vazio}</option>
      {lista.map((o) => (
        <option key={o.id} value={o.id}>
          {o.nome}
        </option>
      ))}
    </>
  );

  return (
    <form action={acao} className="space-y-4">
      <Cartao className="space-y-4">
        <Campo rotulo="Qual é o problema?">
          <Input name="titulo" placeholder="Ex.: Freezer não está gelando" required />
        </Campo>
        <Campo rotulo="Detalhes">
          <Textarea name="descricao" rows={3} placeholder="Desde quando, o que já foi tentado..." />
        </Campo>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Prioridade" dica="Define o prazo de atendimento">
            <Select name="prioridade" defaultValue="media">
              {Object.entries(PRIORIDADES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.rotulo} {sla[k] ? `(prazo ${sla[k]}h)` : ""}
                </option>
              ))}
            </Select>
          </Campo>
          <Campo rotulo="Unidade">
            <Select name="unidade_id" defaultValue={unidadeInicial ?? (unidades.length === 1 ? unidades[0].id : "")} required>
              {opcoes(unidades, "Escolha...")}
            </Select>
          </Campo>
          <div className="space-y-1">
            <span className="text-sm font-medium text-slate-700">Equipamento ou móvel</span>
            <SeletorComBusca name="equipamento_id" opcoes={equipamentos} inicial={equipamentoInicial ?? ""} />
            <span className="block text-xs text-slate-500">Do patrimônio; o chamado entra no histórico do item</span>
          </div>
          <Campo rotulo="Local" dica="Ex.: cozinha, banheiro dos clientes">
            <Input name="local" />
          </Campo>
          <Campo rotulo="Setor">
            <Select name="setor_id">{opcoes(setores)}</Select>
          </Campo>
          <Campo rotulo="Categoria">
            <Select name="categoria_id">{opcoes(categorias)}</Select>
          </Campo>
          {gerencia && (
            <>
              <Campo rotulo="Responsável interno">
                <Select name="responsavel_id">{opcoes(membros)}</Select>
              </Campo>
              <Campo rotulo="Prestador de serviço">
                <SeletorPrestador empresaId={empresaId} opcoes={fornecedores} podeCadastrar={podeCadastrarPrestador} />
              </Campo>
            </>
          )}
        </div>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Fotos</span>
          <input
            type="file"
            name="fotos"
            accept="image/*"
            multiple
            className="mt-1 block w-full text-sm"
            onChange={(e) => trocarPorReduzidas(e.currentTarget)}
          />
        </label>
      </Cartao>
      {estado?.erro && <Aviso>{estado.erro}</Aviso>}
      <BotaoEnviar pendente="Abrindo...">Abrir chamado</BotaoEnviar>
    </form>
  );
}
