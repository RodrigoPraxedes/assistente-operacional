"use client";

import { useActionState } from "react";
import { salvarItem } from "./actions";
import { trocarPorReduzidas } from "@/lib/foto";
import { SITUACOES_PATRIMONIO, TIPOS_PATRIMONIO, type Equipamento } from "@/lib/types";
import { Aviso, Campo, Cartao, Input, Select, Textarea } from "@/components/ui";
import { BotaoEnviar } from "@/components/botao-enviar";

type Opcao = { id: string; nome: string };

export function FormItem({
  empresaId,
  item,
  unidades,
  setores,
}: {
  empresaId: string;
  item?: Equipamento;
  unidades: Opcao[];
  setores: Opcao[];
}) {
  const [estado, acao] = useActionState(salvarItem.bind(null, empresaId, item?.id ?? null), undefined);

  return (
    <form action={acao} className="space-y-4">
      <Cartao className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Nome">
            <Input name="nome" defaultValue={item?.nome} placeholder="Ex.: Freezer horizontal 1" required />
          </Campo>
          <Campo rotulo="Tipo">
            <Select name="tipo" defaultValue={item?.tipo ?? "equipamento"}>
              {Object.entries(TIPOS_PATRIMONIO).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Campo>
          <Campo rotulo="Nº de patrimônio ou série">
            <Input name="codigo" defaultValue={item?.codigo ?? ""} />
          </Campo>
          <Campo rotulo="Marca">
            <Input name="marca" defaultValue={item?.marca ?? ""} />
          </Campo>
          <Campo rotulo="Modelo">
            <Input name="modelo" defaultValue={item?.modelo ?? ""} />
          </Campo>
          <Campo rotulo="Setor">
            <Select name="setor_id" defaultValue={item?.setor_id ?? ""}>
              <option value="">—</option>
              {setores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </Select>
          </Campo>
          {!item && (
            <>
              <Campo rotulo="Unidade">
                <Select name="unidade_id" defaultValue={unidades.length === 1 ? unidades[0].id : ""}>
                  <option value="">Sem unidade</option>
                  {unidades.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nome}
                    </option>
                  ))}
                </Select>
              </Campo>
              <Campo rotulo="Situação">
                <Select name="situacao" defaultValue="em_uso">
                  {(["em_uso", "em_manutencao", "parado"] as const).map((k) => (
                    <option key={k} value={k}>
                      {SITUACOES_PATRIMONIO[k].rotulo}
                    </option>
                  ))}
                </Select>
              </Campo>
            </>
          )}
        </div>
      </Cartao>

      <Cartao className="space-y-4">
        <h2 className="font-medium">Compra</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Data da compra">
            <Input name="data_compra" type="date" defaultValue={item?.data_compra ?? ""} />
          </Campo>
          <Campo rotulo="Valor (R$)">
            <Input name="valor_compra" type="number" step="0.01" min="0" defaultValue={item?.valor_compra ?? ""} />
          </Campo>
          <Campo rotulo="Comprado de">
            <Input name="comprado_de" defaultValue={item?.comprado_de ?? ""} placeholder="Loja ou fornecedor" />
          </Campo>
          <Campo rotulo="Nota fiscal">
            <Input name="nota_fiscal" defaultValue={item?.nota_fiscal ?? ""} />
          </Campo>
          <Campo rotulo="Garantia até">
            <Input name="garantia_ate" type="date" defaultValue={item?.garantia_ate ?? ""} />
          </Campo>
        </div>
        <Campo rotulo="Observações">
          <Textarea name="observacao" rows={2} defaultValue={item?.observacao ?? ""} />
        </Campo>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">{item?.foto_path ? "Trocar foto" : "Foto"}</span>
          <input
            type="file"
            name="foto"
            accept="image/*"
            className="mt-1 block w-full text-sm"
            onChange={(e) => trocarPorReduzidas(e.currentTarget)}
          />
        </label>
      </Cartao>

      {estado?.erro && <Aviso>{estado.erro}</Aviso>}
      <BotaoEnviar>{item ? "Salvar" : "Cadastrar"}</BotaoEnviar>
    </form>
  );
}
