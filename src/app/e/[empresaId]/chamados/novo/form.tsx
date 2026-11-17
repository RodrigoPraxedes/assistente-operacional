"use client";

import { useActionState, useCallback, useState } from "react";
import { abrirChamado } from "../actions";
import { trocarPorReduzidas } from "@/lib/foto";
import { PRIORIDADES } from "@/lib/types";
import { Aviso, Campo, Cartao, Input, Select, Textarea } from "@/components/ui";
import { SeletorPrestador } from "@/components/seletor-prestador";
import { SeletorComBusca } from "@/components/seletor-com-busca";
import { LeitorCodigo } from "@/components/leitor-codigo";
import { BotaoEnviar } from "@/components/botao-enviar";

type Opcao = { id: string; nome: string };
type OpcaoEquip = Opcao & { codigo?: string | null; unidade_id?: string | null };

const normCodigo = (c: string) => c.trim().toLowerCase().replace(/^0+(?=.)/, "");

export function FormChamado({
  empresaId,
  gerencia,
  centralAtiva,
  sla,
  unidades,
  setores,
  equipamentos,
  membros,
  fornecedores,
  podeCadastrarPrestador,
  equipamentoInicial,
  unidadeInicial,
}: {
  empresaId: string;
  gerencia: boolean;
  centralAtiva: boolean;
  sla: Record<string, number>;
  unidades: Opcao[];
  setores: Opcao[];
  equipamentos: OpcaoEquip[];
  membros: Opcao[];
  fornecedores: Opcao[];
  podeCadastrarPrestador: boolean;
  equipamentoInicial?: string;
  unidadeInicial?: string;
}) {
  const [estado, acao] = useActionState(abrirChamado.bind(null, empresaId), undefined);
  const [equip, setEquip] = useState(equipamentoInicial ?? "");
  const [unidade, setUnidade] = useState(unidadeInicial ?? (unidades.length === 1 ? unidades[0].id : ""));
  const [leitura, setLeitura] = useState("");
  const aoLer = useCallback(
    (codigo: string) => {
      const achado = equipamentos.find((e) => e.codigo && normCodigo(e.codigo) === normCodigo(codigo));
      if (achado) {
        setEquip(achado.id);
        if (achado.unidade_id) setUnidade(achado.unidade_id);
        setLeitura(`Equipamento encontrado: ${achado.nome}`);
      } else {
        setLeitura(`Nenhum equipamento com o código ${codigo}. Escolha na lista ou cadastre no Patrimônio.`);
      }
    },
    [equipamentos],
  );
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
            <Select name="unidade_id" value={unidade} onChange={(e) => setUnidade(e.target.value)} required>
              {opcoes(unidades, "Escolha...")}
            </Select>
          </Campo>
          <div className="space-y-1">
            <span className="text-sm font-medium text-slate-700">Equipamento ou móvel</span>
            <SeletorComBusca key={equip} name="equipamento_id" opcoes={equipamentos} inicial={equip} />
            <LeitorCodigo onLido={aoLer} />
            {leitura && <span className="block text-xs text-slate-600">{leitura}</span>}
            <span className="block text-xs text-slate-500">Do patrimônio; o chamado entra no histórico do item</span>
          </div>
          <Campo rotulo="Setor">
            <Select name="setor_id">{opcoes(setores)}</Select>
          </Campo>
          {gerencia && !centralAtiva && (
            <Campo rotulo="Responsável interno">
              <Select name="responsavel_id">{opcoes(membros)}</Select>
            </Campo>
          )}
          {gerencia && (
            <Campo rotulo="Prestador de serviço">
              <SeletorPrestador empresaId={empresaId} opcoes={fornecedores} podeCadastrar={podeCadastrarPrestador} />
            </Campo>
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
