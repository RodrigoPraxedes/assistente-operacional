import { HORIZONTES, SITUACOES_PLANO, type Horizonte, type Plano, type SituacaoPlano } from "@/lib/types";
import { Campo, Cartao, Input, Select, Textarea } from "@/components/ui";
import { BotaoEnviar } from "@/components/botao-enviar";
import { CampoVisibilidade } from "@/components/campo-visibilidade";
import { salvarPlano } from "./actions";

type Opcao = { id: string; nome: string };

export function FormPlano({
  empresaId,
  plano,
  unidades,
  setores,
  categorias,
  membros,
  podeMudarPrivado,
}: {
  empresaId: string;
  plano: Plano | null;
  podeMudarPrivado: boolean;
  unidades: Opcao[];
  setores: Opcao[];
  categorias: Opcao[];
  membros: Opcao[];
}) {
  const opcoes = (lista: Opcao[], vazio: string) => (
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
    <form action={salvarPlano.bind(null, empresaId, plano?.id ?? null)} className="space-y-4">
      <Cartao className="space-y-4">
        <Campo rotulo="Nome do projeto">
          <Input name="nome" defaultValue={plano?.nome} placeholder="Ex.: Reforma do letreiro" required />
        </Campo>
        <Campo rotulo="Objetivo" dica="O que se quer alcançar e por quê">
          <Textarea
            name="objetivo"
            rows={3}
            defaultValue={plano?.objetivo ?? ""}
            placeholder="Ex.: trocar o letreiro da fachada por um iluminado em LED, dentro do orçamento de R$ 15 mil"
          />
        </Campo>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Prazo do projeto">
            <Select name="horizonte" defaultValue={plano?.horizonte ?? "medio"}>
              {(Object.keys(HORIZONTES) as Horizonte[]).map((h) => (
                <option key={h} value={h}>
                  {HORIZONTES[h].rotulo} ({HORIZONTES[h].dica})
                </option>
              ))}
            </Select>
          </Campo>
          <Campo rotulo="Coordenador">
            <Select name="responsavel_id" defaultValue={plano?.responsavel_id ?? ""}>
              {opcoes(membros, "—")}
            </Select>
          </Campo>
          <Campo rotulo="Início">
            <Input type="date" name="inicio" defaultValue={plano?.inicio ?? ""} />
          </Campo>
          <Campo rotulo="Término previsto">
            <Input type="date" name="fim_previsto" defaultValue={plano?.fim_previsto ?? ""} />
          </Campo>
          <Campo rotulo="Unidade">
            <Select
              name="unidade_id"
              defaultValue={plano ? (plano.unidade_id ?? "") : unidades.length === 1 ? unidades[0].id : ""}
            >
              {opcoes(unidades, "Empresa toda")}
            </Select>
          </Campo>
          <Campo rotulo="Setor">
            <Select name="setor_id" defaultValue={plano?.setor_id ?? ""}>
              {opcoes(setores, "—")}
            </Select>
          </Campo>
          <Campo rotulo="Categoria">
            <Select name="categoria_id" defaultValue={plano?.categoria_id ?? ""}>
              {opcoes(categorias, "—")}
            </Select>
          </Campo>
          <CampoVisibilidade
            privado={plano?.privado}
            podeMudar={podeMudarPrivado}
            perguntar={!plano}
            quemVe="você, o coordenador e quem está nas etapas"
          />
          {plano && (
            <Campo rotulo="Situação">
              <Select name="situacao" defaultValue={plano.situacao}>
                {(Object.keys(SITUACOES_PLANO) as SituacaoPlano[]).map((s) => (
                  <option key={s} value={s}>
                    {SITUACOES_PLANO[s].rotulo}
                  </option>
                ))}
              </Select>
            </Campo>
          )}
        </div>
      </Cartao>
      <BotaoEnviar>{plano ? "Salvar" : "Criar projeto"}</BotaoEnviar>
    </form>
  );
}
